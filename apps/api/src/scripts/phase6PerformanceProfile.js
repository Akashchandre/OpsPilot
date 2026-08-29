import { createServer } from "node:http";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import request from "supertest";
import { io as createSocketClient } from "socket.io-client";
import { createApp } from "../app.js";
import { loadEnvironment } from "../config/env.js";
import { createDatabase } from "../db/prisma.js";
import { createOpaqueToken, digestToken } from "../modules/auth/auth.tokens.js";
import { JOB_TYPES } from "../modules/jobs/jobs.constants.js";
import { createJobQueue, enqueueJob } from "../modules/jobs/jobs.queue.js";
import { createNotificationMaterializer } from "../modules/notifications/notifications.materializer.js";
import { attachNotificationGateway } from "../realtime/notifications.gateway.js";

dotenv.config({ path: ".env.test", override: true, quiet: true });

const baselineNotificationCount = 10_000;
const runId = randomUUID();
const prefix = `phase6-perf:${runId}`;

function output(event, fields = {}) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields }));
}

function assertSafeTarget(config) {
  const databaseName = new URL(config.databaseUrl).pathname.replace(/^\//, "");
  if (config.nodeEnv === "production" || !/(?:_test|_perf)$/.test(databaseName)) {
    throw new Error("Phase 6 profiling is allowed only in an isolated _test or _perf database");
  }
  return databaseName;
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)];
}

async function profile(name, operation, { warmups = 3, samples = 30, targetMs }) {
  for (let index = 0; index < warmups; index += 1) await operation();
  const durations = [];
  for (let index = 0; index < samples; index += 1) {
    const startedAt = performance.now();
    await operation();
    durations.push(performance.now() - startedAt);
  }
  const result = {
    name,
    warmups,
    samples,
    p50Ms: Number(percentile(durations, 0.5).toFixed(3)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(3)),
    maximumMs: Number(Math.max(...durations).toFixed(3)),
    targetMs,
  };
  output("performance.profile", { ...result, targetMet: result.p95Ms < targetMs });
  return result;
}

function waitForSocketEvent(socket, event, timeoutMilliseconds = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      timeoutMilliseconds,
    );
    socket.once(event, (...arguments_) => {
      clearTimeout(timer);
      resolve(arguments_);
    });
  });
}

async function seedNotifications(database, userId, supportTicketId, ticketNumber) {
  for (let start = 0; start < baselineNotificationCount; start += 1000) {
    const size = Math.min(1000, baselineNotificationCount - start);
    await database.notification.createMany({
      data: Array.from({ length: size }, (_, offset) => ({
        recipientId: userId,
        type: "SUPPORT_STATUS_CHANGED",
        dedupeKey: `${prefix}:baseline:${start + offset}`,
        metadata: { reference: ticketNumber, status: "OPEN", view: "SELF" },
        supportTicketId,
      })),
    });
  }
}

const baseConfig = loadEnvironment();
const databaseName = assertSafeTarget(baseConfig);
const config = Object.freeze({
  ...baseConfig,
  realtime: Object.freeze({
    ...baseConfig.realtime,
    notificationPollIntervalMs: 25,
    sessionRecheckSeconds: 30,
  }),
});
const database = createDatabase(config.databaseUrl);
let gateway;
let httpServer;
let socket;
let workerId;
let user;
let ticket;

