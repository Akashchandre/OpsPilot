import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  JOB_ATTEMPT_OUTCOMES,
  JOB_ERROR_CODES,
  JOB_STATUSES,
  WORKER_STATES,
} from "./jobs.constants.js";
import { canonicalJobPayload, validateJobDescriptor } from "./jobs.descriptors.js";
import { JobDescriptorError, normalizeJobExecutionError } from "./jobs.errors.js";

function isUniqueConflict(error) {
  return error?.code === "P2002";
}

function sameDescriptor(job, descriptor) {
  return (
    job.type === descriptor.type &&
    job.schemaVersion === descriptor.schemaVersion &&
    canonicalJobPayload(job.payload) === canonicalJobPayload(descriptor.payload)
  );
}

export async function enqueueJob(transaction, config, input) {
  const descriptor = validateJobDescriptor(input);
  const data = {
    ...descriptor,
    availableAt: input.availableAt ?? new Date(),
    maxAttempts: config.jobs.maxAttempts,
    sourceRequestId: input.sourceRequestId ?? null,
    sourceActorUserId: input.sourceActorUserId ?? null,
    replayedFromJobId: input.replayedFromJobId ?? null,
    replayIdempotencyKey: input.replayIdempotencyKey ?? null,
  };

  try {
    return { job: await transaction.backgroundJob.create({ data }), created: true };
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const existing = await transaction.backgroundJob.findUnique({
      where: { dedupeKey: descriptor.dedupeKey },
    });
    if (!existing || !sameDescriptor(existing, descriptor)) {
      throw new JobDescriptorError(JOB_ERROR_CODES.DESCRIPTOR_CONFLICT);
    }
    return { job: existing, created: false };
  }
}

function leaseTokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function durationMilliseconds(startedAt, finishedAt) {
  return Math.max(0, finishedAt.getTime() - startedAt.getTime());
}

function retryDelayMilliseconds(attemptCount, jobsConfig, random) {
  const multiplier = 2 ** Math.max(0, attemptCount - 1);
  const base = Math.min(jobsConfig.retryMaxMs, jobsConfig.retryBaseMs * multiplier);
  const jitterCeiling = Math.min(Math.floor(base * 0.2), jobsConfig.retryMaxMs - base);
  return base + Math.floor(random() * (jitterCeiling + 1));
}

