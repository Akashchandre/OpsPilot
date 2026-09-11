import path from "node:path";
import { z } from "zod";

const routineTestAuditKey = Buffer.alloc(32, 0x5a).toString("base64");
const routineTestAuditKeyId = "routine-test-v1";

function isValidBase64Key(value) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return false;
  }
  const decoded = Buffer.from(value, "base64");
  const normalizedInput = value.replace(/=+$/, "");
  const normalizedRoundTrip = decoded.toString("base64").replace(/=+$/, "");
  return decoded.length >= 32 && normalizedInput === normalizedRoundTrip;
}

function isValidExactBase64Key(value, byteLength) {
  if (!isValidBase64Key(value)) return false;
  return Buffer.from(value, "base64").length === byteLength;
}

const environmentBoolean = z.preprocess((value) => {
  if (typeof value === "boolean" || value === undefined) return value;
  if (typeof value === "string" && value.toLowerCase() === "true") return true;
  if (typeof value === "string" && value.toLowerCase() === "false") return false;
  return value;
}, z.boolean());

const optionalEnvironmentString = (schema) =>
  z.preprocess((value) => {
    if (typeof value === "string" && value.trim() === "") return undefined;
    return value;
  }, schema.optional());

const razorpayTestKeyIdSchema = z
  .string()
  .trim()
  .min(10)
  .max(128)
  .regex(/^rzp_test_[A-Za-z0-9]+$/);

const internalSigningKeyIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

