import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";

const config = {
  nodeEnv: "test",
  logging: { level: "error" },
  proxy: { trustProxyHops: 0 },
  corsOrigin: "http://127.0.0.1:5173",
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

describe("OpsPilot API foundation", () => {
  it("returns a healthy response when the database is reachable", async () => {
    const database = { $queryRawUnsafe: vi.fn().mockResolvedValue([{ result: 1 }]) };
    const response = await request(createApp({ config, database })).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.type).toMatch(/json/);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        status: "ok",
        service: "opspilot-api",
        database: "reachable",
      },
    });
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("returns a safe unavailable response when the database fails", async () => {
    const database = { $queryRawUnsafe: vi.fn().mockRejectedValue(new Error("secret db error")) };
    const response = await request(createApp({ config, database })).get("/api/v1/health");

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "The service is temporarily unavailable",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("secret db error");
  });

  it("returns the consistent error envelope for unknown routes", async () => {
    const database = { $queryRawUnsafe: vi.fn() };
    const response = await request(createApp({ config, database })).get("/api/v1/unknown");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: "ROUTE_NOT_FOUND" },
    });
  });

  it("allows only the configured browser origin", async () => {
    const database = { $queryRawUnsafe: vi.fn().mockResolvedValue([]) };
    const app = createApp({ config, database });

    const allowed = await request(app).get("/api/v1/health").set("Origin", "http://127.0.0.1:5173");
    const other = await request(app).get("/api/v1/health").set("Origin", "http://example.com");

    expect(allowed.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");
    expect(other.headers["access-control-allow-origin"]).not.toBe("http://example.com");
  });

  it("rejects unsafe requests without the configured origin", async () => {
    const database = { $queryRawUnsafe: vi.fn() };
    const response = await request(createApp({ config, database }))
      .post("/api/v1/auth/login")
      .send({ email: "customer@example.com", password: "a-secure-password" });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
  });
});
