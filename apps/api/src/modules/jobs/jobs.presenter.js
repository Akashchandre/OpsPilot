function timestamp(value) {
  return value ? value.toISOString() : null;
}

export function presentJob(job, { includePayload = false, includeAttempts = false } = {}) {
  return {
    id: job.id,
    type: job.type,
    schemaVersion: job.schemaVersion,
    status: job.status,
    dedupeKey: job.dedupeKey,
    ...(includePayload ? { payload: job.payload } : {}),
    availableAt: timestamp(job.availableAt),
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    leaseOwnerId: job.leaseOwnerId,
    leaseExpiresAt: timestamp(job.leaseExpiresAt),
    lastErrorCode: job.lastErrorCode,
    sourceRequestId: job.sourceRequestId,
    replayedFromJobId: job.replayedFromJobId,
    completedAt: timestamp(job.completedAt),
    deadLetteredAt: timestamp(job.deadLetteredAt),
    createdAt: timestamp(job.createdAt),
    updatedAt: timestamp(job.updatedAt),
    ...(includeAttempts
      ? {
          attempts: job.attempts.map((attempt) => ({
            id: attempt.id,
            attemptNumber: attempt.attemptNumber,
            workerInstanceId: attempt.workerInstanceId,
            outcome: attempt.outcome,
            errorCode: attempt.errorCode,
            startedAt: timestamp(attempt.startedAt),
            finishedAt: timestamp(attempt.finishedAt),
            durationMs: attempt.durationMs,
          })),
        }
      : {}),
  };
}
