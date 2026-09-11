import { describe, expect, it, vi } from "vitest";
import { createBackgroundWorker } from "./jobs.worker.js";
import { JOB_TYPES } from "./jobs.constants.js";

const config = Object.freeze({
  jobs: Object.freeze({
    concurrency: 1,
    leaseSeconds: 5,
    pollIntervalMs: 10,
    shutdownGraceSeconds: 1,
  }),
});

describe("background worker outage recovery", () => {
  it("backs off after a queue outage, resumes polling, and then stops cleanly", async () => {
    const events = [];
    let heartbeatCalls = 0;
    let scheduleCalls = 0;
    let pauseCalls = 0;
    let worker;
    const jobQueue = {
      async registerWorker() {
        return "00000000-0000-4000-8000-000000000001";
      },
      async activateWorker() {},
      async heartbeat() {
        heartbeatCalls += 1;
        if (heartbeatCalls === 1) throw new Error("simulated database outage");
      },
      async reconcileExpiredLeases() {
        return 0;
      },
      async claim() {
        return [];
      },
      async beginWorkerStop() {},
      async stopWorker() {},
    };
    worker = createBackgroundWorker({
      database: {},
      config,
      handlers: { async execute() {} },
      logger: {
        log(level, event, fields) {
          events.push({ level, event, fields });
        },
      },
      dependencies: {
        jobQueue,
        async enqueueScheduledJobs() {
          scheduleCalls += 1;
        },
        async delay() {
          pauseCalls += 1;
          if (pauseCalls === 2) void worker.stop("TEST");
        },
      },
    });

    await worker.start();

    expect(heartbeatCalls).toBe(2);
    expect(scheduleCalls).toBe(1);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "error",
          event: "worker.poll_failed",
          fields: expect.objectContaining({ errorClass: "Error" }),
        }),
        expect.objectContaining({ event: "worker.stopped" }),
      ]),
    );
  });

  it("does not heartbeat, schedule, reconcile, or claim while availability is false", async () => {
    let worker;
    const jobQueue = {
      registerWorker: async () => "00000000-0000-4000-8000-000000000002",
      activateWorker: async () => {},
      heartbeat: vi.fn(),
      reconcileExpiredLeases: vi.fn(),
      claim: vi.fn(),
      beginWorkerStop: async () => {},
      stopWorker: async () => {},
    };
    const schedule = vi.fn();
    worker = createBackgroundWorker({
      database: {},
      config,
      handlers: { execute: vi.fn() },
      logger: { log() {} },
      dependencies: {
        jobQueue,
        enqueueScheduledJobs: schedule,
        databaseAvailability: { isAvailable: () => false },
        async delay() {
          await worker.stop("TEST_UNAVAILABLE");
        },
      },
    });

    await worker.start();

    expect(jobQueue.heartbeat).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    expect(jobQueue.reconcileExpiredLeases).not.toHaveBeenCalled();
    expect(jobQueue.claim).not.toHaveBeenCalled();
  });

  it("resumes new claims after availability recovers within the supervisor window", async () => {
    let available = false;
    let pauseCalls = 0;
    let worker;
    const jobQueue = {
      registerWorker: async () => "00000000-0000-4000-8000-000000000003",
      activateWorker: async () => {},
      heartbeat: vi.fn().mockResolvedValue(),
      reconcileExpiredLeases: vi.fn().mockResolvedValue(0),
      claim: vi.fn().mockResolvedValue([]),
      beginWorkerStop: async () => {},
      stopWorker: async () => {},
    };
    worker = createBackgroundWorker({
      database: {},
      config,
      handlers: { execute: vi.fn() },
      logger: { log() {} },
      dependencies: {
        jobQueue,
        enqueueScheduledJobs: vi.fn().mockResolvedValue(),
        databaseAvailability: { isAvailable: () => available },
        async delay() {
          pauseCalls += 1;
          if (pauseCalls === 1) available = true;
          else await worker.stop("TEST_RECOVERED");
        },
      },
    });

    await worker.start();

    expect(jobQueue.heartbeat).toHaveBeenCalledOnce();
    expect(jobQueue.reconcileExpiredLeases).toHaveBeenCalledOnce();
    expect(jobQueue.claim).toHaveBeenCalledOnce();
  });

  it("finishes its bounded local drain when database stop-state writes fail", async () => {
    const events = [];
    let worker;
    const databaseError = Object.assign(new Error("database URL must stay secret"), {
      code: "P2039",
    });
    const jobQueue = {
      registerWorker: async () => "00000000-0000-4000-8000-000000000004",
      activateWorker: async () => {},
      heartbeat: async () => {},
      reconcileExpiredLeases: async () => 0,
      claim: async () => [],
      beginWorkerStop: vi.fn().mockRejectedValue(databaseError),
      stopWorker: vi.fn().mockRejectedValue(databaseError),
    };
    worker = createBackgroundWorker({
      database: {},
      config,
      handlers: { execute: vi.fn() },
      logger: {
        log(level, event, fields) {
          events.push({ level, event, fields });
        },
      },
      dependencies: {
        jobQueue,
        enqueueScheduledJobs: async () => {},
        async delay() {
          await worker.stop("DATABASE_UNAVAILABLE");
        },
      },
    });

    await expect(worker.start()).resolves.toBeUndefined();

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "worker.stop_begin_failed" }),
        expect.objectContaining({ event: "worker.stop_record_failed" }),
        expect.objectContaining({ event: "worker.stopped" }),
      ]),
    );
    expect(JSON.stringify(events)).not.toContain("database URL");
  });

  it("does not replay an in-flight handler when outage lease writes fail", async () => {
    let available = true;
    let releaseHandler;
    let worker;
    const databaseError = Object.assign(new Error("database unavailable"), { code: "P2039" });
    const job = {
      id: "00000000-0000-4000-8000-000000000010",
      type: JOB_TYPES.AUDIT_CHAIN_VERIFY,
      schemaVersion: 1,
      payload: { bucket: "2026-09-09" },
      attemptCount: 1,
      createdAt: new Date("2026-09-09T00:00:00.000Z"),
    };
    const jobQueue = {
      registerWorker: async () => "00000000-0000-4000-8000-000000000011",
      activateWorker: async () => {},
      heartbeat: async () => {},
      reconcileExpiredLeases: async () => 0,
      claim: vi.fn().mockResolvedValueOnce([job]).mockResolvedValue([]),
      renew: vi.fn().mockResolvedValue(true),
      complete: vi.fn().mockRejectedValue(databaseError),
      fail: vi.fn().mockRejectedValue(databaseError),
      beginWorkerStop: vi.fn().mockRejectedValue(databaseError),
      stopWorker: vi.fn().mockRejectedValue(databaseError),
    };
    const execute = vi.fn(
      () =>
        new Promise((resolve) => {
          releaseHandler = resolve;
        }),
    );
    worker = createBackgroundWorker({
      database: {},
      config,
      handlers: { execute },
      logger: { log() {} },
      dependencies: {
        jobQueue,
        enqueueScheduledJobs: async () => {},
        databaseAvailability: { isAvailable: () => available },
        async delay() {
          available = false;
          const stopping = worker.stop("DATABASE_UNAVAILABLE");
          releaseHandler();
          await stopping;
        },
      },
    });

    await worker.start();

    expect(execute).toHaveBeenCalledOnce();
    expect(jobQueue.complete).toHaveBeenCalledOnce();
    expect(jobQueue.fail).toHaveBeenCalledOnce();
    expect(jobQueue.claim).toHaveBeenCalledOnce();
  });
});
