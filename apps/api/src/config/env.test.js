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
      logging: { level: "info" },
      proxy: { trustProxyHops: 0 },
      corsOrigin: "http://127.0.0.1:5173",
      databaseUrl: "mysql://user:secret@127.0.0.1:3306/opspilot_test",
      business: { currency: "INR" },
      auth: {
        sessionCookieName: "opspilot_session",
        csrfCookieName: "opspilot_csrf",
        sessionTtlHours: 24,
        cookieSecure: false,
        loginRateLimitWindowMinutes: 15,
        loginRateLimitMax: 10,
      },
      rateLimit: {
        api: { windowMinutes: 5, maximum: 300 },
        support: { windowMinutes: 15, maximum: 30 },
        reports: { windowMinutes: 5, maximum: 60 },
        webhook: { windowMinutes: 5, maximum: 600 },
      },
      jobs: {
        pollIntervalMs: 500,
        concurrency: 4,
        leaseSeconds: 30,
        maxAttempts: 8,
        retryBaseMs: 1000,
        retryMaxMs: 900000,
        shutdownGraceSeconds: 30,
      },
      realtime: {
        notificationPollIntervalMs: 500,
        sessionRecheckSeconds: 30,
        maxConnectionsPerUser: 5,
        connectionRateLimitMax: 20,
      },
      payments: {
        reservationTtlMinutes: 15,
        razorpay: {
          enabled: false,
          keyId: undefined,
          keySecret: undefined,
          webhookSecret: undefined,
          apiBaseUrl: "https://api.razorpay.com/v1",
          checkoutScriptUrl: "https://checkout.razorpay.com/v1/checkout.js",
          requestTimeoutMs: 8000,
        },
      },
      audit: {
        integrityKey: expect.any(String),
        integrityKeyId: "routine-test-v1",
      },
    });

    expect(
      Buffer.from(loadEnvironment(validEnvironment).audit.integrityKey, "base64"),
    ).toHaveLength(32);
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

  it("validates logging, proxy, and rate-control bounds", () => {
    expect(() => loadEnvironment({ ...validEnvironment, LOG_LEVEL: "verbose" })).toThrow(
      ConfigurationError,
    );
    expect(() => loadEnvironment({ ...validEnvironment, TRUST_PROXY_HOPS: "11" })).toThrow(
      ConfigurationError,
    );
    expect(() => loadEnvironment({ ...validEnvironment, API_RATE_LIMIT_MAX: "0" })).toThrow(
      ConfigurationError,
    );
    expect(() => loadEnvironment({ ...validEnvironment, WORKER_CONCURRENCY: "0" })).toThrow(
      ConfigurationError,
    );
    expect(() =>
      loadEnvironment({
        ...validEnvironment,
        JOB_RETRY_BASE_MS: "2000",
        JOB_RETRY_MAX_MS: "1000",
      }),
    ).toThrow(ConfigurationError);
    expect(() =>
      loadEnvironment({ ...validEnvironment, REALTIME_MAX_CONNECTIONS_PER_USER: "21" }),
    ).toThrow(ConfigurationError);
  });

  it("validates the single-business currency code", () => {
    expect(() => loadEnvironment({ ...validEnvironment, BUSINESS_CURRENCY: "inr" })).toThrow(
      ConfigurationError,
    );
  });

  it("requires secure authentication cookies in production", () => {
    expect(() =>
      loadEnvironment({ ...validEnvironment, NODE_ENV: "production", AUTH_COOKIE_SECURE: "false" }),
    ).toThrow(ConfigurationError);
  });

  it("requires all Razorpay secrets when payments are enabled", () => {
    expect(() => loadEnvironment({ ...validEnvironment, RAZORPAY_ENABLED: "true" })).toThrow(
      ConfigurationError,
    );

    expect(
      loadEnvironment({
        ...validEnvironment,
        RAZORPAY_ENABLED: "true",
        RAZORPAY_KEY_ID: "safe-test-key-id",
        RAZORPAY_KEY_SECRET: "safe-test-key-secret",
        RAZORPAY_WEBHOOK_SECRET: "safe-test-webhook-secret",
      }).payments.razorpay.enabled,
    ).toBe(true);
  });

  it("requires a valid audit key and key ID outside routine tests", () => {
    expect(() => loadEnvironment({ ...validEnvironment, NODE_ENV: "development" })).toThrow(
      ConfigurationError,
    );

    const configured = loadEnvironment({
      ...validEnvironment,
      NODE_ENV: "development",
      AUDIT_INTEGRITY_KEY: Buffer.alloc(32, 0x41).toString("base64"),
      AUDIT_INTEGRITY_KEY_ID: "local-dev-v1",
    });
    expect(configured.audit.integrityKeyId).toBe("local-dev-v1");

    expect(() =>
      loadEnvironment({
        ...validEnvironment,
        AUDIT_INTEGRITY_KEY: "not-a-long-enough-key",
        AUDIT_INTEGRITY_KEY_ID: "test-key-v1",
      }),
    ).toThrow(ConfigurationError);
  });

  it("never exposes an invalid audit key in configuration errors", () => {
    const canary = "canary-audit-key-value";
    let error;
    try {
      loadEnvironment({
        ...validEnvironment,
        AUDIT_INTEGRITY_KEY: canary,
        AUDIT_INTEGRITY_KEY_ID: "test-key-v1",
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error.message).toContain("AUDIT_INTEGRITY_KEY");
    expect(error.message).not.toContain(canary);
  });
});