export function createJobQueue(database, config, dependencies = {}) {
  const now = dependencies.now ?? (() => new Date());
  const idFactory = dependencies.idFactory ?? randomUUID;
  const tokenFactory = dependencies.tokenFactory ?? (() => randomBytes(32).toString("hex"));
  const random = dependencies.random ?? Math.random;

  async function registerWorker(workerInstanceId = idFactory()) {
    const timestamp = now();
    await database.workerHeartbeat.create({
      data: {
        id: workerInstanceId,
        state: WORKER_STATES.STARTING,
        startedAt: timestamp,
        lastSeenAt: timestamp,
      },
    });
    return workerInstanceId;
  }

  async function setWorkerState(workerInstanceId, state) {
    const timestamp = now();
    return database.workerHeartbeat.update({
      where: { id: workerInstanceId },
      data: {
        state,
        lastSeenAt: timestamp,
        stoppedAt: state === WORKER_STATES.STOPPED ? timestamp : null,
      },
    });
  }

  async function heartbeat(workerInstanceId) {
    return database.workerHeartbeat.updateMany({
      where: {
        id: workerInstanceId,
        state: { in: [WORKER_STATES.ACTIVE, WORKER_STATES.STOPPING] },
      },
      data: { lastSeenAt: now() },
    });
  }

  async function reconcileExpiredLeases(limit = config.jobs.concurrency * 4) {
    const timestamp = now();
    return database.$transaction(
      async (transaction) => {
        const candidates = await transaction.$queryRaw`
          SELECT id
          FROM background_jobs
          WHERE status = 'PROCESSING'
            AND lease_expires_at <= ${timestamp}
          ORDER BY lease_expires_at, created_at
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        `;
        let reconciled = 0;

        for (const candidate of candidates) {
          const job = await transaction.backgroundJob.findUnique({ where: { id: candidate.id } });
          if (!job || job.status !== JOB_STATUSES.PROCESSING) continue;
          const exhausted = job.attemptCount >= job.maxAttempts;
          const attempt = await transaction.backgroundJobAttempt.findUnique({
            where: { jobId_attemptNumber: { jobId: job.id, attemptNumber: job.attemptCount } },
          });
          const update = await transaction.backgroundJob.updateMany({
            where: { id: job.id, status: JOB_STATUSES.PROCESSING, leaseToken: job.leaseToken },
            data: {
              status: exhausted ? JOB_STATUSES.DEAD_LETTER : JOB_STATUSES.PENDING,
              availableAt: timestamp,
              leaseToken: null,
              leaseOwnerId: null,
              leaseExpiresAt: null,
              lastErrorCode: JOB_ERROR_CODES.LEASE_EXPIRED,
              deadLetteredAt: exhausted ? timestamp : null,
              version: { increment: 1 },
            },
          });
          if (update.count !== 1) continue;
          if (attempt && !attempt.outcome) {
            await transaction.backgroundJobAttempt.update({
              where: { id: attempt.id },
              data: {
                outcome: exhausted
                  ? JOB_ATTEMPT_OUTCOMES.DEAD_LETTER
                  : JOB_ATTEMPT_OUTCOMES.LEASE_EXPIRED,
                errorCode: JOB_ERROR_CODES.LEASE_EXPIRED,
                finishedAt: timestamp,
                durationMs: durationMilliseconds(attempt.startedAt, timestamp),
              },
            });
          }
          reconciled += 1;
        }
        return reconciled;
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  async function claim(workerInstanceId, limit = config.jobs.concurrency) {
    const claimLimit = Math.max(1, Math.min(config.jobs.concurrency, limit));
    const timestamp = now();
    const leaseExpiresAt = new Date(timestamp.getTime() + config.jobs.leaseSeconds * 1000);
    return database.$transaction(
      async (transaction) => {
        const candidates = await transaction.$queryRaw`
          SELECT id
          FROM background_jobs
          WHERE status = 'PENDING'
            AND available_at <= ${timestamp}
            AND attempt_count < max_attempts
          ORDER BY available_at, created_at
          LIMIT ${claimLimit}
          FOR UPDATE SKIP LOCKED
        `;
        const claimed = [];
        for (const candidate of candidates) {
          const token = tokenFactory();
          const update = await transaction.backgroundJob.updateMany({
            where: {
              id: candidate.id,
              status: JOB_STATUSES.PENDING,
              attemptCount: { lt: config.jobs.maxAttempts },
            },
            data: {
              status: JOB_STATUSES.PROCESSING,
              attemptCount: { increment: 1 },
              leaseToken: token,
              leaseOwnerId: workerInstanceId,
              leaseExpiresAt,
              lastErrorCode: null,
              version: { increment: 1 },
            },
          });
          if (update.count !== 1) continue;
          const job = await transaction.backgroundJob.findUnique({ where: { id: candidate.id } });
          await transaction.backgroundJobAttempt.create({
            data: {
              jobId: job.id,
              attemptNumber: job.attemptCount,
              workerInstanceId,
              leaseTokenHash: leaseTokenHash(token),
              startedAt: timestamp,
            },
          });
          claimed.push({ ...job, leaseToken: token });
        }
        return claimed;
      },
      { isolationLevel: "ReadCommitted" },
    );
  }

  async function renew(job, workerInstanceId) {
    const leaseExpiresAt = new Date(now().getTime() + config.jobs.leaseSeconds * 1000);
    const update = await database.backgroundJob.updateMany({
      where: {
        id: job.id,
        status: JOB_STATUSES.PROCESSING,
        leaseOwnerId: workerInstanceId,
        leaseToken: job.leaseToken,
      },
      data: { leaseExpiresAt, version: { increment: 1 } },
    });
    return update.count === 1;
  }

  async function complete(job, workerInstanceId) {
    const timestamp = now();
    return database.$transaction(async (transaction) => {
      const attempt = await transaction.backgroundJobAttempt.findUnique({
        where: { jobId_attemptNumber: { jobId: job.id, attemptNumber: job.attemptCount } },
      });
      const update = await transaction.backgroundJob.updateMany({
        where: {
          id: job.id,
          status: JOB_STATUSES.PROCESSING,
          leaseOwnerId: workerInstanceId,
          leaseToken: job.leaseToken,
        },
        data: {
          status: JOB_STATUSES.SUCCEEDED,
          leaseToken: null,
          leaseOwnerId: null,
          leaseExpiresAt: null,
          completedAt: timestamp,
          lastErrorCode: null,
          version: { increment: 1 },
        },
      });
      if (update.count !== 1) return false;
      if (attempt && !attempt.outcome) {
        await transaction.backgroundJobAttempt.update({
          where: { id: attempt.id },
          data: {
            outcome: JOB_ATTEMPT_OUTCOMES.SUCCEEDED,
            finishedAt: timestamp,
            durationMs: durationMilliseconds(attempt.startedAt, timestamp),
          },
        });
      }
      return true;
    });
  }

  async function fail(job, workerInstanceId, rawError) {
    const error = normalizeJobExecutionError(rawError);
    const timestamp = now();
    const exhausted = job.attemptCount >= job.maxAttempts;
    const deadLetter = error.terminal || exhausted;
    const outcome = error.terminal
      ? JOB_ATTEMPT_OUTCOMES.TERMINAL_FAILURE
      : exhausted
        ? JOB_ATTEMPT_OUTCOMES.DEAD_LETTER
        : JOB_ATTEMPT_OUTCOMES.RETRY_SCHEDULED;
    const availableAt = new Date(
      timestamp.getTime() + retryDelayMilliseconds(job.attemptCount, config.jobs, random),
    );

    return database.$transaction(async (transaction) => {
      const attempt = await transaction.backgroundJobAttempt.findUnique({
        where: { jobId_attemptNumber: { jobId: job.id, attemptNumber: job.attemptCount } },
      });
      const update = await transaction.backgroundJob.updateMany({
        where: {
          id: job.id,
          status: JOB_STATUSES.PROCESSING,
          leaseOwnerId: workerInstanceId,
          leaseToken: job.leaseToken,
        },
        data: {
          status: deadLetter ? JOB_STATUSES.DEAD_LETTER : JOB_STATUSES.PENDING,
          availableAt,
          leaseToken: null,
          leaseOwnerId: null,
          leaseExpiresAt: null,
          lastErrorCode: error.code,
          deadLetteredAt: deadLetter ? timestamp : null,
          version: { increment: 1 },
        },
      });
      if (update.count !== 1) return false;
      if (attempt && !attempt.outcome) {
        await transaction.backgroundJobAttempt.update({
          where: { id: attempt.id },
          data: {
            outcome,
            errorCode: error.code,
            finishedAt: timestamp,
            durationMs: durationMilliseconds(attempt.startedAt, timestamp),
          },
        });
      }
      return true;
    });
  }

  return Object.freeze({
    registerWorker,
    activateWorker: (workerInstanceId) => setWorkerState(workerInstanceId, WORKER_STATES.ACTIVE),
    beginWorkerStop: (workerInstanceId) => setWorkerState(workerInstanceId, WORKER_STATES.STOPPING),
    stopWorker: (workerInstanceId) => setWorkerState(workerInstanceId, WORKER_STATES.STOPPED),
    heartbeat,
    reconcileExpiredLeases,
    claim,
    renew,
    complete,
    fail,
  });
}
