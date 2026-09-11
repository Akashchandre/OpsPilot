import { enqueueJob } from "./jobs.queue.js";
import { dayScheduleBucket, minuteScheduleBucket, validateJobPayload } from "./jobs.descriptors.js";
import { JOB_ERROR_CODES, JOB_TYPES } from "./jobs.constants.js";
import { JobDescriptorError, JobExecutionError } from "./jobs.errors.js";
import { createJobQueue } from "./jobs.queue.js";

const documentJobTypes = new Set([
  JOB_TYPES.DOCUMENT_VERSION_INGEST,
  JOB_TYPES.DOCUMENT_VERSION_DELETE,
  JOB_TYPES.DOCUMENT_VERSION_REINDEX,
]);

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export async function enqueueScheduledJobs(database, config, timestamp = new Date()) {
  const minute = minuteScheduleBucket(timestamp);
  const day = dayScheduleBucket(timestamp);
  return database.$transaction(async (transaction) => {
    const reservation = await enqueueJob(transaction, config, {
      type: JOB_TYPES.ORDER_RESERVATION_EXPIRY_SWEEP,
      dedupeKey: `schedule:reservation-expiry:${minute}`,
      payload: { bucket: minute },
    });
    const audit = await enqueueJob(transaction, config, {
      type: JOB_TYPES.AUDIT_CHAIN_VERIFY,
      dedupeKey: `schedule:audit-chain:${day}`,
      payload: { bucket: day },
    });
    const result = {
      reservationCreated: reservation.created,
      auditCreated: audit.created,
    };
    if (config.ai?.workflows?.enabled) {
      const workflowRetention = await enqueueJob(transaction, config, {
        type: JOB_TYPES.AI_WORKFLOW_RETENTION_SWEEP,
        dedupeKey: `schedule:ai-workflow-retention:${minute}`,
        payload: { bucket: minute },
      });
      result.workflowRetentionCreated = workflowRetention.created;
    }
    return result;
  });
}

function withTimeout(promise, milliseconds) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new JobExecutionError(JOB_ERROR_CODES.HANDLER_TIMEOUT)),
      milliseconds,
    );
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function handlerTimeoutMilliseconds(job, config) {
  const leaseMilliseconds = config.jobs.leaseSeconds * 1000;
  if (!documentJobTypes.has(job.type)) return leaseMilliseconds;
  const documentRequestMilliseconds = config.ai?.documentTimeoutMs ?? 120000;
  return Math.max(leaseMilliseconds, documentRequestMilliseconds * 4 + leaseMilliseconds);
}