try {
  user = await database.user.create({
    data: {
      email: `${prefix}@example.invalid`,
      displayName: "Phase 6 Performance",
      passwordHash: "synthetic-performance-data-not-for-authentication",
      roles: { create: { role: { connect: { code: "CUSTOMER" } } } },
    },
  });
  ticket = await database.supportTicket.create({
    data: {
      ticketNumber: `SP-P6-${runId.slice(0, 8)}`,
      requesterId: user.id,
      category: "GENERAL",
      subject: "Synthetic Phase 6 performance resource",
      idempotencyKey: randomUUID(),
      requestHash: "e".repeat(64),
    },
  });
  const sessionToken = createOpaqueToken();
  await database.authSession.create({
    data: {
      userId: user.id,
      tokenHash: digestToken(sessionToken),
      csrfTokenHash: digestToken(createOpaqueToken()),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  await seedNotifications(database, user.id, ticket.id, ticket.ticketNumber);

  output("performance.context", {
    databaseName,
    node: process.version,
    mysql: (await database.$queryRaw`SELECT VERSION() AS version`)[0]?.version,
    platform: `${process.platform}-${process.arch}`,
    cpuModel: os.cpus()[0]?.model,
    cpuCount: os.cpus().length,
    memoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
    baselineNotificationCount,
  });

  const app = createApp({ config, database, logger: { log() {} } });
  const cookie = `${config.auth.sessionCookieName}=${sessionToken}`;
  const listOperation = async () => {
    const response = await request(app)
      .get("/api/v1/notifications?limit=100")
      .set("Cookie", cookie);
    if (response.status !== 200 || response.body.data.notifications.length !== 100) {
      throw new Error(`Notification list profile returned ${response.status}`);
    }
  };
  const unreadOperation = async () => {
    const response = await request(app)
      .get("/api/v1/notifications/unread-count")
      .set("Cookie", cookie);
    if (response.status !== 200 || response.body.data.unreadCount < baselineNotificationCount) {
      throw new Error(`Unread-count profile returned ${response.status}`);
    }
  };

  const queue = createJobQueue(database, config);
  workerId = await queue.registerWorker();
  await queue.activateWorker(workerId);
  let queueSample = 0;
  const queueOperation = async () => {
    const index = queueSample;
    queueSample += 1;
    const result = await database.$transaction((transaction) =>
      enqueueJob(transaction, config, {
        type: JOB_TYPES.AUDIT_CHAIN_VERIFY,
        dedupeKey: `${prefix}:queue:${index}`,
        payload: { bucket: "2026-08-29" },
        availableAt: new Date(0),
      }),
    );
    const [claimed] = await queue.claim(workerId, 1);
    if (claimed?.id !== result.job.id) throw new Error("Queue profile claimed unexpected work");
    await queue.complete(claimed, workerId);
  };

  const materializer = createNotificationMaterializer(database);
  const materializerJobs = [];
  for (let index = 0; index < 33; index += 1) {
    const event = await database.supportTicketEvent.create({
      data: {
        ticketId: ticket.id,
        eventType: "STATUS_CHANGED",
        source: "SYSTEM",
        fromStatus: "OPEN",
        toStatus: "OPEN",
        reasonCode: "PERFORMANCE_SAMPLE",
      },
    });
    materializerJobs.push({
      type: JOB_TYPES.NOTIFICATION_SUPPORT_STATUS_CHANGED,
      schemaVersion: 1,
      payload: { sourceEventId: event.id, supportTicketId: ticket.id },
    });
  }
  let materializerSample = 0;
  const materializerOperation = async () => {
    const created = await materializer.materialize(materializerJobs[materializerSample]);
    materializerSample += 1;
    if (created !== 1) throw new Error("Materializer profile did not create one notification");
  };

  httpServer = createServer((_request, response) => response.end("ok"));
  gateway = await attachNotificationGateway({
    httpServer,
    database,
    config,
    logger: { log() {} },
  });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  socket = createSocketClient(`${baseUrl}/notifications`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    extraHeaders: {
      Origin: config.corsOrigin,
      Cookie: cookie,
    },
  });
  await waitForSocketEvent(socket, "connect");
  let socketSample = 0;
  const socketOperation = async () => {
    const hint = waitForSocketEvent(socket, "notification.changed");
    await database.notification.create({
      data: {
        recipientId: user.id,
        type: "SUPPORT_STATUS_CHANGED",
        dedupeKey: `${prefix}:socket:${socketSample}`,
        metadata: { reference: ticket.ticketNumber, status: "OPEN", view: "SELF" },
        supportTicketId: ticket.id,
      },
    });
    socketSample += 1;
    await hint;
  };

  const results = [
    await profile("notification-list-api", listOperation, { targetMs: 300 }),
    await profile("notification-unread-api", unreadOperation, { targetMs: 300 }),
    await profile("committed-job-visible-to-worker", queueOperation, { targetMs: 1000 }),
    await profile("persistent-notification-materialized", materializerOperation, {
      targetMs: 5000,
    }),
    await profile("connected-client-hint", socketOperation, {
      warmups: 2,
      samples: 20,
      targetMs: 2000,
    }),
  ];
  if (results.some((result) => result.p95Ms >= result.targetMs)) process.exitCode = 1;
} finally {
  socket?.close();
  if (gateway) await gateway.close();
  if (httpServer?.listening) await new Promise((resolve) => httpServer.close(resolve));
  await database.notification.deleteMany({
    where: user ? { recipientId: user.id } : { dedupeKey: { startsWith: prefix } },
  });
  await database.backgroundJobAttempt.deleteMany({
    where: { job: { dedupeKey: { startsWith: prefix } } },
  });
  await database.backgroundJob.deleteMany({ where: { dedupeKey: { startsWith: prefix } } });
  if (workerId) await database.workerHeartbeat.deleteMany({ where: { id: workerId } });
  if (ticket) {
    await database.supportTicketEvent.deleteMany({ where: { ticketId: ticket.id } });
    await database.supportTicket.deleteMany({ where: { id: ticket.id } });
  }
  if (user) {
    await database.authSession.deleteMany({ where: { userId: user.id } });
    await database.userRole.deleteMany({ where: { userId: user.id } });
    await database.user.deleteMany({ where: { id: user.id } });
  }
  await database.$disconnect();
}
