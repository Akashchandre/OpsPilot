import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { createJsonLogger } from "./logging/logger.js";
import { PERMISSIONS } from "./modules/auth/auth.constants.js";
import { digestToken } from "./modules/auth/auth.tokens.js";

const origin = "http://127.0.0.1:5173";

const baseConfig = {
  nodeEnv: "test",
  logging: { level: "error" },
  proxy: { trustProxyHops: 0 },
  corsOrigin: origin,
  audit: {
    integrityKey: Buffer.alloc(32, 0x5a).toString("base64"),
    integrityKeyId: "routine-test-v1",
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
  auth: {
    sessionCookieName: "opspilot_test_session",
    csrfCookieName: "opspilot_test_csrf",
    sessionTtlHours: 1,
    cookieSecure: false,
    loginRateLimitWindowMinutes: 15,
    loginRateLimitMax: 100,
  },
  rateLimit: {
    api: { windowMinutes: 5, maximum: 1000 },
    support: { windowMinutes: 15, maximum: 1000 },
    reports: { windowMinutes: 5, maximum: 1000 },
    webhook: { windowMinutes: 5, maximum: 1000 },
  },
};

function configWith(overrides = {}) {
  return {
    ...baseConfig,
    ...overrides,
    logging: { ...baseConfig.logging, ...overrides.logging },
    proxy: { ...baseConfig.proxy, ...overrides.proxy },
    rateLimit: {
      api: { ...baseConfig.rateLimit.api, ...overrides.rateLimit?.api },
      support: { ...baseConfig.rateLimit.support, ...overrides.rateLimit?.support },
      reports: { ...baseConfig.rateLimit.reports, ...overrides.rateLimit?.reports },
      webhook: { ...baseConfig.rateLimit.webhook, ...overrides.rateLimit?.webhook },
    },
  };
}

function healthDatabase() {
  return { $queryRawUnsafe: vi.fn().mockResolvedValue([{ result: 1 }]) };
}

function session(userId, permissions = []) {
  return {
    id: `session-${userId}`,
    userId,
    tokenHash: "unused",
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    lastSeenAt: new Date(),
    user: {
      id: userId,
      email: `${userId}@example.com`,
      displayName: userId,
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
      roles: [
        {
          role: {
            code: "OWNER",
            rolePermissions: permissions.map((code) => ({ permission: { code } })),
          },
        },
      ],
    },
  };
}

function sessionDatabase(entries) {
  return {
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ result: 1 }]),
    authSession: {
      findUnique: vi.fn(({ where }) => entries.get(where.tokenHash) ?? null),
      update: vi.fn(),
    },
  };
}

