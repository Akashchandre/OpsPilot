import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { io as createSocketClient } from "socket.io-client";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import { createJsonLogger } from "./logging/logger.js";
import { createOpaqueToken, digestToken } from "./modules/auth/auth.tokens.js";
import {
  attachNotificationGateway,
  notificationTransportPath,
} from "./realtime/notifications.gateway.js";

dotenv.config({ path: ".env.test", override: true, quiet: true });

const baseConfig = loadEnvironment();
const config = Object.freeze({
  ...baseConfig,
  realtime: Object.freeze({
    ...baseConfig.realtime,
    notificationPollIntervalMs: 25,
    sessionRecheckSeconds: 0.05,
    maxConnectionsPerUser: 2,
    connectionRateLimitMax: 20,
  }),
});
const database = createDatabase(config.databaseUrl);
const logger = createJsonLogger(config, { write() {} });
let httpServer;
let gateway;
let baseUrl;
const clients = [];

function waitForEvent(socket, event, timeoutMilliseconds = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      timeoutMilliseconds,
    );
    const listener = (...args) => {
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(args);
    };
    socket.on(event, listener);
  });
}

async function clearRealtimeData() {
  await database.notification.deleteMany();
  await database.supportTicketEvent.deleteMany();
  await database.supportTicketMessage.deleteMany();
  await database.supportTicket.deleteMany();
  await database.authSession.deleteMany();
  await database.userRole.deleteMany();
  await database.user.deleteMany();
}

async function createUserAndSession(suffix) {
  const user = await database.user.create({
    data: {
      email: `phase6-socket-${suffix}@example.com`,
      displayName: `Socket ${suffix}`,
      passwordHash: "not-used-by-this-test",
      roles: { create: { role: { connect: { code: "CUSTOMER" } } } },
    },
  });
  const token = createOpaqueToken();
  const session = await database.authSession.create({
    data: {
      userId: user.id,
      tokenHash: digestToken(token),
      csrfTokenHash: digestToken(createOpaqueToken()),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return { user, session, token };
}

async function createTicket(userId, suffix) {
  return database.supportTicket.create({
    data: {
      ticketNumber: `SP-RT-${suffix}`,
      requesterId: userId,
      category: "GENERAL",
      subject: "Socket isolation test",
      idempotencyKey: randomUUID(),
      requestHash: "b".repeat(64),
    },
  });
}

function connect(token, origin = config.corsOrigin) {
  const socket = createSocketClient(`${baseUrl}/notifications`, {
    path: notificationTransportPath,
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    extraHeaders: {
      Origin: origin,
      ...(token ? { Cookie: `${config.auth.sessionCookieName}=${token}` } : {}),
    },
  });
  clients.push(socket);
  return socket;
}

beforeEach(async () => {
  await clearRealtimeData();
  httpServer = createServer((_request, response) => response.end("ok"));
  gateway = await attachNotificationGateway({ httpServer, database, config, logger });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  if (gateway) await gateway.close();
  if (httpServer.listening) await new Promise((resolve) => httpServer.close(resolve));
});

afterAll(async () => {
  await clearRealtimeData();
  await database.$disconnect();
});

describe.sequential("Phase 6 notification realtime hints", () => {
  it("requires the exact origin and an active opaque session", async () => {
    const session = await createUserAndSession("auth");
    const missingSession = connect(null);
    const [missingError] = await waitForEvent(missingSession, "connect_error");
    expect(missingError.data).toEqual({ code: "AUTHENTICATION_REQUIRED" });

    const wrongOrigin = connect(session.token, "http://untrusted.example");
    await expect(waitForEvent(wrongOrigin, "connect_error")).resolves.toBeDefined();

    const valid = connect(session.token);
    await waitForEvent(valid, "connect");
    expect(valid.connected).toBe(true);
  });

  it("emits only a recipient-scoped hint and disconnects a revoked session", async () => {
    const first = await createUserAndSession("first");
    const second = await createUserAndSession("second");
    const ticket = await createTicket(first.user.id, "ONE");
    const firstSocket = connect(first.token);
    const secondSocket = connect(second.token);
    await Promise.all([
      waitForEvent(firstSocket, "connect"),
      waitForEvent(secondSocket, "connect"),
    ]);

    let leaked = false;
    secondSocket.on("notification.changed", () => {
      leaked = true;
    });
    const hint = waitForEvent(firstSocket, "notification.changed");
    const notification = await database.notification.create({
      data: {
        recipientId: first.user.id,
        type: "SUPPORT_STATUS_CHANGED",
        dedupeKey: `socket:${randomUUID()}`,
        metadata: { reference: ticket.ticketNumber, status: "OPEN", view: "SELF" },
        supportTicketId: ticket.id,
      },
    });
    const [payload] = await hint;
    expect(payload).toEqual({ id: notification.id, cursor: notification.sequence.toString() });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(leaked).toBe(false);

    const disconnected = waitForEvent(firstSocket, "disconnect");
    await database.authSession.update({
      where: { id: first.session.id },
      data: { revokedAt: new Date() },
    });
    await disconnected;
    expect(firstSocket.connected).toBe(false);
    expect(secondSocket.connected).toBe(true);
  });

  it("bounds duplicate connections and rejects inbound application events", async () => {
    const session = await createUserAndSession("limits");
    const first = connect(session.token);
    const second = connect(session.token);
    await Promise.all([waitForEvent(first, "connect"), waitForEvent(second, "connect")]);

    const third = connect(session.token);
    const [limitError] = await waitForEvent(third, "connect_error");
    expect(limitError.data).toEqual({ code: "CONNECTION_LIMIT_REACHED" });

    const disconnected = waitForEvent(first, "disconnect");
    first.emit("room.join", { room: "user:someone-else" });
    await disconnected;
    expect(first.connected).toBe(false);
  });

  it("rejects expired and disabled identities during the handshake", async () => {
    const expired = await createUserAndSession("expired");
    await database.authSession.update({
      where: { id: expired.session.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expiredSocket = connect(expired.token);
    const [expiredError] = await waitForEvent(expiredSocket, "connect_error");
    expect(expiredError.data).toEqual({ code: "AUTHENTICATION_REQUIRED" });

    const disabled = await createUserAndSession("disabled");
    await database.user.update({ where: { id: disabled.user.id }, data: { status: "DISABLED" } });
    const disabledSocket = connect(disabled.token);
    const [disabledError] = await waitForEvent(disabledSocket, "connect_error");
    expect(disabledError.data).toEqual({ code: "AUTHENTICATION_REQUIRED" });
  });

  it("admits a bounded reconnect storm and rejects excess source handshakes", async () => {
    const sessions = await Promise.all(
      Array.from({ length: config.realtime.connectionRateLimitMax + 1 }, (_, index) =>
        createUserAndSession(`storm-${index}`),
      ),
    );
    const admitted = sessions
      .slice(0, config.realtime.connectionRateLimitMax)
      .map((session) => connect(session.token));
    await Promise.all(admitted.map((socket) => waitForEvent(socket, "connect")));

    const overflow = connect(sessions.at(-1).token);
    const [overflowError] = await waitForEvent(overflow, "connect_error");
    expect(overflowError.data).toEqual({ code: "CONNECTION_NOT_ALLOWED" });
  });

  it("disconnects active clients during gateway shutdown", async () => {
    const session = await createUserAndSession("shutdown");
    const socket = connect(session.token);
    await waitForEvent(socket, "connect");
    const disconnected = waitForEvent(socket, "disconnect");
    await gateway.close();
    gateway = null;
    await disconnected;
    expect(socket.connected).toBe(false);
  });
});
