import { describe, expect, it } from "vitest";
import { ConfigurationError, loadEnvironment } from "./env.js";

const validEnvironment = {
  NODE_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: "4001",
  CORS_ORIGIN: "http://127.0.0.1:5173",
  DATABASE_URL: "mysql://user:secret@127.0.0.1:3306/opspilot_test",
};

describe("loadEnvironment", () => {
  it("normalizes valid configuration", () => {
    expect(loadEnvironment(validEnvironment)).toEqual({
      nodeEnv: "test",
      host: "127.0.0.1",
      port: 4001,
      corsOrigin: "http://127.0.0.1:5173",
      databaseUrl: "mysql://user:secret@127.0.0.1:3306/opspilot_test",
    });
  });

  it("reports field names without exposing secret values", () => {
    let error;

    try {
      loadEnvironment({ ...validEnvironment, DATABASE_URL: "highly-sensitive-value" });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error.message).toContain("DATABASE_URL");
    expect(error.message).not.toContain("highly-sensitive-value");
  });

  it("rejects invalid ports", () => {
    expect(() => loadEnvironment({ ...validEnvironment, API_PORT: "70000" })).toThrow(
      ConfigurationError,
    );
  });
});
