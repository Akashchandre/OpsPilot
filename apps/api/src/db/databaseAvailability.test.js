import { describe, expect, it, vi } from "vitest";
import {
  createDatabaseAvailabilityGuard,
  createDatabaseAvailabilitySupervisor,
} from "./databaseAvailability.js";

const config = Object.freeze({
  database: Object.freeze({ probeIntervalMs: 1000, failureExitMs: 5000 }),
});

function createLogger() {
  const events = [];
  return {
    events,
    logger: {
      log(level, event, fields) {
        events.push({ level, event, fields });
      },
    },
  };
}

function quietTimers() {
  return {
    setTimeout() {
      return { unref() {} };
    },
    clearTimeout() {},
  };
}

describe("database availability supervisor", () => {
  it("connects and executes the constant startup probe before becoming available", async () => {
    const database = {
      $connect: vi.fn().mockResolvedValue(),
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ result: 1 }]),
    };
    const { logger } = createLogger();
    const supervisor = createDatabaseAvailabilitySupervisor({
      database,
      config,
      logger,
      dependencies: quietTimers(),
    });

    await supervisor.start();

    expect(database.$connect).toHaveBeenCalledOnce();
    expect(database.$queryRawUnsafe).toHaveBeenCalledExactlyOnceWith("SELECT 1");
    expect(supervisor.isAvailable()).toBe(true);
    supervisor.stop();
  });

  it("fails startup safely without invoking the runtime fatal callback", async () => {
    const startupError = Object.assign(new Error("mysql://secret@database"), { code: "P1001" });
    const database = {
      $connect: vi.fn().mockRejectedValue(startupError),
      $queryRawUnsafe: vi.fn(),
    };
    const onFatal = vi.fn();
    const { events, logger } = createLogger();
    const supervisor = createDatabaseAvailabilitySupervisor({
      database,
      config,
      logger,
      onFatal,
      dependencies: quietTimers(),
    });

    await expect(supervisor.start()).rejects.toBe(startupError);

    expect(supervisor.isAvailable()).toBe(false);
    expect(onFatal).not.toHaveBeenCalled();
    expect(events).toContainEqual({
      level: "error",
      event: "database.startup_probe_failed",
      fields: {
        errorClass: "Error",
        errorCode: "P1001",
        databaseState: "unavailable",
        durationMs: 0,
      },
    });
    expect(JSON.stringify(events)).not.toContain("secret");
  });

  it("marks a transient failure unavailable and restores availability without a fatal transition", async () => {
    let timestamp = 1000;
    const outage = Object.assign(new Error("unavailable"), { code: "P2039" });
    const probe = vi
      .fn()
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(outage)
      .mockResolvedValueOnce();
    const onFatal = vi.fn();
    const { events, logger } = createLogger();
    const supervisor = createDatabaseAvailabilitySupervisor({
      database: { $connect: vi.fn().mockResolvedValue() },
      config,
      logger,
      onFatal,
      dependencies: { ...quietTimers(), probe, now: () => timestamp },
    });

    await supervisor.start();
    await expect(supervisor.probeNow()).resolves.toBe(false);
    expect(supervisor.isAvailable()).toBe(false);

    timestamp = 3500;
    await expect(supervisor.probeNow()).resolves.toBe(true);

    expect(supervisor.isAvailable()).toBe(true);
    expect(onFatal).not.toHaveBeenCalled();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "database.unavailable" }),
        expect.objectContaining({
          event: "database.recovered",
          fields: { databaseState: "available", durationMs: 2500 },
        }),
      ]),
    );
    supervisor.stop();
  });

  it("runs only one probe at a time", async () => {
    let finishProbe;
    let active = 0;
    let maximumActive = 0;
    const probe = vi.fn(async () => {
      if (probe.mock.calls.length === 1) return;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => {
        finishProbe = resolve;
      });
      active -= 1;
    });
    const { logger } = createLogger();
    const supervisor = createDatabaseAvailabilitySupervisor({
      database: { $connect: vi.fn().mockResolvedValue() },
      config,
      logger,
      dependencies: { ...quietTimers(), probe },
    });
    await supervisor.start();

    const first = supervisor.probeNow();
    const second = supervisor.probeNow();
    expect(probe).toHaveBeenCalledTimes(2);
    expect(maximumActive).toBe(1);
    finishProbe();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(probe).toHaveBeenCalledTimes(2);
    supervisor.stop();
  });

  it("performs exactly one fatal transition after a continuous failure window", async () => {
    let timestamp = 0;
    const outage = Object.assign(new Error("connection failed"), { code: "P2039" });
    const probe = vi.fn().mockResolvedValueOnce().mockRejectedValue(outage);
    const onFatal = vi.fn().mockResolvedValue();
    const { events, logger } = createLogger();
    const supervisor = createDatabaseAvailabilitySupervisor({
      database: { $connect: vi.fn().mockResolvedValue() },
      config,
      logger,
      onFatal,
      dependencies: { ...quietTimers(), probe, now: () => timestamp },
    });
    await supervisor.start();

    timestamp = 1000;
    await supervisor.probeNow();
    timestamp = 5999;
    await supervisor.probeNow();
    expect(onFatal).not.toHaveBeenCalled();
    timestamp = 6000;
    await supervisor.probeNow();
    await supervisor.probeNow();

    expect(supervisor.state).toBe("fatal");
    expect(onFatal).toHaveBeenCalledOnce();
    expect(onFatal).toHaveBeenCalledWith({
      errorClass: "Error",
      errorCode: "P2039",
      durationMs: 5000,
    });
    expect(events.filter(({ event }) => event === "database.failure_window_exceeded")).toHaveLength(
      1,
    );
  });

  it("does not revive a stopped supervisor when an active probe finishes", async () => {
    let finishProbe;
    const probe = vi.fn(async () => {
      if (probe.mock.calls.length === 1) return;
      await new Promise((resolve) => {
        finishProbe = resolve;
      });
    });
    const { logger } = createLogger();
    const supervisor = createDatabaseAvailabilitySupervisor({
      database: { $connect: vi.fn().mockResolvedValue() },
      config,
      logger,
      dependencies: { ...quietTimers(), probe },
    });
    await supervisor.start();

    const pending = supervisor.probeNow();
    supervisor.stop();
    finishProbe();

    await expect(pending).resolves.toBe(false);
    expect(supervisor.state).toBe("stopped");
    expect(supervisor.isAvailable()).toBe(false);
  });
});

describe("database availability guard", () => {
  it("allows available requests and rejects unavailable requests with a safe 503 error", () => {
    const next = vi.fn();
    const available = createDatabaseAvailabilityGuard({ isAvailable: () => true });
    const unavailable = createDatabaseAvailabilityGuard({ isAvailable: () => false });

    available({}, {}, next);
    unavailable({}, {}, next);

    expect(next).toHaveBeenNthCalledWith(1);
    expect(next.mock.calls[1][0]).toMatchObject({
      statusCode: 503,
      code: "SERVICE_UNAVAILABLE",
    });
  });
});
