import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import { AUDIT_GENESIS_HASH } from "./modules/audit/audit.constants.js";
import { createOpaqueToken, digestToken } from "./modules/auth/auth.tokens.js";
import { JOB_STATUSES, JOB_TYPES } from "./modules/jobs/jobs.constants.js";
import { JobDescriptorError, JobExecutionError } from "./modules/jobs/jobs.errors.js";
import { enqueueJob, createJobQueue } from "./modules/jobs/jobs.queue.js";
import { createJobsService } from "./modules/jobs/jobs.service.js";
import { createBackgroundWorker, enqueueScheduledJobs } from "./modules/jobs/jobs.worker.js";

dotenv.config({ path: ".env.test", override: true, quiet: true });

const baseConfig = loadEnvironment();
const config = Object.freeze({
  ...baseConfig,
  jobs: Object.freeze({
    ...baseConfig.jobs,
    maxAttempts: 2,
    retryBaseMs: 100,
    retryMaxMs: 1000,
  }),
});
const database = createDatabase(config.databaseUrl);
const app = createApp({ config, database });
const origin = config.corsOrigin;

async function createSession(userId) {
  const sessionToken = createOpaqueToken();
  const csrfToken = createOpaqueToken();
  await database.authSession.create({
    data: {
      userId,
      tokenHash: digestToken(sessionToken),
      csrfTokenHash: digestToken(csrfToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return {
    csrfToken,
    cookie: `${config.auth.sessionCookieName}=${sessionToken}; ${config.auth.csrfCookieName}=${csrfToken}`,
  };
}

async function clearPhase6Data() {
  await database.notification.deleteMany();
  await database.backgroundJobAttempt.deleteMany();
  await database.backgroundJob.deleteMany({ where: { replayedFromJobId: { not: null } } });
  await database.backgroundJob.deleteMany();
  await database.workerHeartbeat.deleteMany();
  await database.auditEvent.deleteMany();
  await database.auditChainHead.update({
    where: { id: 1 },
    data: { headSequence: 0n, headHash: AUDIT_GENESIS_HASH },
  });
  await database.authSession.deleteMany();
  await database.userRole.deleteMany();
  await database.user.deleteMany();
}

beforeEach(clearPhase6Data);

afterAll(async () => {
  await clearPhase6Data();
  await database.$disconnect();
});

describe.sequential("Phase 6 durable job lifecycle", () => {
  it("seeds owner-only read and replay permissions", async () => {
    const roles = await database.role.findMany({
      include: {
        rolePermissions: {
          where: { permission: { code: { in: ["jobs:read", "jobs:replay"] } } },
          include: { permission: true },
        },
      },
    });
    const mapping = Object.fromEntries(
      roles.map((role) => [
        role.code,
        role.rolePermissions.map((entry) => entry.permission.code).sort(),
      ]),
    );
    expect(mapping.OWNER).toEqual(["jobs:read", "jobs:replay"]);
    expect(mapping.ADMIN).toEqual([]);
    expect(mapping.CUSTOMER).toEqual([]);
  });

  it("enqueues idempotently and rejects a changed descriptor under the same key", async () => {
    const first = await database.$transaction((transaction) =>
      enqueueJob(transaction, config, {
        type: JOB_TYPES.AUDIT_CHAIN_VERIFY,
        dedupeKey: "audit:2026-08-28",
        payload: { bucket: "2026-08-28" },
      }),
    );
    const retry = await database.$transaction((transaction) =>
      enqueueJob(transaction, config, {
        type: JOB_TYPES.AUDIT_CHAIN_VERIFY,
        dedupeKey: "audit:2026-08-28",
        payload: { bucket: "2026-08-28" },
      }),
    );
    expect(first.created).toBe(true);
    expect(retry).toMatchObject({ created: false, job: { id: first.job.id } });

    await expect(
      database.$transaction((transaction) =>
        enqueueJob(transaction, config, {
          type: JOB_TYPES.AUDIT_CHAIN_VERIFY,
          dedupeKey: "audit:2026-08-28",
          payload: { bucket: "2026-08-29" },
        }),
      ),
    ).rejects.toBeInstanceOf(JobDescriptorError);
  });

  it("rolls a job enqueue back with its surrounding domain transaction", async () => {
    await expect(
      database.$transaction(async (transaction) => {
        await enqueueJob(transaction, config, {
          type: JOB_TYPES.AUDIT_CHAIN_VERIFY,
          dedupeKey: "audit:rollback-test",
          payload: { bucket: "2026-08-28" },
        });
        throw new Error("ROLLBACK_TEST");
      }),
    ).rejects.toThrow("ROLLBACK_TEST");

    expect(
      await database.backgroundJob.count({ where: { dedupeKey: "audit:rollback-test" } }),
    ).toBe(0);
  });

  it("claims disjoint jobs across concurrent workers", async () => {
    const concurrentConfig = Object.freeze({
      ...config,
      jobs: Object.freeze({ ...config.jobs, concurrency: 2 }),
    });
    const firstQueue = createJobQueue(database, concurrentConfig);
    const secondQueue = createJobQueue(database, concurrentConfig);
    const [firstWorker, secondWorker] = await Promise.all([
      firstQueue.registerWorker(),
      secondQueue.registerWorker(),
    ]);
    await Promise.all([
      firstQueue.activateWorker(firstWorker),
      secondQueue.activateWorker(secondWorker),
    ]);
    await database.$transaction((transaction) =>
      Promise.all(
        Array.from({ length: 4 }, (_, index) =>
          enqueueJob(transaction, concurrentConfig, {
            type: JOB_TYPES.AUDIT_CHAIN_VERIFY,
            dedupeKey: `audit:concurrent-${index}`,
            payload: { bucket: "2026-08-28" },
          }),
        ),
      ),
    );

    const [firstClaims, secondClaims] = await Promise.all([
      firstQueue.claim(firstWorker, 2),
      secondQueue.claim(secondWorker, 2),
    ]);
    const claimedIds = [...firstClaims, ...secondClaims].map((job) => job.id);
    expect(claimedIds).toHaveLength(4);
    expect(new Set(claimedIds).size).toBe(4);
  });

  it("claims under a lease and records a successful attempt", async () => {
    const queue = createJobQueue(database, config);
    const workerId = await queue.registerWorker();
    await queue.activateWorker(workerId);
    await database.$transaction((transaction) =>
      enqueueJob(transaction, config, {
        type: JOB_TYPES.ORDER_RESERVATION_EXPIRY_SWEEP,
        dedupeKey: "reservation:2026-08-28T12:00:00.000Z",
        payload: { bucket: "2026-08-28T12:00:00.000Z" },
      }),
    );

    const [claimed] = await queue.claim(workerId, 1);
    expect(claimed).toMatchObject({ status: JOB_STATUSES.PROCESSING, attemptCount: 1 });
    expect(claimed.leaseToken).toMatch(/^[0-9a-f]{64}$/);
    expect(await queue.complete(claimed, workerId)).toBe(true);

    const stored = await database.backgroundJob.findUnique({
      where: { id: claimed.id },
      include: { attempts: true },
    });
    expect(stored).toMatchObject({ status: JOB_STATUSES.SUCCEEDED, completedAt: expect.any(Date) });
    expect(stored.leaseToken).toBeNull();
    expect(stored.attempts).toEqual([
      expect.objectContaining({ attemptNumber: 1, outcome: "SUCCEEDED", errorCode: null }),
    ]);
  });

  it("retries safely, then dead-letters a terminal failure", async () => {
    let clock = new Date("2026-08-28T13:00:00.000Z");
    const queue = createJobQueue(database, config, {
      now: () => new Date(clock),
      random: () => 0,
    });
    const workerId = await queue.registerWorker();
    await queue.activateWorker(workerId);
    await database.$transaction((transaction) =>
      enqueueJob(transaction, config, {
        type: JOB_TYPES.AUDIT_CHAIN_VERIFY,
        dedupeKey: "audit:retry-test",
        payload: { bucket: "2026-08-28" },
        availableAt: clock,
      }),
    );

    const [first] = await queue.claim(workerId, 1);
    await queue.fail(first, workerId, new JobExecutionError("TEMPORARY_FAILURE"));
    let stored = await database.backgroundJob.findUnique({ where: { id: first.id } });
    expect(stored).toMatchObject({
      status: JOB_STATUSES.PENDING,
      lastErrorCode: "TEMPORARY_FAILURE",
    });

    clock = new Date(clock.getTime() + 101);
    const [second] = await queue.claim(workerId, 1);
    await queue.fail(
      second,
      workerId,
      new JobExecutionError("AUDIT_INTEGRITY_INVALID", { terminal: true }),
    );
    stored = await database.backgroundJob.findUnique({
      where: { id: first.id },
      include: { attempts: { orderBy: { attemptNumber: "asc" } } },
    });
    expect(stored).toMatchObject({
      status: JOB_STATUSES.DEAD_LETTER,
      attemptCount: 2,
      lastErrorCode: "AUDIT_INTEGRITY_INVALID",
      deadLetteredAt: expect.any(Date),
    });
    expect(stored.attempts.map((attempt) => attempt.outcome)).toEqual([
      "RETRY_SCHEDULED",
      "TERMINAL_FAILURE",
    ]);
  });

  it("reconciles an expired lease without allowing stale completion", async () => {
    let clock = new Date("2026-08-28T14:00:00.000Z");
    const queue = createJobQueue(database, config, { now: () => new Date(clock) });
    const workerId = await queue.registerWorker();
    await queue.activateWorker(workerId);
    await database.$transaction((transaction) =>
      enqueueJob(transaction, config, {
        type: JOB_TYPES.AUDIT_CHAIN_VERIFY,
        dedupeKey: "audit:lease-test",
        payload: { bucket: "2026-08-28" },
        availableAt: clock,
      }),
    );
    const [claimed] = await queue.claim(workerId, 1);
    clock = new Date(clock.getTime() + config.jobs.leaseSeconds * 1000 + 1);
    expect(await queue.reconcileExpiredLeases()).toBe(1);
    expect(await queue.complete(claimed, workerId)).toBe(false);
    const stored = await database.backgroundJob.findUnique({
      where: { id: claimed.id },
      include: { attempts: true },
    });
    expect(stored).toMatchObject({ status: JOB_STATUSES.PENDING, lastErrorCode: "LEASE_EXPIRED" });
    expect(stored.attempts[0].outcome).toBe("LEASE_EXPIRED");
  });

  it("renews an active lease and only reconciles after the renewed deadline", async () => {
    let clock = new Date("2026-08-28T15:00:00.000Z");
    const queue = createJobQueue(database, config, { now: () => new Date(clock) });
    const workerId = await queue.registerWorker();
    await queue.activateWorker(workerId);
    await database.$transaction((transaction) =>
      enqueueJob(transaction, config, {
        type: JOB_TYPES.AUDIT_CHAIN_VERIFY,
        dedupeKey: "audit:renew-test",
        payload: { bucket: "2026-08-28" },
        availableAt: clock,
      }),
    );
    const [claimed] = await queue.claim(workerId, 1);
    const originalExpiry = claimed.leaseExpiresAt;

    clock = new Date(originalExpiry.getTime() - 1);
    expect(await queue.renew(claimed, workerId)).toBe(true);
    const renewed = await database.backgroundJob.findUnique({ where: { id: claimed.id } });
    expect(renewed.leaseExpiresAt.getTime()).toBeGreaterThan(originalExpiry.getTime());

    clock = new Date(originalExpiry.getTime() + 1);
    expect(await queue.reconcileExpiredLeases()).toBe(0);
    clock = new Date(renewed.leaseExpiresAt.getTime() + 1);
    expect(await queue.reconcileExpiredLeases()).toBe(1);
  });

  it("times out a non-cooperative handler and schedules a safe retry", async () => {
    const timeoutConfig = Object.freeze({
      ...config,
      jobs: Object.freeze({
        ...config.jobs,
        concurrency: 1,
        leaseSeconds: 1.2,
        pollIntervalMs: 10,
        shutdownGraceSeconds: 1,
      }),
    });
    const target = await database.backgroundJob.create({
      data: {
        type: JOB_TYPES.AUDIT_CHAIN_VERIFY,
        dedupeKey: "audit:timeout-test",
        payload: { bucket: "2026-08-28" },
        availableAt: new Date(0),
        maxAttempts: timeoutConfig.jobs.maxAttempts,
      },
    });
    let worker;
    worker = createBackgroundWorker({
      database,
      config: timeoutConfig,
      handlers: { execute: () => new Promise(() => {}) },
      logger: {
        log(_level, event) {
          if (event === "job.failed") void worker.stop("TEST");
        },
      },
    });
    const safetyStop = setTimeout(() => void worker.stop("TEST_TIMEOUT"), 3000);
    await worker.start();
    clearTimeout(safetyStop);

    expect(
      await database.backgroundJob.findUnique({
        where: { id: target.id },
        include: { attempts: true },
      }),
    ).toMatchObject({
      status: JOB_STATUSES.PENDING,
      lastErrorCode: "JOB_HANDLER_TIMEOUT",
      attempts: [expect.objectContaining({ outcome: "RETRY_SCHEDULED" })],
    });
  });

  it("dead-letters a poison schema version before invoking its handler", async () => {
    const poison = await database.backgroundJob.create({
      data: {
        type: JOB_TYPES.AUDIT_CHAIN_VERIFY,
        schemaVersion: 2,
        dedupeKey: "audit:poison-version",
        payload: { bucket: "2026-08-28" },
        availableAt: new Date(0),
        maxAttempts: config.jobs.maxAttempts,
      },
    });
    const executedJobIds = [];
    let worker;
    worker = createBackgroundWorker({
      database,
      config: Object.freeze({
        ...config,
        jobs: Object.freeze({ ...config.jobs, concurrency: 1, pollIntervalMs: 10 }),
      }),
      handlers: {
        async execute(job) {
          executedJobIds.push(job.id);
        },
      },
      logger: {
        log(_level, event) {
          if (event === "job.failed") void worker.stop("TEST");
        },
      },
    });
    const safetyStop = setTimeout(() => void worker.stop("TEST_TIMEOUT"), 2000);
    await worker.start();
    clearTimeout(safetyStop);

    expect(executedJobIds).not.toContain(poison.id);
    expect(
      await database.backgroundJob.findUnique({
        where: { id: poison.id },
        include: { attempts: true },
      }),
    ).toMatchObject({
      status: JOB_STATUSES.DEAD_LETTER,
      lastErrorCode: "JOB_SCHEMA_UNSUPPORTED",
      attempts: [expect.objectContaining({ outcome: "TERMINAL_FAILURE" })],
    });
  });

  it("enqueues fixed schedules idempotently and drains in-flight work before stopping", async () => {
    const timestamp = new Date();
    const firstSchedule = await enqueueScheduledJobs(database, config, timestamp);
    const repeatedSchedule = await enqueueScheduledJobs(database, config, timestamp);
    expect(firstSchedule).toEqual({ reservationCreated: true, auditCreated: true });
    expect(repeatedSchedule).toEqual({ reservationCreated: false, auditCreated: false });

    const workerConfig = Object.freeze({
      ...config,
      jobs: Object.freeze({
        ...config.jobs,
        concurrency: 2,
        pollIntervalMs: 10,
        shutdownGraceSeconds: 2,
      }),
    });
    const handled = [];
    let worker;
    worker = createBackgroundWorker({
      database,
      config: workerConfig,
      handlers: {
        async execute(job) {
          handled.push(job.id);
          if (handled.length === 2) void worker.stop("TEST");
        },
      },
      logger: { log() {} },
    });

    const safetyStop = setTimeout(() => void worker.stop("TEST_TIMEOUT"), 2000);
    await worker.start();
    clearTimeout(safetyStop);

    expect(new Set(handled).size).toBe(2);
    expect(await database.backgroundJob.count({ where: { status: JOB_STATUSES.SUCCEEDED } })).toBe(
      2,
    );
    expect(
      await database.workerHeartbeat.findUnique({ where: { id: worker.workerId } }),
    ).toMatchObject({ state: "STOPPED", stoppedAt: expect.any(Date) });
  });

  it("protects the owner job API with authentication, permissions, and CSRF", async () => {
    const [owner, admin] = await Promise.all([
      database.user.create({
        data: {
          email: "phase6-api-owner@example.com",
          displayName: "Phase 6 API Owner",
          passwordHash: "not-used-by-this-test",
          roles: { create: { role: { connect: { code: "OWNER" } } } },
        },
      }),
      database.user.create({
        data: {
          email: "phase6-api-admin@example.com",
          displayName: "Phase 6 API Admin",
          passwordHash: "not-used-by-this-test",
          roles: { create: { role: { connect: { code: "ADMIN" } } } },
        },
      }),
    ]);
    const [ownerSession, adminSession] = await Promise.all([
      createSession(owner.id),
      createSession(admin.id),
    ]);
    const original = await database.backgroundJob.create({
      data: {
        type: JOB_TYPES.AUDIT_CHAIN_VERIFY,
        dedupeKey: "audit:http-dead-letter",
        payload: { bucket: "2026-08-28" },
        status: JOB_STATUSES.DEAD_LETTER,
        maxAttempts: 2,
        attemptCount: 2,
        lastErrorCode: "AUDIT_INTEGRITY_INVALID",
        deadLetteredAt: new Date(),
      },
    });

    expect((await request(app).get("/api/v1/jobs")).status).toBe(401);
    expect((await request(app).get("/api/v1/jobs").set("Cookie", adminSession.cookie)).status).toBe(
      403,
    );

    const list = await request(app).get("/api/v1/jobs").set("Cookie", ownerSession.cookie);
    expect(list.status).toBe(200);
    expect(list.body.data.jobs).toEqual([
      expect.objectContaining({ id: original.id, status: JOB_STATUSES.DEAD_LETTER }),
    ]);
    expect(list.body.data.jobs[0]).not.toHaveProperty("payload");
    expect(
      (await request(app).get(`/api/v1/jobs/${original.id}`).set("Cookie", ownerSession.cookie))
        .status,
    ).toBe(200);
    expect(
      (await request(app).get("/api/v1/jobs/health").set("Cookie", ownerSession.cookie)).status,
    ).toBe(200);

    const idempotencyKey = randomUUID();
    const missingCsrf = await request(app)
      .post(`/api/v1/jobs/${original.id}/replay`)
      .set("Cookie", ownerSession.cookie)
      .set("Origin", origin)
      .send({ idempotencyKey });
    expect(missingCsrf.status).toBe(403);

    const replay = () =>
      request(app)
        .post(`/api/v1/jobs/${original.id}/replay`)
        .set("Cookie", ownerSession.cookie)
        .set("Origin", origin)
        .set("X-CSRF-Token", ownerSession.csrfToken)
        .send({ idempotencyKey });
    const firstReplay = await replay();
    const repeatedReplay = await replay();
    expect(firstReplay.status).toBe(201);
    expect(repeatedReplay.status).toBe(200);
    expect(repeatedReplay.body.data.job.id).toBe(firstReplay.body.data.job.id);
    expect(await database.backgroundJob.count({ where: { replayedFromJobId: original.id } })).toBe(
      1,
    );
    expect(
      (
        await request(app)
          .post("/api/v1/jobs")
          .set("Cookie", ownerSession.cookie)
          .set("Origin", origin)
          .set("X-CSRF-Token", ownerSession.csrfToken)
          .send({ type: JOB_TYPES.AUDIT_CHAIN_VERIFY, payload: {} })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .delete(`/api/v1/jobs/${original.id}`)
          .set("Cookie", ownerSession.cookie)
          .set("Origin", origin)
          .set("X-CSRF-Token", ownerSession.csrfToken)
      ).status,
    ).toBe(404);
  });

  it("replays a dead letter once and appends one audit event", async () => {
    const owner = await database.user.create({
      data: {
        email: "phase6-owner@example.com",
        displayName: "Phase 6 Owner",
        passwordHash: "not-used-by-this-test",
        roles: { create: { role: { connect: { code: "OWNER" } } } },
      },
    });
    const original = await database.backgroundJob.create({
      data: {
        type: JOB_TYPES.AUDIT_CHAIN_VERIFY,
        dedupeKey: "audit:dead-letter",
        payload: { bucket: "2026-08-28" },
        status: JOB_STATUSES.DEAD_LETTER,
        maxAttempts: 2,
        attemptCount: 2,
        lastErrorCode: "AUDIT_INTEGRITY_INVALID",
        deadLetteredAt: new Date(),
      },
    });
    const idempotencyKey = randomUUID();
    const service = createJobsService(database, config);
    const input = {
      actor: owner,
      jobId: original.id,
      idempotencyKey,
      requestId: randomUUID(),
    };
    const first = await service.replay(input);
    const retry = await service.replay({ ...input, requestId: randomUUID() });
    expect(first.created).toBe(true);
    expect(retry).toMatchObject({ created: false, job: { id: first.job.id } });
    expect(await database.auditEvent.count({ where: { action: "BACKGROUND_JOB_REPLAYED" } })).toBe(
      1,
    );
  });
});
