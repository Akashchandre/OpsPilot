import { AppError } from "../errors/AppError.js";

const DATABASE_PROBE = "SELECT 1";

function safeErrorFields(error, fallbackCode) {
  return {
    errorClass: error?.constructor?.name ?? "Error",
    errorCode: typeof error?.code === "string" ? error.code : fallbackCode,
  };
}

export function createDatabaseAvailabilityGuard(supervisor) {
  return function requireDatabaseAvailability(_request, _response, next) {
    if (!supervisor || supervisor.isAvailable()) return next();

    return next(
      new AppError({
        statusCode: 503,
        code: "SERVICE_UNAVAILABLE",
        message: "The service is temporarily unavailable",
      }),
    );
  };
}

export function createDatabaseAvailabilitySupervisor({
  database,
  config,
  logger,
  onFatal = async () => {},
  dependencies = {},
}) {
  const now = dependencies.now ?? (() => Date.now());
  const scheduleTimeout = dependencies.setTimeout ?? setTimeout;
  const cancelTimeout = dependencies.clearTimeout ?? clearTimeout;
  const probe = dependencies.probe ?? (() => database.$queryRawUnsafe(DATABASE_PROBE));
  const intervalMs = config.database.probeIntervalMs;
  const failureExitMs = config.database.failureExitMs;

  let activeProbe = null;
  let fatalStarted = false;
  let started = false;
  let state = "starting";
  let stopped = false;
  let timeout = null;
  let unavailableSince = null;

  function isAvailable() {
    return state === "available";
  }

  function scheduleNextProbe() {
    if (stopped || fatalStarted || timeout) return;
    timeout = scheduleTimeout(() => {
      timeout = null;
      void runScheduledProbe();
    }, intervalMs);
    timeout?.unref?.();
  }

  async function handleProbeFailure(error) {
    const timestamp = now();
    if (unavailableSince === null) {
      unavailableSince = timestamp;
      state = "unavailable";
      logger.log("warn", "database.unavailable", {
        ...safeErrorFields(error, "DATABASE_PROBE_FAILED"),
        databaseState: "unavailable",
        durationMs: 0,
      });
    }

    const durationMs = Math.max(0, timestamp - unavailableSince);
    if (durationMs < failureExitMs || fatalStarted) return false;

    fatalStarted = true;
    state = "fatal";
    logger.log("error", "database.failure_window_exceeded", {
      ...safeErrorFields(error, "DATABASE_PROBE_FAILED"),
      databaseState: "fatal",
      durationMs,
    });

    try {
      await onFatal({
        ...safeErrorFields(error, "DATABASE_PROBE_FAILED"),
        durationMs,
      });
    } catch (shutdownError) {
      logger.log("error", "database.failure_shutdown_failed", {
        ...safeErrorFields(shutdownError, "DATABASE_SHUTDOWN_FAILED"),
        durationMs,
      });
    }
    return false;
  }

  async function executeProbe() {
    try {
      await probe();
      if (stopped) return false;

      if (state === "unavailable") {
        logger.log("info", "database.recovered", {
          databaseState: "available",
          durationMs: Math.max(0, now() - unavailableSince),
        });
      }
      unavailableSince = null;
      state = "available";
      return true;
    } catch (error) {
      if (stopped) return false;
      return handleProbeFailure(error);
    }
  }

  async function probeNow() {
    if (!started || stopped || fatalStarted) return false;
    if (activeProbe) return activeProbe;

    const task = executeProbe();
    activeProbe = task;
    try {
      return await task;
    } finally {
      if (activeProbe === task) activeProbe = null;
    }
  }

  async function runScheduledProbe() {
    await probeNow();
    scheduleNextProbe();
  }

  async function start() {
    if (started) throw new Error("Database availability supervisor has already started");
    started = true;

    try {
      await database.$connect();
      await probe();
    } catch (error) {
      state = "unavailable";
      logger.log("error", "database.startup_probe_failed", {
        ...safeErrorFields(error, "DATABASE_STARTUP_FAILED"),
        databaseState: "unavailable",
        durationMs: 0,
      });
      throw error;
    }

    if (stopped) return;
    state = "available";
    logger.log("info", "database.supervisor_started", { databaseState: "available" });
    scheduleNextProbe();
  }

  function stop() {
    stopped = true;
    if (timeout) {
      cancelTimeout(timeout);
      timeout = null;
    }
    if (state !== "fatal") state = "stopped";
  }

  return Object.freeze({
    isAvailable,
    probeNow,
    start,
    stop,
    get state() {
      return state;
    },
  });
}