describe("Phase 5 request hardening", () => {
  it("uses a server request ID and excludes headers, cookies, query, and body content from logs", async () => {
    const lines = [];
    const config = configWith({ logging: { level: "info" } });
    const logger = createJsonLogger(config, { write: (line) => lines.push(line) });
    const clientRequestId = "2ceacb06-f35f-45b3-97a0-bc8da655e43a";
    const canaries = [
      "canary-query-token",
      "canary-authorization-token",
      "canary-session-cookie",
      "canary-password",
      "canary-ticket-message",
    ];

    const response = await request(createApp({ config, database: healthDatabase(), logger }))
      .post(`/api/v1/not-a-route?token=${canaries[0]}`)
      .set("Origin", origin)
      .set("X-Request-Id", clientRequestId)
      .set("Authorization", `Bearer ${canaries[1]}`)
      .set("Cookie", `${config.auth.sessionCookieName}=${canaries[2]}`)
      .send({ password: canaries[3], message: canaries[4] });

    expect(response.status).toBe(404);
    expect(response.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(response.headers["x-request-id"]).not.toBe(clientRequestId);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      event: "request.completed",
      requestId: response.headers["x-request-id"],
      method: "POST",
      route: "UNMATCHED",
      statusCode: 404,
    });
    for (const canary of canaries) expect(lines[0]).not.toContain(canary);
  });

  it("logs only a safe class and code for unexpected errors", async () => {
    const lines = [];
    const config = configWith({ logging: { level: "info" } });
    const logger = createJsonLogger(config, { write: (line) => lines.push(line) });
    const database = {
      user: {
        findUnique: vi.fn().mockRejectedValue(new Error("canary database connection secret")),
      },
    };

    const response = await request(createApp({ config, database, logger }))
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({ email: "operator@example.com", password: "canary login password" });

    expect(response.status).toBe(500);
    expect(response.body.error).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      level: "error",
      errorClass: "Error",
      errorCode: "INTERNAL_SERVER_ERROR",
      statusCode: 500,
    });
    expect(lines[0]).not.toContain("canary");
    expect(lines[0]).not.toContain("stack");
  });

  it("returns stable errors for malformed, oversized, and URL-encoded request bodies", async () => {
    const app = createApp({ config: baseConfig, database: healthDatabase() });

    const malformed = await request(app)
      .post("/api/v1/not-a-route")
      .set("Content-Type", "application/json")
      .send('{"broken":');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("INVALID_JSON");

    const tooLarge = await request(app)
      .post("/api/v1/not-a-route")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ data: "x".repeat(101 * 1024) }));
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.error.code).toBe("PAYLOAD_TOO_LARGE");

    const urlEncoded = await request(app)
      .post("/api/v1/not-a-route")
      .type("form")
      .send({ canary: "value" });
    expect(urlEncoded.status).toBe(415);
    expect(urlEncoded.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");

    const webhookTooLarge = await request(app)
      .post("/api/v1/payments/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ data: "x".repeat(65 * 1024) }));
    expect(webhookTooLarge.status).toBe(413);
    expect(webhookTooLarge.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("returns RATE_LIMITED with Retry-After and admits traffic after the window expires", async () => {
    const config = configWith({
      rateLimit: { api: { windowMinutes: 0.002, maximum: 1 } },
    });
    const app = createApp({ config, database: healthDatabase() });

    expect((await request(app).get("/api/v1/health")).status).toBe(200);
    const limited = await request(app).get("/api/v1/health");
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 180));
    expect((await request(app).get("/api/v1/health")).status).toBe(200);
  });

  it("keys authenticated general limits by the server session user and source", async () => {
    const firstToken = "first-opaque-session-token";
    const secondToken = "second-opaque-session-token";
    const database = sessionDatabase(
      new Map([
        [digestToken(firstToken), session("first-user")],
        [digestToken(secondToken), session("second-user")],
      ]),
    );
    const config = configWith({ rateLimit: { api: { maximum: 1 } } });
    const app = createApp({ config, database });
    const firstCookie = `${config.auth.sessionCookieName}=${firstToken}`;
    const secondCookie = `${config.auth.sessionCookieName}=${secondToken}`;

    expect((await request(app).get("/api/v1/auth/me").set("Cookie", firstCookie)).status).toBe(200);
    const limited = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", firstCookie)
      .set("X-User-Id", "second-user");
    expect(limited.status).toBe(429);
    expect((await request(app).get("/api/v1/auth/me").set("Cookie", secondCookie)).status).toBe(
      200,
    );
  });

  it("ignores forwarded sources by default and honors one exact trusted proxy hop", async () => {
    const untrustedConfig = configWith({ rateLimit: { api: { maximum: 1 } } });
    const untrustedApp = createApp({ config: untrustedConfig, database: healthDatabase() });
    expect(
      (await request(untrustedApp).get("/api/v1/health").set("X-Forwarded-For", "198.51.100.1"))
        .status,
    ).toBe(200);
    expect(
      (await request(untrustedApp).get("/api/v1/health").set("X-Forwarded-For", "198.51.100.2"))
        .status,
    ).toBe(429);

    const trustedConfig = configWith({
      proxy: { trustProxyHops: 1 },
      rateLimit: { api: { maximum: 1 } },
    });
    const trustedApp = createApp({ config: trustedConfig, database: healthDatabase() });
    expect(
      (await request(trustedApp).get("/api/v1/health").set("X-Forwarded-For", "198.51.100.1"))
        .status,
    ).toBe(200);
    expect(
      (await request(trustedApp).get("/api/v1/health").set("X-Forwarded-For", "198.51.100.2"))
        .status,
    ).toBe(200);
  });

  it("isolates support writes, report reads, and webhook traffic from general traffic", async () => {
    const token = "privileged-opaque-session-token";
    const cookie = `${baseConfig.auth.sessionCookieName}=${token}`;
    const database = sessionDatabase(
      new Map([
        [
          digestToken(token),
          session("privileged-user", [
            PERMISSIONS.SUPPORT_TICKETS_READ,
            PERMISSIONS.SUPPORT_TICKETS_MANAGE,
            PERMISSIONS.REPORTS_READ,
          ]),
        ],
      ]),
    );

    const supportConfig = configWith({ rateLimit: { support: { maximum: 1 } } });
    const supportApp = createApp({ config: supportConfig, database });
    expect(
      (
        await request(supportApp)
          .post("/api/v1/support/tickets")
          .set("Origin", origin)
          .set("Cookie", cookie)
          .send({})
      ).status,
    ).toBe(403);
    const supportLimited = await request(supportApp)
      .post("/api/v1/support/tickets")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({});
    expect(supportLimited.status).toBe(429);
    expect(supportLimited.body.error.code).toBe("RATE_LIMITED");

    const reportConfig = configWith({ rateLimit: { reports: { maximum: 1 } } });
    const reportApp = createApp({ config: reportConfig, database });
    expect(
      (await request(reportApp).get("/api/v1/reports/overview?from=invalid").set("Cookie", cookie))
        .status,
    ).toBe(422);
    const reportLimited = await request(reportApp)
      .get("/api/v1/reports/overview?from=invalid")
      .set("Cookie", cookie);
    expect(reportLimited.status).toBe(429);
    expect(reportLimited.body.error.code).toBe("RATE_LIMITED");

    const webhookConfig = configWith({
      rateLimit: {
        api: { maximum: 1 },
        webhook: { maximum: 2 },
      },
    });
    const webhookApp = createApp({ config: webhookConfig, database: healthDatabase() });
    expect((await request(webhookApp).get("/api/v1/health")).status).toBe(200);
    expect((await request(webhookApp).get("/api/v1/health")).status).toBe(429);

    for (let count = 0; count < 2; count += 1) {
      expect(
        (
          await request(webhookApp)
            .post("/api/v1/payments/webhooks/razorpay")
            .set("Content-Type", "application/json")
            .send({ event: "payment.captured" })
        ).status,
      ).toBe(503);
    }
    const webhookLimited = await request(webhookApp)
      .post("/api/v1/payments/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .send({ event: "payment.captured" });
    expect(webhookLimited.status).toBe(429);
    expect(webhookLimited.body.error.code).toBe("RATE_LIMITED");
  });
});
