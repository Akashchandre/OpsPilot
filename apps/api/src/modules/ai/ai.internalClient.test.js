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
      documentTimeoutMs: 120000,
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
    citations: [],
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

function documentResponseData() {
  return {
    ...responseData(),
    answer: "The return period is 30 days.",
    notices: [],
    citations: ["S1"],
    promptVersion: "customer-documents-v1",
  };
}

function indexData() {
  return {
    embeddingModel: "sentence-transformers/all-MiniLM-L6-v2",
    embeddingModelRevision: "5f1b8cd78bc4fb444dd171e59b18f3a3af89a079",
    embeddingDimension: 384,
    vectorCollection: "opspilot_documents_v1",
    indexVersion: 1,
    published: false,
    chunks: [
      {
        pointId: "00000000-0000-4000-8000-000000000010",
        ordinal: 0,
        byteStart: 0,
        byteEnd: 12,
        contentSha256: "a".repeat(64),
      },
    ],
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
          data: {
            service: "opspilot-ai",
            status: "ready",
            provider: "ready",
            embedding: "ready",
            vectorIndex: "ready",
          },
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
      embedding: "ready",
      vectorIndex: "ready",
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

  it("accepts the dedicated document response contract with source labels", async () => {
    const requestId = randomUUID();
    const payload = {
      contractVersion: 1,
      subjectId: randomUUID(),
      assistant: "CUSTOMER",
      intent: "CUSTOMER_DOCUMENT_QA",
      question: "What is the return period?",
      context: { sources: [{ label: "S1", excerpt: "Returns are accepted for 30 days." }] },
    };
    const data = documentResponseData();
    const client = createClient(
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true, data, requestId }), {
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    await expect(client.respond(payload, requestId)).resolves.toEqual(data);
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

  it("signs document indexing and validates the pinned index result", async () => {
    const requestId = randomUUID();
    const payload = {
      contractVersion: 1,
      documentVersionId: randomUUID(),
      indexVersion: 1,
      contentSha256: "b".repeat(64),
      audiences: ["CUSTOMER"],
      embeddingModel: "sentence-transformers/all-MiniLM-L6-v2",
      embeddingModelRevision: "5f1b8cd78bc4fb444dd171e59b18f3a3af89a079",
      content: "Support text",
    };
    const fetchImplementation = vi.fn(async (url, options) => {
      expect(url).toBe("http://127.0.0.1:8000/internal/v1/documents/index");
      expect(JSON.parse(options.body)).toEqual(payload);
      verifySignature(options, requestId, "/internal/v1/documents/index");
      return new Response(JSON.stringify({ success: true, data: indexData(), requestId }), {
        headers: { "Content-Type": "application/json" },
      });
    });
    const client = createClient(fetchImplementation);

    await expect(client.indexDocument(payload, requestId)).resolves.toEqual(indexData());
    expect(client.state).toBe("ready");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("validates publication, candidate, and deletion identities", async () => {
    const documentVersionId = randomUUID();
    const pointId = randomUUID();
    const responses = [
      {
        documentVersionId,
        indexVersion: 2,
        published: true,
      },
      {
        candidates: [{ pointId, documentVersionId, indexVersion: 2, score: 0.75 }],
      },
      { documentVersionId, deleted: true },
    ];
    const fetchImplementation = vi.fn(async (_url, options) => {
      const data = responses.shift();
      return new Response(
        JSON.stringify({ success: true, data, requestId: options.headers["X-Request-Id"] }),
        { headers: { "Content-Type": "application/json" } },
      );
    });
    const client = createClient(fetchImplementation);

    await expect(
      client.setDocumentPublication(
        { contractVersion: 1, documentVersionId, indexVersion: 2, published: true },
        "00000000-0000-4000-8000-000000000021",
      ),
    ).resolves.toEqual({ documentVersionId, indexVersion: 2, published: true });
    await expect(
      client.documentCandidates(
        {
          contractVersion: 1,
          assistant: "CUSTOMER",
          audiences: ["CUSTOMER"],
          question: "Where is support?",
          limit: 8,
        },
        "00000000-0000-4000-8000-000000000022",
      ),
    ).resolves.toEqual({
      candidates: [{ pointId, documentVersionId, indexVersion: 2, score: 0.75 }],
    });
    await expect(
      client.deleteDocumentVectors(
        { contractVersion: 1, documentVersionId },
        "00000000-0000-4000-8000-000000000023",
      ),
    ).resolves.toEqual({ documentVersionId, deleted: true });
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  it("signs and validates bounded vector inventory without source content", async () => {
    const requestId = randomUUID();
    const documentVersionId = randomUUID();
    const fetchImplementation = vi.fn(async (url, options) => {
      expect(url).toBe("http://127.0.0.1:8000/internal/v1/documents/inventory");
      expect(options.method).toBe("GET");
      expect(options.body).toBeUndefined();
      verifySignature(options, requestId, "/internal/v1/documents/inventory");
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            totalPoints: 2,
            versions: [{ documentVersionId, pointCount: 2 }],
          },
          requestId,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    });
    const client = createClient(fetchImplementation);

    await expect(client.documentVectorInventory(requestId)).resolves.toEqual({
      totalPoints: 2,
      versions: [{ documentVersionId, pointCount: 2 }],
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("fails closed on malformed document index descriptors", async () => {
    const requestId = randomUUID();
    const invalidResults = [
      { ...indexData(), embeddingDimension: 768 },
      {
        ...indexData(),
        chunks: [{ ...indexData().chunks[0], ordinal: 1 }],
      },
      {
        ...indexData(),
        chunks: [indexData().chunks[0], { ...indexData().chunks[0], ordinal: 1 }],
      },
    ];

    for (const data of invalidResults) {
      const client = createClient(
        vi.fn(
          async () =>
            new Response(JSON.stringify({ success: true, data, requestId }), {
              headers: { "Content-Type": "application/json" },
            }),
        ),
      );
      await expect(client.indexDocument({ indexVersion: 1 }, requestId)).rejects.toMatchObject({
        code: "AI_SERVICE_INVALID_RESPONSE",
      });
      expect(client.state).toBe("unavailable");
    }
  });

  it("fails closed when vector candidates are not in descending score order", async () => {
    const requestId = randomUUID();
    const documentVersionId = randomUUID();
    const data = {
      candidates: [
        { pointId: randomUUID(), documentVersionId, indexVersion: 1, score: 0.2 },
        { pointId: randomUUID(), documentVersionId, indexVersion: 1, score: 0.8 },
      ],
    };
    const client = createClient(
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true, data, requestId }), {
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    await expect(client.documentCandidates({}, requestId)).rejects.toMatchObject({
      code: "AI_SERVICE_INVALID_RESPONSE",
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
      {
        success: true,
        data: { ...documentResponseData(), citations: ["S1", "S1"] },
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

    await expect(client.health()).resolves.toEqual({
      status: "ready",
      provider: "disabled",
      embedding: "disabled",
      vectorIndex: "disabled",
    });
    await expect(client.respond()).rejects.toBeInstanceOf(AiInternalClientError);
    await expect(client.indexDocument()).rejects.toMatchObject({
      code: "AI_DISABLED",
      costDisposition: "RELEASE",
    });
    await expect(client.documentCandidates()).rejects.toMatchObject({ code: "AI_DISABLED" });
    await expect(client.documentVectorInventory()).rejects.toMatchObject({ code: "AI_DISABLED" });
    expect(client.state).toBe("disabled");
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