const aiServiceUrlSchema = z
  .url()
  .refine((value) => {
    const url = new URL(value);
    const loopbackHosts = new Set(["127.0.0.1", "[::1]"]);
    return (
      url.protocol === "http:" &&
      loopbackHosts.has(url.hostname) &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  })
  .transform((value) => new URL(value).origin);

const absolutePrivatePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .refine((value) => path.isAbsolute(value));

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_HOST: z.string().trim().min(1).default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    CORS_ORIGIN: z.url(),
    DATABASE_URL: z.string().startsWith("mysql://"),
    DATABASE_PROBE_INTERVAL_MS: z.coerce.number().int().min(1000).max(60000).default(5000),
    DATABASE_FAILURE_EXIT_MS: z.coerce.number().int().min(5000).max(300000).default(30000),
    BUSINESS_CURRENCY: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/)
      .default("INR"),
    AUTH_SESSION_COOKIE_NAME: z.string().trim().min(1).max(64).default("opspilot_session"),
    AUTH_CSRF_COOKIE_NAME: z.string().trim().min(1).max(64).default("opspilot_csrf"),
    AUTH_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(24),
    AUTH_COOKIE_SECURE: environmentBoolean.default(false),
    AUTH_LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    AUTH_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000).default(10),
    API_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(5),
    API_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000000).default(300),
    SUPPORT_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    SUPPORT_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000000).default(30),
    REPORT_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(5),
    REPORT_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000000).default(60),
    WEBHOOK_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(5),
    WEBHOOK_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000000).default(600),
    WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(50).max(60000).default(500),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
    JOB_LEASE_SECONDS: z.coerce.number().int().min(10).max(300).default(30),
    JOB_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(8),
    JOB_RETRY_BASE_MS: z.coerce.number().int().min(100).max(60000).default(1000),
    JOB_RETRY_MAX_MS: z.coerce.number().int().min(1000).max(86400000).default(900000),
    WORKER_SHUTDOWN_GRACE_SECONDS: z.coerce.number().int().min(1).max(300).default(30),
    REALTIME_NOTIFICATION_POLL_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(60000)
      .default(500),
    REALTIME_SESSION_RECHECK_SECONDS: z.coerce.number().int().min(5).max(300).default(30),
    REALTIME_MAX_CONNECTIONS_PER_USER: z.coerce.number().int().min(1).max(20).default(5),
    REALTIME_CONNECTION_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000).default(20),
    AI_ENABLED: environmentBoolean.default(false),
    AI_SERVICE_URL: aiServiceUrlSchema.default("http://127.0.0.1:8000"),
    AI_SERVICE_SIGNING_KEY: optionalEnvironmentString(
      z.string().trim().max(512).refine(isValidBase64Key),
    ),
    AI_SERVICE_SIGNING_KEY_ID: optionalEnvironmentString(internalSigningKeyIdSchema),
    AI_SERVICE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(22000).default(22000),
    AI_DOCUMENT_SERVICE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(120000),
    AI_CUSTOMER_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000).default(5),
    AI_OWNER_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000).default(10),
    AI_CUSTOMER_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(1).max(10000).default(20),
    AI_OWNER_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(1).max(10000).default(50),
    AI_GLOBAL_DAILY_COST_LIMIT_USD_CENTS: z.coerce.number().int().min(1).max(100000).default(200),
    AI_MAX_REQUEST_COST_USD_CENTS: z.coerce.number().int().min(1).max(10000).default(2),
    AI_WORKFLOWS_ENABLED: environmentBoolean.default(false),
    AI_BUSINESS_BRIEF_ENABLED: environmentBoolean.default(false),
    AI_SUPPORT_WORKFLOW_ENABLED: environmentBoolean.default(false),
    AI_SUPPORT_DATA_PROCESSING_CONFIRMED: environmentBoolean.default(false),
    AI_WORKFLOW_NODE_SIGNING_KEY: optionalEnvironmentString(
      z.string().trim().max(512).refine(isValidBase64Key),
    ),
    AI_WORKFLOW_NODE_SIGNING_KEY_ID: optionalEnvironmentString(internalSigningKeyIdSchema),
    AI_WORKFLOW_ARTIFACT_KEY: optionalEnvironmentString(
      z
        .string()
        .trim()
        .max(512)
        .refine((value) => isValidExactBase64Key(value, 32)),
    ),
    AI_WORKFLOW_ARTIFACT_KEY_ID: optionalEnvironmentString(internalSigningKeyIdSchema),
    AI_WORKFLOW_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(5),
    AI_WORKFLOW_DAILY_LIMIT: z.coerce.number().int().min(1).max(1000).default(30),
    AI_WORKFLOW_MAX_ACTIVE_PER_USER: z.coerce.number().int().min(1).max(20).default(3),
    DOCUMENTS_ENABLED: environmentBoolean.default(false),
    DOCUMENT_STORAGE_ADAPTER: z.literal("filesystem").default("filesystem"),
    DOCUMENT_STORAGE_ROOT: optionalEnvironmentString(absolutePrivatePathSchema),
    DOCUMENT_ENCRYPTION_KEY: optionalEnvironmentString(
      z
        .string()
        .trim()
        .max(512)
        .refine((value) => isValidExactBase64Key(value, 32)),
    ),
    DOCUMENT_ENCRYPTION_KEY_ID: optionalEnvironmentString(internalSigningKeyIdSchema),
    DOCUMENT_MAX_UPLOAD_BYTES: z.coerce.number().int().min(262144).max(262144).default(262144),
    RAZORPAY_ENABLED: environmentBoolean.default(false),
    RAZORPAY_KEY_ID: optionalEnvironmentString(razorpayTestKeyIdSchema),
    RAZORPAY_KEY_SECRET: optionalEnvironmentString(z.string().trim().min(8).max(256)),
    RAZORPAY_WEBHOOK_SECRET: optionalEnvironmentString(z.string().trim().min(8).max(256)),
    CHECKOUT_RESERVATION_TTL_MINUTES: z.coerce.number().int().min(3).max(15).default(15),
    AUDIT_INTEGRITY_KEY: optionalEnvironmentString(
      z.string().trim().max(512).refine(isValidBase64Key),
    ),
    AUDIT_INTEGRITY_KEY_ID: optionalEnvironmentString(
      z
        .string()
        .trim()
        .min(1)
        .max(64)
        .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
    ),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === "production" && !environment.AUTH_COOKIE_SECURE) {
      context.addIssue({
        code: "custom",
        path: ["AUTH_COOKIE_SECURE"],
        message: "Production authentication cookies must be secure",
      });
    }

    if (environment.NODE_ENV === "production" && !environment.RAZORPAY_ENABLED) {
      context.addIssue({
        code: "custom",
        path: ["RAZORPAY_ENABLED"],
        message: "Production payments must be explicitly enabled",
      });
    }

    if (environment.RAZORPAY_ENABLED) {
      for (const field of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]) {
        if (!environment[field]) {
          context.addIssue({
            code: "custom",
            path: [field],
            message: `${field} is required when Razorpay is enabled`,
          });
        }
      }
    }

    if (environment.JOB_RETRY_MAX_MS < environment.JOB_RETRY_BASE_MS) {
      context.addIssue({
        code: "custom",
        path: ["JOB_RETRY_MAX_MS"],
        message: "JOB_RETRY_MAX_MS must be at least JOB_RETRY_BASE_MS",
      });
    }

    if (environment.DATABASE_FAILURE_EXIT_MS < environment.DATABASE_PROBE_INTERVAL_MS) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_FAILURE_EXIT_MS"],
        message: "DATABASE_FAILURE_EXIT_MS must be at least DATABASE_PROBE_INTERVAL_MS",
      });
    }

    if (environment.NODE_ENV === "production" && environment.AI_ENABLED) {
      context.addIssue({
        code: "custom",
        path: ["AI_ENABLED"],
        message: "Phase 7 AI requires a later approved production network topology",
      });
    }

    if (environment.AI_ENABLED) {
      for (const field of ["AI_SERVICE_SIGNING_KEY", "AI_SERVICE_SIGNING_KEY_ID"]) {
        if (!environment[field]) {
          context.addIssue({
            code: "custom",
            path: [field],
            message: `${field} is required when AI is enabled`,
          });
        }
      }
    }

    if (environment.AI_WORKFLOWS_ENABLED) {
      if (!environment.AI_ENABLED) {
        context.addIssue({
          code: "custom",
          path: ["AI_WORKFLOWS_ENABLED"],
          message: "AI_WORKFLOWS_ENABLED requires AI_ENABLED",
        });
      }
      for (const field of [
        "AI_WORKFLOW_NODE_SIGNING_KEY",
        "AI_WORKFLOW_NODE_SIGNING_KEY_ID",
        "AI_WORKFLOW_ARTIFACT_KEY",
        "AI_WORKFLOW_ARTIFACT_KEY_ID",
      ]) {
        if (!environment[field]) {
          context.addIssue({
            code: "custom",
            path: [field],
            message: `${field} is required when AI workflows are enabled`,
          });
        }
      }
    }

    if (environment.AI_BUSINESS_BRIEF_ENABLED && !environment.AI_WORKFLOWS_ENABLED) {
      context.addIssue({
        code: "custom",
        path: ["AI_BUSINESS_BRIEF_ENABLED"],
        message: "AI_BUSINESS_BRIEF_ENABLED requires AI_WORKFLOWS_ENABLED",
      });
    }

    if (environment.AI_SUPPORT_WORKFLOW_ENABLED) {
      if (!environment.AI_WORKFLOWS_ENABLED) {
        context.addIssue({
          code: "custom",
          path: ["AI_SUPPORT_WORKFLOW_ENABLED"],
          message: "AI_SUPPORT_WORKFLOW_ENABLED requires AI_WORKFLOWS_ENABLED",
        });
      }
      if (!environment.AI_SUPPORT_DATA_PROCESSING_CONFIRMED) {
        context.addIssue({
          code: "custom",
          path: ["AI_SUPPORT_DATA_PROCESSING_CONFIRMED"],
          message: "Support workflow processing requires separate data approval",
        });
      }
      if (!environment.DOCUMENTS_ENABLED) {
        context.addIssue({
          code: "custom",
          path: ["AI_SUPPORT_WORKFLOW_ENABLED"],
          message: "The support workflow requires the Phase 8 document boundary",
        });
      }
    }

    if (environment.NODE_ENV === "production" && environment.AI_WORKFLOWS_ENABLED) {
      context.addIssue({
        code: "custom",
        path: ["AI_WORKFLOWS_ENABLED"],
        message: "The Phase 9 local workflow topology is not approved for production",
      });
    }

    if (
      environment.AI_MAX_REQUEST_COST_USD_CENTS > environment.AI_GLOBAL_DAILY_COST_LIMIT_USD_CENTS
    ) {
      context.addIssue({
        code: "custom",
        path: ["AI_MAX_REQUEST_COST_USD_CENTS"],
        message: "The per-request AI cost hold cannot exceed the daily AI cost ceiling",
      });
    }

    if (environment.DOCUMENTS_ENABLED) {
      for (const field of [
        "DOCUMENT_STORAGE_ROOT",
        "DOCUMENT_ENCRYPTION_KEY",
        "DOCUMENT_ENCRYPTION_KEY_ID",
      ]) {
        if (!environment[field]) {
          context.addIssue({
            code: "custom",
            path: [field],
            message: `${field} is required when document storage is enabled`,
          });
        }
      }
    }

    if (environment.NODE_ENV === "production" && environment.DOCUMENTS_ENABLED) {
      context.addIssue({
        code: "custom",
        path: ["DOCUMENT_STORAGE_ADAPTER"],
        message: "The Phase 8 filesystem document adapter is not approved for production",
      });
    }

    const auditConfigurationProvided = Boolean(
      environment.AUDIT_INTEGRITY_KEY || environment.AUDIT_INTEGRITY_KEY_ID,
    );
    if (environment.NODE_ENV !== "test" || auditConfigurationProvided) {
      for (const field of ["AUDIT_INTEGRITY_KEY", "AUDIT_INTEGRITY_KEY_ID"]) {
        if (!environment[field]) {
          context.addIssue({
            code: "custom",
            path: [field],
            message: `${field} is required outside routine tests`,
          });
        }
      }
    }
  });

