import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigurationError, loadEnvironment } from "./env.js";

const validEnvironment = {
  NODE_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: "4001",
  CORS_ORIGIN: "http://127.0.0.1:5173",
  DATABASE_URL: "mysql://user:secret@127.0.0.1:3306/opspilot_test",
};
const documentStorageRoot = path.resolve("tmp", "opspilot-documents-test");
const workflowEnvironment = {
  ...validEnvironment,
  AI_ENABLED: "true",
  AI_SERVICE_SIGNING_KEY: Buffer.alloc(32, 0x61).toString("base64"),
  AI_SERVICE_SIGNING_KEY_ID: "phase9-node-to-ai-v1",
  AI_WORKFLOWS_ENABLED: "true",
  AI_WORKFLOW_NODE_SIGNING_KEY: Buffer.alloc(32, 0x62).toString("base64"),
  AI_WORKFLOW_NODE_SIGNING_KEY_ID: "phase9-ai-to-node-v1",
  AI_WORKFLOW_ARTIFACT_KEY: Buffer.alloc(32, 0x63).toString("base64"),
  AI_WORKFLOW_ARTIFACT_KEY_ID: "phase9-artifacts-v1",
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
      database: { probeIntervalMs: 5000, failureExitMs: 30000 },
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
      ai: {
        productionDemoLocalTopologyAccepted: false,
        enabled: false,
        serviceUrl: "http://127.0.0.1:8000",
        signingKey: undefined,
        signingKeyId: undefined,
        timeoutMs: 22000,
        documentTimeoutMs: 120000,
        maximumConcurrency: 4,
        customer: {
          burstWindowMinutes: 15,
          burstMaximum: 5,
          dailyMaximum: 20,
        },
        owner: {
          burstWindowMinutes: 15,
          burstMaximum: 10,
          dailyMaximum: 50,
        },
        globalDailyCostLimitUsdCents: 200,
        maximumRequestCostUsdCents: 2,
        workflows: {
          enabled: false,
          businessBriefEnabled: false,
          supportEnabled: false,
          supportDataProcessingConfirmed: false,
          nodeSigningKey: undefined,
          nodeSigningKeyId: undefined,
          artifactKey: undefined,
          artifactKeyId: undefined,
          burstWindowMinutes: 15,
          burstMaximum: 5,
          dailyMaximum: 30,
          maximumActivePerUser: 3,
          runTtlHours: 24,
          approvalTtlMinutes: 30,
          artifactTtlHours: 24,
        },
      },
      documents: {
        enabled: false,
        storage: { adapter: "filesystem", root: undefined },
        encryption: { key: undefined, keyId: undefined },
        maximumUploadBytes: 262144,
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
    expect(() =>
      loadEnvironment({ ...validEnvironment, DATABASE_PROBE_INTERVAL_MS: "999" }),
    ).toThrow(ConfigurationError);
    expect(() =>
      loadEnvironment({
        ...validEnvironment,
        DATABASE_PROBE_INTERVAL_MS: "6000",
        DATABASE_FAILURE_EXIT_MS: "5000",
      }),
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
        RAZORPAY_KEY_ID: "rzp_test_unitidentifier",
        RAZORPAY_KEY_SECRET: "safe-test-key-secret",
        RAZORPAY_WEBHOOK_SECRET: "safe-test-webhook-secret",
      }).payments.razorpay.enabled,
    ).toBe(true);
  });

  it("requires a safe loopback URL and signing secret when AI is enabled", () => {
    expect(() =>
      loadEnvironment({ ...validEnvironment, AI_SERVICE_URL: "https://api.x.ai" }),
    ).toThrow(ConfigurationError);
    expect(() => loadEnvironment({ ...validEnvironment, AI_ENABLED: "true" })).toThrow(
      ConfigurationError,
    );

    const configured = loadEnvironment({
      ...validEnvironment,
      AI_ENABLED: "true",
      AI_SERVICE_SIGNING_KEY: Buffer.alloc(32, 0x61).toString("base64"),
      AI_SERVICE_SIGNING_KEY_ID: "phase7-test-v1",
    });
    expect(configured.ai.enabled).toBe(true);
    expect(configured.ai.serviceUrl).toBe("http://127.0.0.1:8000");
  });

  it("keeps Phase 7 AI disabled for production and validates cost holds", () => {
    const aiEnvironment = {
      ...validEnvironment,
      AI_ENABLED: "true",
      AI_SERVICE_SIGNING_KEY: Buffer.alloc(32, 0x61).toString("base64"),
      AI_SERVICE_SIGNING_KEY_ID: "phase7-test-v1",
    };
    expect(() =>
      loadEnvironment({ ...aiEnvironment, NODE_ENV: "production", AUTH_COOKIE_SECURE: "true" }),
    ).toThrow(ConfigurationError);
    expect(() =>
      loadEnvironment({
        ...aiEnvironment,
        AI_GLOBAL_DAILY_COST_LIMIT_USD_CENTS: "1",
        AI_MAX_REQUEST_COST_USD_CENTS: "2",
      }),
    ).toThrow(ConfigurationError);
  });

  it("accepts all local AI capabilities only for the explicitly approved production demo", () => {
    const configured = loadEnvironment({
      ...workflowEnvironment,
      NODE_ENV: "production",
      AUTH_COOKIE_SECURE: "true",
      RAZORPAY_ENABLED: "true",
      RAZORPAY_KEY_ID: "rzp_test_unitidentifier",
      RAZORPAY_KEY_SECRET: "safe-test-key-secret",
      RAZORPAY_WEBHOOK_SECRET: "safe-test-webhook-secret",
      AUDIT_INTEGRITY_KEY: Buffer.alloc(32, 0x41).toString("base64"),
      AUDIT_INTEGRITY_KEY_ID: "production-test-v1",
      AI_PRODUCTION_DEMO_LOCAL_TOPOLOGY_ACCEPTED: "true",
      AI_BUSINESS_BRIEF_ENABLED: "true",
      AI_SUPPORT_WORKFLOW_ENABLED: "true",
      AI_SUPPORT_DATA_PROCESSING_CONFIRMED: "true",
      DOCUMENTS_ENABLED: "true",
      DOCUMENT_STORAGE_ROOT: documentStorageRoot,
      DOCUMENT_ENCRYPTION_KEY: Buffer.alloc(32, 0x44).toString("base64"),
      DOCUMENT_ENCRYPTION_KEY_ID: "documents-test-v1",
    });

    expect(configured.ai).toMatchObject({
      productionDemoLocalTopologyAccepted: true,
      enabled: true,
      workflows: {
        enabled: true,
        businessBriefEnabled: true,
        supportEnabled: true,
        supportDataProcessingConfirmed: true,
      },
    });
    expect(configured.documents.enabled).toBe(true);

    expect(() =>
      loadEnvironment({
        ...validEnvironment,
        AI_PRODUCTION_DEMO_LOCAL_TOPOLOGY_ACCEPTED: "true",
      }),
    ).toThrow(ConfigurationError);
  });

  it("requires complete, explicitly enabled workflow boundaries", () => {
    const configured = loadEnvironment({
      ...workflowEnvironment,
      AI_BUSINESS_BRIEF_ENABLED: "true",
    });
    expect(configured.ai.workflows).toMatchObject({
      enabled: true,
      businessBriefEnabled: true,
      supportEnabled: false,
      nodeSigningKeyId: "phase9-ai-to-node-v1",
      artifactKeyId: "phase9-artifacts-v1",
    });

    for (const field of [
      "AI_WORKFLOW_NODE_SIGNING_KEY",
      "AI_WORKFLOW_NODE_SIGNING_KEY_ID",
      "AI_WORKFLOW_ARTIFACT_KEY",
      "AI_WORKFLOW_ARTIFACT_KEY_ID",
    ]) {
      const incomplete = { ...workflowEnvironment };
      delete incomplete[field];
      expect(() => loadEnvironment(incomplete)).toThrow(ConfigurationError);
    }
    expect(() =>
      loadEnvironment({ ...validEnvironment, AI_BUSINESS_BRIEF_ENABLED: "true" }),
    ).toThrow(ConfigurationError);
  });

  it("requires separate support-data approval and the document boundary", () => {
    expect(() =>
      loadEnvironment({ ...workflowEnvironment, AI_SUPPORT_WORKFLOW_ENABLED: "true" }),
    ).toThrow(ConfigurationError);
    expect(() =>
      loadEnvironment({
        ...workflowEnvironment,
        AI_SUPPORT_WORKFLOW_ENABLED: "true",
        AI_SUPPORT_DATA_PROCESSING_CONFIRMED: "true",
      }),
    ).toThrow(ConfigurationError);

    const configured = loadEnvironment({
      ...workflowEnvironment,
      AI_SUPPORT_WORKFLOW_ENABLED: "true",
      AI_SUPPORT_DATA_PROCESSING_CONFIRMED: "true",
      DOCUMENTS_ENABLED: "true",
      DOCUMENT_STORAGE_ROOT: documentStorageRoot,
      DOCUMENT_ENCRYPTION_KEY: Buffer.alloc(32, 0x44).toString("base64"),
      DOCUMENT_ENCRYPTION_KEY_ID: "documents-test-v1",
    });
    expect(configured.ai.workflows.supportEnabled).toBe(true);
    expect(configured.ai.workflows.supportDataProcessingConfirmed).toBe(true);
  });

  it("rejects Live Mode and malformed Razorpay key IDs", () => {
    const liveKeyId = ["rzp", "live", "unitidentifier"].join("_");
    for (const keyId of [liveKeyId, "not-a-razorpay-key"]) {
      let error;
      try {
        loadEnvironment({
          ...validEnvironment,
          RAZORPAY_ENABLED: "true",
          RAZORPAY_KEY_ID: keyId,
          RAZORPAY_KEY_SECRET: "safe-test-key-secret",
          RAZORPAY_WEBHOOK_SECRET: "safe-test-webhook-secret",
        });
      } catch (caughtError) {
        error = caughtError;
      }

      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error.fields).toContain("RAZORPAY_KEY_ID");
      expect(error.message).not.toContain(keyId);
    }
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

  it("requires complete private document storage configuration when enabled", () => {
    expect(() => loadEnvironment({ ...validEnvironment, DOCUMENTS_ENABLED: "true" })).toThrow(
      ConfigurationError,
    );

    const configured = loadEnvironment({
      ...validEnvironment,
      DOCUMENTS_ENABLED: "true",
      DOCUMENT_STORAGE_ROOT: documentStorageRoot,
      DOCUMENT_ENCRYPTION_KEY: Buffer.alloc(32, 0x44).toString("base64"),
      DOCUMENT_ENCRYPTION_KEY_ID: "documents-test-v1",
    });

    expect(configured.documents).toEqual({
      enabled: true,
      storage: { adapter: "filesystem", root: documentStorageRoot },
      encryption: {
        key: Buffer.alloc(32, 0x44).toString("base64"),
        keyId: "documents-test-v1",
      },
      maximumUploadBytes: 262144,
    });
  });

  it("rejects unsafe document storage configuration without exposing key material", () => {
    const canary = "canary-document-key";
    let error;

    try {
      loadEnvironment({
        ...validEnvironment,
        DOCUMENTS_ENABLED: "true",
        DOCUMENT_STORAGE_ROOT: "relative-documents",
        DOCUMENT_ENCRYPTION_KEY: canary,
        DOCUMENT_ENCRYPTION_KEY_ID: "documents-test-v1",
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error.fields).toEqual(
      expect.arrayContaining(["DOCUMENT_STORAGE_ROOT", "DOCUMENT_ENCRYPTION_KEY"]),
    );
    expect(error.message).not.toContain(canary);
  });

  it("rejects the development filesystem document adapter in production", () => {
    expect(() =>
      loadEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
        AUTH_COOKIE_SECURE: "true",
        RAZORPAY_ENABLED: "true",
        RAZORPAY_KEY_ID: "rzp_test_unitidentifier",
        RAZORPAY_KEY_SECRET: "safe-test-key-secret",
        RAZORPAY_WEBHOOK_SECRET: "safe-test-webhook-secret",
        AUDIT_INTEGRITY_KEY: Buffer.alloc(32, 0x41).toString("base64"),
        AUDIT_INTEGRITY_KEY_ID: "production-test-v1",
        DOCUMENTS_ENABLED: "true",
        DOCUMENT_STORAGE_ROOT: documentStorageRoot,
        DOCUMENT_ENCRYPTION_KEY: Buffer.alloc(32, 0x44).toString("base64"),
        DOCUMENT_ENCRYPTION_KEY_ID: "documents-test-v1",
      }),
    ).toThrow(ConfigurationError);
  });
});
