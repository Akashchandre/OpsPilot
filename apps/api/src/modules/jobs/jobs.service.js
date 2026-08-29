import { AppError } from "../../errors/AppError.js";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_KINDS,
  AUDIT_OUTCOMES,
  AUDIT_TARGET_TYPES,
} from "../audit/audit.constants.js";
import { createAuditService } from "../audit/audit.service.js";
import { JOB_STATUSES } from "./jobs.constants.js";
import { validateJobPayload } from "./jobs.descriptors.js";
import { JobDescriptorError, jobNotFound, jobNotReplayable } from "./jobs.errors.js";
import { presentJob } from "./jobs.presenter.js";
import { enqueueJob } from "./jobs.queue.js";

function readMetadata(view, overrides = {}) {
  return {
    view,
    page: null,
    limit: null,
    returnedCount: 0,
    total: 0,
    statusFilterSet: false,
    typeFilterSet: false,
    ...overrides,
  };
}

export function createJobsService(database, config) {
  const audit = createAuditService(database, config);

  async function auditRead(actor, requestId, metadata) {
    await audit.appendStandalone({
      action: AUDIT_ACTIONS.BACKGROUND_JOBS_READ,
      outcome: AUDIT_OUTCOMES.SUCCESS,
      actorKind: AUDIT_ACTOR_KINDS.USER,
      actorUserId: actor.id,
      targetType: AUDIT_TARGET_TYPES.BACKGROUND_JOB_QUEUE,
      requestId,
      metadata,
    });
  }

  return Object.freeze({
    async list({ actor, query, requestId }) {
      const where = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
      };
      const [jobs, total] = await database.$transaction([
        database.backgroundJob.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        database.backgroundJob.count({ where }),
      ]);
      await auditRead(
        actor,
        requestId,
        readMetadata("LIST", {
          page: query.page,
          limit: query.limit,
          returnedCount: jobs.length,
          total,
          statusFilterSet: Boolean(query.status),
          typeFilterSet: Boolean(query.type),
        }),
      );
      return {
        jobs: jobs.map((job) => presentJob(job)),
        meta: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      };
    },

    async detail({ actor, jobId, requestId }) {
      const job = await database.backgroundJob.findUnique({
        where: { id: jobId },
        include: { attempts: { orderBy: { attemptNumber: "desc" } } },
      });
      if (!job) throw jobNotFound();
      validateJobPayload(job.type, job.schemaVersion, job.payload);
      await auditRead(actor, requestId, readMetadata("DETAIL", { returnedCount: 1, total: 1 }));
      return presentJob(job, { includePayload: true, includeAttempts: true });
    },

    async health({ actor, requestId }) {
      const timestamp = new Date();
      const staleBefore = new Date(timestamp.getTime() - config.jobs.leaseSeconds * 2000);
      const [statusCounts, oldestPending, staleProcessing, workers] = await database.$transaction([
        database.backgroundJob.groupBy({ by: ["status"], _count: { _all: true } }),
        database.backgroundJob.aggregate({
          where: { status: JOB_STATUSES.PENDING },
          _min: { createdAt: true },
        }),
        database.backgroundJob.count({
          where: { status: JOB_STATUSES.PROCESSING, leaseExpiresAt: { lte: timestamp } },
        }),
        database.workerHeartbeat.findMany({
          where: { lastSeenAt: { gte: staleBefore } },
          select: { id: true, state: true, startedAt: true, lastSeenAt: true, stoppedAt: true },
          orderBy: { lastSeenAt: "desc" },
          take: 20,
        }),
      ]);
      const counts = Object.fromEntries(Object.values(JOB_STATUSES).map((status) => [status, 0]));
      for (const entry of statusCounts) counts[entry.status] = entry._count._all;
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
      await auditRead(actor, requestId, readMetadata("HEALTH", { returnedCount: 1, total }));
      return {
        checkedAt: timestamp.toISOString(),
        counts,
        staleProcessing,
        oldestPendingAgeMs: oldestPending._min.createdAt
          ? Math.max(0, timestamp.getTime() - oldestPending._min.createdAt.getTime())
          : null,
        workers: workers.map((worker) => ({
          ...worker,
          startedAt: worker.startedAt.toISOString(),
          lastSeenAt: worker.lastSeenAt.toISOString(),
          stoppedAt: worker.stoppedAt?.toISOString() ?? null,
        })),
      };
    },

    async replay({ actor, jobId, idempotencyKey, requestId }) {
      try {
        return await database.$transaction(
          async (transaction) => {
            const original = await transaction.backgroundJob.findUnique({ where: { id: jobId } });
            if (!original) throw jobNotFound();
            if (original.status !== JOB_STATUSES.DEAD_LETTER) throw jobNotReplayable();
            try {
              validateJobPayload(original.type, original.schemaVersion, original.payload);
            } catch (error) {
              if (error instanceof JobDescriptorError) throw jobNotReplayable();
              throw error;
            }
            const result = await enqueueJob(transaction, config, {
              type: original.type,
              schemaVersion: original.schemaVersion,
              dedupeKey: `replay:${original.id}:${idempotencyKey}`,
              payload: original.payload,
              sourceRequestId: requestId,
              sourceActorUserId: actor.id,
              replayedFromJobId: original.id,
              replayIdempotencyKey: idempotencyKey,
            });
            if (result.job.replayedFromJobId !== original.id) {
              throw new AppError({
                statusCode: 409,
                code: "JOB_REPLAY_CONFLICT",
                message: "The replay idempotency key conflicts with another job",
              });
            }
            if (result.created) {
              await audit.append(transaction, {
                action: AUDIT_ACTIONS.BACKGROUND_JOB_REPLAYED,
                outcome: AUDIT_OUTCOMES.SUCCESS,
                actorKind: AUDIT_ACTOR_KINDS.USER,
                actorUserId: actor.id,
                targetType: AUDIT_TARGET_TYPES.BACKGROUND_JOB,
                targetId: original.id,
                requestId,
                metadata: {
                  replayedJobId: result.job.id,
                  originalAttemptCount: original.attemptCount,
                  originalErrorCode: original.lastErrorCode,
                },
              });
            }
            return { job: presentJob(result.job), created: result.created };
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        if (error instanceof JobDescriptorError) {
          throw new AppError({
            statusCode: 409,
            code: "JOB_REPLAY_CONFLICT",
            message: "The replay descriptor conflicts with an existing job",
          });
        }
        throw error;
      }
    },
  });
}