export function createBackgroundWorker({ database, config, handlers, logger, dependencies = {} }) {
  const queue = dependencies.jobQueue ?? createJobQueue(database, config, dependencies.queue);
  const schedule = dependencies.enqueueScheduledJobs ?? enqueueScheduledJobs;
  const clock = dependencies.now ?? (() => new Date());
  const pause = dependencies.delay ?? delay;
  const databaseAvailability = dependencies.databaseAvailability ?? {
    isAvailable: () => true,
  };
  const inFlight = new Set();
  let workerId = null;
  let lifecycleReady = false;
  let stopping = false;
  let started = false;
  let stopPromise = null;
  let stopSignal = "SIGTERM";

  async function execute(job) {
    const startedAt = clock();
    const renewal = setInterval(
      () => queue.renew(job, workerId).catch(() => {}),
      Math.max(1000, Math.floor((config.jobs.leaseSeconds * 1000) / 3)),
    );
    renewal.unref?.();
    try {
      try {
        validateJobPayload(job.type, job.schemaVersion, job.payload);
      } catch (error) {
        if (error instanceof JobDescriptorError) {
          throw new JobExecutionError(error.code, { terminal: true });
        }
        throw error;
      }
      await withTimeout(handlers.execute(job), handlerTimeoutMilliseconds(job, config));
      const completed = await queue.complete(job, workerId);
      logger.log(completed ? "info" : "warn", "job.completed", {
        workerId,
        jobId: job.id,
        jobType: job.type,
        jobStatus: completed ? "SUCCEEDED" : "STALE_LEASE",
        attempt: job.attemptCount,
        durationMs: Math.max(0, clock().getTime() - startedAt.getTime()),
        queueAgeMs: Math.max(0, startedAt.getTime() - job.createdAt.getTime()),
      });
    } catch (error) {
      try {
        await queue.fail(job, workerId, error);
      } catch (recordError) {
        logger.log("error", "job.failure_record_failed", {
          workerId,
          jobId: job.id,
          jobType: job.type,
          jobStatus: "LEASE_RECOVERY_REQUIRED",
          attempt: job.attemptCount,
          errorClass: recordError?.constructor?.name ?? "Error",
          errorCode:
            typeof recordError?.code === "string" ? recordError.code : "JOB_FAILURE_RECORD_FAILED",
        });
      }
      logger.log("warn", "job.failed", {
        workerId,
        jobId: job.id,
        jobType: job.type,
        jobStatus: "FAILED",
        attempt: job.attemptCount,
        durationMs: Math.max(0, clock().getTime() - startedAt.getTime()),
        errorCode: typeof error?.code === "string" ? error.code : JOB_ERROR_CODES.HANDLER_FAILED,
      });
    } finally {
      clearInterval(renewal);
    }
  }

  function track(job) {
    const task = execute(job).finally(() => inFlight.delete(task));
    inFlight.add(task);
  }

  async function runOnce() {
    if (!databaseAvailability.isAvailable()) return 0;
    await queue.heartbeat(workerId);
    if (!databaseAvailability.isAvailable()) return 0;
    await schedule(database, config, clock());
    if (!databaseAvailability.isAvailable()) return 0;
    await queue.reconcileExpiredLeases();
    const capacity = Math.max(0, config.jobs.concurrency - inFlight.size);
    if (capacity === 0 || !databaseAvailability.isAvailable()) return 0;
    const jobs = await queue.claim(workerId, capacity);
    for (const job of jobs) track(job);
    return jobs.length;
  }

  async function start() {
    if (started) throw new Error("Background worker has already started");
    started = true;
    if (stopping) return;
    workerId = await queue.registerWorker();
    await queue.activateWorker(workerId);
    lifecycleReady = true;
    if (stopping) {
      await stop(stopSignal);
      return;
    }
    logger.log("info", "worker.started", { workerId });
    while (!stopping) {
      try {
        const claimed = await runOnce();
        if (claimed === 0) await pause(config.jobs.pollIntervalMs);
      } catch (error) {
        logger.log("error", "worker.poll_failed", {
          workerId,
          errorClass: error?.constructor?.name ?? "Error",
          errorCode: typeof error?.code === "string" ? error.code : "WORKER_POLL_FAILED",
        });
        if (!stopping) await pause(config.jobs.pollIntervalMs);
      }
    }
    if (stopPromise) await stopPromise;
  }

  function stop(signal = "SIGTERM") {
    stopSignal = signal;
    stopping = true;
    if (!started || !lifecycleReady) return Promise.resolve();
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      logger.log("warn", "worker.shutdown_requested", { workerId, signal });
      try {
        await queue.beginWorkerStop(workerId);
      } catch (error) {
        logger.log("warn", "worker.stop_begin_failed", {
          workerId,
          errorClass: error?.constructor?.name ?? "Error",
          errorCode: typeof error?.code === "string" ? error.code : "WORKER_STOP_BEGIN_FAILED",
        });
      }
      const grace = delay(config.jobs.shutdownGraceSeconds * 1000);
      await Promise.race([Promise.allSettled(inFlight), grace]);
      try {
        await queue.stopWorker(workerId);
      } catch (error) {
        logger.log("warn", "worker.stop_record_failed", {
          workerId,
          errorClass: error?.constructor?.name ?? "Error",
          errorCode: typeof error?.code === "string" ? error.code : "WORKER_STOP_RECORD_FAILED",
        });
      }
      logger.log("info", "worker.stopped", { workerId });
    })();
    return stopPromise;
  }

  return Object.freeze({
    start,
    stop,
    runOnce,
    get workerId() {
      return workerId;
    },
  });
}