export class ConfigurationError extends Error {
  constructor(fields) {
    super(`Invalid environment configuration: ${fields.join(", ")}`);
    this.name = "ConfigurationError";
    this.fields = fields;
  }
}

export function loadEnvironment(source = process.env) {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new ConfigurationError(fields);
  }

  return Object.freeze({
    nodeEnv: result.data.NODE_ENV,
    host: result.data.API_HOST,
    port: result.data.API_PORT,
    logging: Object.freeze({ level: result.data.LOG_LEVEL }),
    proxy: Object.freeze({ trustProxyHops: result.data.TRUST_PROXY_HOPS }),
    corsOrigin: result.data.CORS_ORIGIN,
    databaseUrl: result.data.DATABASE_URL,
    database: Object.freeze({
      probeIntervalMs: result.data.DATABASE_PROBE_INTERVAL_MS,
      failureExitMs: result.data.DATABASE_FAILURE_EXIT_MS,
    }),
    business: Object.freeze({ currency: result.data.BUSINESS_CURRENCY }),
    auth: Object.freeze({
      sessionCookieName: result.data.AUTH_SESSION_COOKIE_NAME,
      csrfCookieName: result.data.AUTH_CSRF_COOKIE_NAME,
      sessionTtlHours: result.data.AUTH_SESSION_TTL_HOURS,
      cookieSecure: result.data.AUTH_COOKIE_SECURE,
      loginRateLimitWindowMinutes: result.data.AUTH_LOGIN_RATE_LIMIT_WINDOW_MINUTES,
      loginRateLimitMax: result.data.AUTH_LOGIN_RATE_LIMIT_MAX,
    }),
    rateLimit: Object.freeze({
      api: Object.freeze({
        windowMinutes: result.data.API_RATE_LIMIT_WINDOW_MINUTES,
        maximum: result.data.API_RATE_LIMIT_MAX,
      }),
      support: Object.freeze({
        windowMinutes: result.data.SUPPORT_RATE_LIMIT_WINDOW_MINUTES,
        maximum: result.data.SUPPORT_RATE_LIMIT_MAX,
      }),
      reports: Object.freeze({
        windowMinutes: result.data.REPORT_RATE_LIMIT_WINDOW_MINUTES,
        maximum: result.data.REPORT_RATE_LIMIT_MAX,
      }),
      webhook: Object.freeze({
        windowMinutes: result.data.WEBHOOK_RATE_LIMIT_WINDOW_MINUTES,
        maximum: result.data.WEBHOOK_RATE_LIMIT_MAX,
      }),
    }),
    jobs: Object.freeze({
      pollIntervalMs: result.data.WORKER_POLL_INTERVAL_MS,
      concurrency: result.data.WORKER_CONCURRENCY,
      leaseSeconds: result.data.JOB_LEASE_SECONDS,
      maxAttempts: result.data.JOB_MAX_ATTEMPTS,
      retryBaseMs: result.data.JOB_RETRY_BASE_MS,
      retryMaxMs: result.data.JOB_RETRY_MAX_MS,
      shutdownGraceSeconds: result.data.WORKER_SHUTDOWN_GRACE_SECONDS,
    }),
    realtime: Object.freeze({
      notificationPollIntervalMs: result.data.REALTIME_NOTIFICATION_POLL_INTERVAL_MS,
      sessionRecheckSeconds: result.data.REALTIME_SESSION_RECHECK_SECONDS,
      maxConnectionsPerUser: result.data.REALTIME_MAX_CONNECTIONS_PER_USER,
      connectionRateLimitMax: result.data.REALTIME_CONNECTION_RATE_LIMIT_MAX,
    }),
    ai: Object.freeze({
      enabled: result.data.AI_ENABLED,
      serviceUrl: result.data.AI_SERVICE_URL,
      signingKey: result.data.AI_SERVICE_SIGNING_KEY,
      signingKeyId: result.data.AI_SERVICE_SIGNING_KEY_ID,
      timeoutMs: result.data.AI_SERVICE_TIMEOUT_MS,
      documentTimeoutMs: result.data.AI_DOCUMENT_SERVICE_TIMEOUT_MS,
      maximumConcurrency: 4,
      customer: Object.freeze({
        burstWindowMinutes: 15,
        burstMaximum: result.data.AI_CUSTOMER_RATE_LIMIT_MAX,
        dailyMaximum: result.data.AI_CUSTOMER_DAILY_REQUEST_LIMIT,
      }),
      owner: Object.freeze({
        burstWindowMinutes: 15,
        burstMaximum: result.data.AI_OWNER_RATE_LIMIT_MAX,
        dailyMaximum: result.data.AI_OWNER_DAILY_REQUEST_LIMIT,
      }),
      globalDailyCostLimitUsdCents: result.data.AI_GLOBAL_DAILY_COST_LIMIT_USD_CENTS,
      maximumRequestCostUsdCents: result.data.AI_MAX_REQUEST_COST_USD_CENTS,
      workflows: Object.freeze({
        enabled: result.data.AI_WORKFLOWS_ENABLED,
        businessBriefEnabled: result.data.AI_BUSINESS_BRIEF_ENABLED,
        supportEnabled: result.data.AI_SUPPORT_WORKFLOW_ENABLED,
        supportDataProcessingConfirmed: result.data.AI_SUPPORT_DATA_PROCESSING_CONFIRMED,
        nodeSigningKey: result.data.AI_WORKFLOW_NODE_SIGNING_KEY,
        nodeSigningKeyId: result.data.AI_WORKFLOW_NODE_SIGNING_KEY_ID,
        artifactKey: result.data.AI_WORKFLOW_ARTIFACT_KEY,
        artifactKeyId: result.data.AI_WORKFLOW_ARTIFACT_KEY_ID,
        burstWindowMinutes: 15,
        burstMaximum: result.data.AI_WORKFLOW_RATE_LIMIT_MAX,
        dailyMaximum: result.data.AI_WORKFLOW_DAILY_LIMIT,
        maximumActivePerUser: result.data.AI_WORKFLOW_MAX_ACTIVE_PER_USER,
        runTtlHours: 24,
        approvalTtlMinutes: 30,
        artifactTtlHours: 24,
      }),
    }),
    documents: Object.freeze({
      enabled: result.data.DOCUMENTS_ENABLED,
      storage: Object.freeze({
        adapter: result.data.DOCUMENT_STORAGE_ADAPTER,
        root: result.data.DOCUMENT_STORAGE_ROOT,
      }),
      encryption: Object.freeze({
        key: result.data.DOCUMENT_ENCRYPTION_KEY,
        keyId: result.data.DOCUMENT_ENCRYPTION_KEY_ID,
      }),
      maximumUploadBytes: result.data.DOCUMENT_MAX_UPLOAD_BYTES,
    }),
    payments: Object.freeze({
      reservationTtlMinutes: result.data.CHECKOUT_RESERVATION_TTL_MINUTES,
      razorpay: Object.freeze({
        enabled: result.data.RAZORPAY_ENABLED,
        keyId: result.data.RAZORPAY_KEY_ID,
        keySecret: result.data.RAZORPAY_KEY_SECRET,
        webhookSecret: result.data.RAZORPAY_WEBHOOK_SECRET,
        apiBaseUrl: "https://api.razorpay.com/v1",
        checkoutScriptUrl: "https://checkout.razorpay.com/v1/checkout.js",
        requestTimeoutMs: 8000,
      }),
    }),
    audit: Object.freeze({
      integrityKey: result.data.AUDIT_INTEGRITY_KEY ?? routineTestAuditKey,
      integrityKeyId: result.data.AUDIT_INTEGRITY_KEY_ID ?? routineTestAuditKeyId,
    }),
  });
}
