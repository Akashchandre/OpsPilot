import { Server } from "socket.io";
import { resolveActiveSessionToken } from "../middleware/authenticate.js";
import { USER_STATUSES } from "../modules/auth/auth.constants.js";

const oneMinuteMilliseconds = 60_000;
const maximumLimiterEntries = 10_000;

function cookieValue(header, name) {
  if (typeof header !== "string" || header.length > 8192) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

function connectionError(code) {
  const error = new Error(code);
  error.data = { code };
  return error;
}

function createFixedWindowLimiter(maximum, now) {
  const windows = new Map();
  let operations = 0;
  return function consume(key) {
    const timestamp = now().getTime();
    operations += 1;
    if (operations % 1000 === 0 || windows.size >= maximumLimiterEntries) {
      for (const [entryKey, window] of windows) {
        if (window.resetAt <= timestamp) windows.delete(entryKey);
      }
    }
    const current = windows.get(key);
    if (!current || current.resetAt <= timestamp) {
      if (!current && windows.size >= maximumLimiterEntries) return false;
      windows.set(key, { count: 1, resetAt: timestamp + oneMinuteMilliseconds });
      return true;
    }
    current.count += 1;
    return current.count <= maximum;
  };
}

export async function attachNotificationGateway({
  httpServer,
  database,
  config,
  logger,
  dependencies = {},
}) {
  const now = dependencies.now ?? (() => new Date());
  const io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin,
      credentials: true,
      methods: ["GET", "POST"],
    },
    allowRequest: (request, callback) =>
      callback(null, request.headers.origin === config.corsOrigin),
    maxHttpBufferSize: 8192,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * oneMinuteMilliseconds,
      skipMiddlewares: false,
    },
  });
  const namespace = io.of("/notifications");
  const consumeHandshake = createFixedWindowLimiter(config.realtime.connectionRateLimitMax, now);
  const activeByUser = new Map();

  function reserveConnection(socket, userId) {
    activeByUser.set(userId, (activeByUser.get(userId) ?? 0) + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const remaining = Math.max(0, (activeByUser.get(userId) ?? 1) - 1);
      if (remaining === 0) activeByUser.delete(userId);
      else activeByUser.set(userId, remaining);
    };
    socket.data.releaseConnection = release;
    socket.conn.once("close", release);
  }

  namespace.use(async (socket, next) => {
    try {
      const origin = socket.handshake.headers.origin;
      const source = socket.handshake.address ?? "unknown";
      if (origin !== config.corsOrigin || !consumeHandshake(`source:${source}`)) {
        return next(connectionError("CONNECTION_NOT_ALLOWED"));
      }
      const token = cookieValue(socket.handshake.headers.cookie, config.auth.sessionCookieName);
      const authentication = await resolveActiveSessionToken(database, token, now());
      if (!authentication) return next(connectionError("AUTHENTICATION_REQUIRED"));
      const userId = authentication.user.id;
      if (!consumeHandshake(`user:${userId}`)) {
        return next(connectionError("CONNECTION_RATE_LIMITED"));
      }
      if ((activeByUser.get(userId) ?? 0) >= config.realtime.maxConnectionsPerUser) {
        return next(connectionError("CONNECTION_LIMIT_REACHED"));
      }
      socket.data.userId = userId;
      socket.data.sessionId = authentication.session.id;
      reserveConnection(socket, userId);
      return next();
    } catch {
      return next(connectionError("AUTHENTICATION_REQUIRED"));
    }
  });

  namespace.on("connection", (socket) => {
    const { userId, sessionId } = socket.data;
    void socket.join(`user:${userId}`);
    socket.onAny(() => socket.disconnect(true));

    const sessionCheck = setInterval(async () => {
      try {
        const session = await database.authSession.findUnique({
          where: { id: sessionId },
          select: { revokedAt: true, expiresAt: true, user: { select: { status: true } } },
        });
        if (
          !session ||
          session.revokedAt ||
          session.expiresAt <= now() ||
          session.user.status !== USER_STATUSES.ACTIVE
        ) {
          socket.disconnect(true);
        }
      } catch {
        socket.disconnect(true);
      }
    }, config.realtime.sessionRecheckSeconds * 1000);
    sessionCheck.unref?.();

    socket.on("disconnect", () => {
      clearInterval(sessionCheck);
      socket.data.releaseConnection();
    });
  });

  const latest = await database.notification.aggregate({ _max: { sequence: true } });
  let cursor = latest._max.sequence ?? 0n;
  let polling = false;
  const poll = async () => {
    if (polling) return;
    polling = true;
    try {
      let rows;
      do {
        rows = await database.notification.findMany({
          where: { sequence: { gt: cursor } },
          select: { id: true, sequence: true, recipientId: true },
          orderBy: { sequence: "asc" },
          take: 1000,
        });
        for (const notification of rows) {
          namespace.to(`user:${notification.recipientId}`).emit("notification.changed", {
            id: notification.id,
            cursor: notification.sequence.toString(),
          });
          cursor = notification.sequence;
        }
      } while (rows.length === 1000);
    } catch (error) {
      logger.log("warn", "realtime.notification_poll_failed", {
        errorClass: error?.constructor?.name ?? "Error",
        errorCode: typeof error?.code === "string" ? error.code : "NOTIFICATION_POLL_FAILED",
      });
    } finally {
      polling = false;
    }
  };
  const poller = setInterval(poll, config.realtime.notificationPollIntervalMs);
  poller.unref?.();

  return Object.freeze({
    io,
    namespace,
    async close() {
      clearInterval(poller);
      namespace.disconnectSockets(true);
      await new Promise((resolve) => io.close(resolve));
    },
  });
}
