import { createHash, createHmac, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AiInternalClientError, createAiInternalClient } from "./ai.internalClient.js";

const signingKey = Buffer.alloc(32, 0x61);
const signingKeyBase64 = signingKey.toString("base64");
const signingKeyId = "phase7-unit-v1";
const fixedTimestamp = new Date("2026-09-03T10:20:30.123Z");
const fixedNonce = "00000000-0000-4000-8000-000000000001";

function config(enabled = true) {
  return {
    ai: {
      enabled,
      serviceUrl: "http://127.0.0.1:8000",
      signingKey: enabled ? signingKeyBase64 : undefined,
      signingKeyId: enabled ? signingKeyId : undefined,
      timeoutMs: 22000,
    },
  };
}

function createClient(fetchImplementation) {
  return createAiInternalClient(config(), {
    fetchImplementation,
    now: () => fixedTimestamp,
    idFactory: () => fixedNonce,
  });
}

function responseData() {
  return {
    answer: "Use the Support area to create a ticket.",
    outcome: "ANSWER",
    notices: ["USE_STANDARD_SUPPORT"],
    promptVersion: "customer-help-v1",
    model: "openai/gpt-oss-120b",
    providerRequestId: "resp_phase7_unit",
    usage: {
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      costInUsdTicks: 150000,
    },
    durationMs: 123,
    zeroDataRetention: true,
  };
}

function verifySignature(options, requestId, path) {
  const body = options.body ?? "";
  const digest = createHash("sha256").update(body).digest("hex");
  const canonical = [
    "v1",
    fixedTimestamp.toISOString(),
    fixedNonce,
    requestId,
    options.method,
    path,
    digest,
  ].join("\n");
  const expected = createHmac("sha256", signingKey).update(canonical).digest("hex");
  expect(options.headers["X-OpsPilot-Signature"]).toBe(expected);
  expect(options.headers["X-OpsPilot-Key-Id"]).toBe(signingKeyId);
  expect(options.headers["X-OpsPilot-Timestamp"]).toBe(fixedTimestamp.toISOString());
}

describe("signed AI internal client", () => {
  it("signs the exact health method, path, body, nonce, and request ID", async () => {
    const requestId = randomUUID();
    const fetchImplementation = vi.fn(async (url, options) => {
      expect(url).toBe("http://127.0.0.1:8000/internal/v1/health");
      expect(options.redirect).toBe("error");
      expect(options.body).toBeUndefined();
      verifySignature(options, requestId, "/internal/v1/health");
      return new Response(
        JSON.stringify({
          success: true,
          data: { service: "opspilot-ai", status: "ready", provider: "ready" },
          requestId,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const client = createClient(fetchImplementation);

    await expect(client.health(requestId)).resolves.toEqual({
      service: "opspilot-ai",
      status: "ready",
      provider: "ready",
    });
    expect(client.state).toBe("ready");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("sends a bounded JSON response request and validates the narrow result", async () => {
    const requestId = randomUUID();
    const payload = {
      contractVersion: 1,
      subjectId: randomUUID(),
      assistant: "CUSTOMER",
      intent: "CUSTOMER_HELP",
      question: "How do I get support?",
      context: null,
    };
    const fetchImplementation = vi.fn(async (url, options) => {
      expect(url).toBe("http://127.0.0.1:8000/internal/v1/responses");
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(options.body)).toEqual(payload);
      verifySignature(options, requestId, "/internal/v1/responses");
      return new Response(JSON.stringify({ success: true, data: responseData(), requestId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const client = createClient(fetchImplementation);

    await expect(client.respond(payload, requestId)).resolves.toEqual(responseData());
    expect(client.state).toBe("ready");
  });

  it("maps signed internal errors without forwarding their message", async () => {
    const requestId = randomUUID();
    const fetchImplementation = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: false,
            error: {
              code: "PROVIDER_TIMEOUT",
              message: "The AI provider did not respond in time",
              costDisposition: "HOLD",
            },
            requestId,
          }),
          { status: 504, headers: { "Content-Type": "application/json" } },
        ),
    );
    const client = createClient(fetchImplementation);

    await expect(client.respond({}, requestId)).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
      costDisposition: "HOLD",
      message: "The internal AI service request failed",
    });
    expect(client.state).toBe("unavailable");
  });

  it("fails closed on request-ID mismatch, markup, duplicate notices, and oversized bodies", async () => {
    const requestId = randomUUID();
    const invalidBodies = [
      { success: true, data: responseData(), requestId: randomUUID() },
      {
        success: true,
        data: { ...responseData(), answer: "Visit https://unsafe.example" },
        requestId,
      },
      {
        success: true,
        data: {
          ...responseData(),
          notices: ["USE_STANDARD_SUPPORT", "USE_STANDARD_SUPPORT"],
        },
        requestId,
      },
    ];

    for (const body of invalidBodies) {
      const client = createClient(
        vi.fn(
          async () =>
            new Response(JSON.stringify(body), {
              headers: { "Content-Type": "application/json" },
            }),
        ),
      );
      await expect(client.respond({}, requestId)).rejects.toMatchObject({
        code: "AI_SERVICE_INVALID_RESPONSE",
      });
      expect(client.state).toBe("unavailable");
    }

    const oversized = createClient(
      vi.fn(
        async () =>
          new Response("{}", {
            headers: {
              "Content-Type": "application/json",
              "Content-Length": String(64 * 1024 + 1),
            },
          }),
      ),
    );
    await expect(oversized.respond({}, requestId)).rejects.toMatchObject({
      code: "AI_SERVICE_INVALID_RESPONSE",
    });
    expect(oversized.state).toBe("unavailable");

    for (const headers of [
      { "Content-Type": "text/html" },
      { "Content-Type": "application/json", "Content-Length": "not-a-number" },
    ]) {
      const malformed = createClient(vi.fn(async () => new Response("{}", { headers })));
      await expect(malformed.respond({}, requestId)).rejects.toMatchObject({
        code: "AI_SERVICE_INVALID_RESPONSE",
      });
      expect(malformed.state).toBe("unavailable");
    }
  });

  it("treats timeout and connection loss as ambiguous and never retries", async () => {
    for (const error of [
      Object.assign(new Error("late secret"), { name: "TimeoutError" }),
      new Error("network secret"),
    ]) {
      const fetchImplementation = vi.fn(async () => {
        throw error;
      });
      const client = createClient(fetchImplementation);
      const requestId = randomUUID();

      await expect(client.respond({}, requestId)).rejects.toMatchObject({
        code: error.name === "TimeoutError" ? "AI_SERVICE_TIMEOUT" : "AI_SERVICE_UNAVAILABLE",
        costDisposition: "HOLD",
      });
      expect(fetchImplementation).toHaveBeenCalledTimes(1);
    }
  });

  it("does not construct or call a signed client while AI is disabled", async () => {
    const fetchImplementation = vi.fn();
    const client = createAiInternalClient(config(false), { fetchImplementation });

    await expect(client.health()).resolves.toEqual({ status: "ready", provider: "disabled" });
    await expect(client.respond()).rejects.toBeInstanceOf(AiInternalClientError);
    expect(client.state).toBe("disabled");
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
