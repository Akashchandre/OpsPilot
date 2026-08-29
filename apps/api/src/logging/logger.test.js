import { describe, expect, it } from "vitest";
import { createJsonLogger } from "./logger.js";

describe("JSON logger", () => {
  it("emits one JSON line using only allowlisted fields", () => {
    const lines = [];
    const logger = createJsonLogger(
      { nodeEnv: "test", logging: { level: "debug" } },
      { write: (line) => lines.push(line) },
    );

    logger.log("info", "request.completed", {
      requestId: "4df53f6e-568f-43dd-8adb-d674909f6095",
      method: "POST",
      route: "/tickets/:ticketId",
      statusCode: 200,
      durationMs: 12.125,
      password: "canary-password",
      body: { message: "canary-ticket-content" },
      authorization: "canary-token",
    });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      level: "info",
      service: "opspilot-api",
      environment: "test",
      event: "request.completed",
      method: "POST",
      route: "/tickets/:ticketId",
      statusCode: 200,
    });
    expect(lines[0]).not.toContain("canary");
  });

  it("honors the minimum level and always disables production debug output", () => {
    const errorOnly = [];
    const errorLogger = createJsonLogger(
      { nodeEnv: "development", logging: { level: "error" } },
      { write: (line) => errorOnly.push(line) },
    );
    errorLogger.log("info", "request.completed");
    errorLogger.log("error", "request.completed");
    expect(errorOnly).toHaveLength(1);

    const production = [];
    const productionLogger = createJsonLogger(
      { nodeEnv: "production", logging: { level: "debug" } },
      { write: (line) => production.push(line) },
    );
    productionLogger.log("debug", "request.completed");
    productionLogger.log("info", "request.completed");
    expect(production).toHaveLength(1);
    expect(JSON.parse(production[0]).level).toBe("info");
  });

  it("keeps worker records to safe scalar evidence without payload or stack content", () => {
    const lines = [];
    const logger = createJsonLogger(
      { nodeEnv: "test", logging: { level: "info" } },
      { write: (line) => lines.push(line), service: "opspilot-worker" },
    );
    logger.log("warn", "job.failed", {
      workerId: "00000000-0000-4000-8000-000000000001",
      jobId: "00000000-0000-4000-8000-000000000002",
      jobType: "NOTIFICATION_PAYMENT_STATUS_CHANGED",
      jobStatus: "FAILED",
      attempt: 2,
      durationMs: 25,
      errorCode: "TEMPORARY_FAILURE",
      payload: { address: "canary-private-address" },
      stack: "canary-private-stack",
      cookie: "canary-private-cookie",
    });

    expect(JSON.parse(lines[0])).toMatchObject({
      service: "opspilot-worker",
      event: "job.failed",
      jobType: "NOTIFICATION_PAYMENT_STATUS_CHANGED",
      errorCode: "TEMPORARY_FAILURE",
      attempt: 2,
    });
    expect(lines[0]).not.toContain("canary");
  });

  it("does not let a writer failure escape into application code", () => {
    const logger = createJsonLogger(
      { nodeEnv: "test", logging: { level: "info" } },
      {
        write() {
          throw new Error("stdout unavailable");
        },
      },
    );

    expect(() => logger.log("info", "service.started", { port: 4000 })).not.toThrow();
  });
});
