import { describe, expect, it } from "vitest";
import { createBackgroundWorker } from "./jobs.worker.js";

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
});
