import { z } from "zod";

const routineTestAuditKey = Buffer.alloc(32, 0x5a).toString("base64");
const routineTestAuditKeyId = "routine-test-v1";

function isValidAuditKey(value) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return false;
  }
  const decoded = Buffer.from(value, "base64");
  const normalizedInput = value.replace(/=+$/, "");
  const normalizedRoundTrip = decoded.toString("base64").replace(/=+$/, "");
  return decoded.length >= 32 && normalizedInput === normalizedRoundTrip;
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

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_HOST: z.string().trim().min(1).default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    CORS_ORIGIN: z.url(),
    DATABASE_URL: z.string().startsWith("mysql://"),
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
    RAZORPAY_ENABLED: environmentBoolean.default(false),
    RAZORPAY_KEY_ID: optionalEnvironmentString(z.string().trim().min(8).max(128)),
    RAZORPAY_KEY_SECRET: optionalEnvironmentString(z.string().trim().min(8).max(256)),
    RAZORPAY_WEBHOOK_SECRET: optionalEnvironmentString(z.string().trim().min(8).max(256)),
    CHECKOUT_RESERVATION_TTL_MINUTES: z.coerce.number().int().min(3).max(15).default(15),
    AUDIT_INTEGRITY_KEY: optionalEnvironmentString(
      z.string().trim().max(512).refine(isValidAuditKey),
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
