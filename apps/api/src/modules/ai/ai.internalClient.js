import { createHash, createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  DOCUMENT_EMBEDDING_DIMENSION,
  DOCUMENT_EMBEDDING_MODEL,
  DOCUMENT_EMBEDDING_MODEL_REVISION,
  DOCUMENT_VECTOR_COLLECTION,
} from "../documents/document.constants.js";
import { AI_MODEL, AI_OUTCOMES, AI_SAFE_NOTICES } from "./ai.constants.js";

const defaultMaximumResponseBytes = 64 * 1024;
const documentIndexMaximumResponseBytes = 512 * 1024;
const safeCodePattern = /^[A-Z][A-Z0-9_]{0,63}$/;
const providerIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const controlCharacterPattern = /\p{C}/u;
const markupPattern =
  /(?:https?:\/\/|www\.|<[A-Za-z!/][^>]*>|\[[^\]\n]+\]\([^\n)]+\)|`|\*\*|__|~~)/iu;
const markdownLinePattern = /^\s*(?:#{1,6}\s|[-+*]\s|\d+\.\s|>)/mu;

const errorEnvelopeSchema = z.strictObject({
  success: z.literal(false),
  error: z.strictObject({
    code: z.string().regex(safeCodePattern),
    message: z.string().min(1).max(200),
    costDisposition: z.enum(["RELEASE", "HOLD"]),
  }),
  requestId: z.uuid(),
});

const healthEnvelopeSchema = z.strictObject({
  success: z.literal(true),
  data: z.strictObject({
    service: z.literal("opspilot-ai"),
    status: z.enum(["ready", "unavailable"]),
    provider: z.enum(["disabled", "unverified", "ready", "unavailable"]),
    embedding: z.enum(["disabled", "ready", "unavailable"]),
    vectorIndex: z.enum(["disabled", "ready", "unavailable"]),
  }),
  requestId: z.uuid(),
});

const responseEnvelopeSchema = z.strictObject({
  success: z.literal(true),
  data: z.strictObject({
    answer: z
      .string()
      .min(1)
      .max(2000)
      .refine(
        (value) =>
          value === value.trim() &&
          value.normalize("NFC") === value &&
          !controlCharacterPattern.test(value.replaceAll("\n", "")) &&
          !markupPattern.test(value) &&
          !markdownLinePattern.test(value),
      ),
    outcome: z.enum(Object.values(AI_OUTCOMES)),
    notices: z
      .array(z.enum(Object.values(AI_SAFE_NOTICES)))
      .max(3)
      .refine((notices) => new Set(notices).size === notices.length),
    citations: z
      .array(z.string().regex(/^S[1-5]$/))
      .max(5)
      .refine((citations) => new Set(citations).size === citations.length),
    promptVersion: z.enum([
      "customer-help-v1",
      "owner-overview-v1",
      "customer-documents-v1",
      "owner-documents-v1",
    ]),
    model: z.literal(AI_MODEL),
    providerRequestId: z.string().regex(providerIdPattern),
    usage: z
      .strictObject({
        inputTokens: z.number().int().min(0).max(100000),
        outputTokens: z.number().int().min(0).max(500),
        totalTokens: z.number().int().min(0).max(100500),
        costInUsdTicks: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      })
      .refine((usage) => usage.totalTokens === usage.inputTokens + usage.outputTokens),
    durationMs: z.number().int().min(0).max(60000),
    zeroDataRetention: z.literal(true),
  }),
  requestId: z.uuid(),
});

const documentChunkDescriptorSchema = z
  .strictObject({
    pointId: z.uuid(),
    ordinal: z.number().int().min(0).max(999),
    byteStart: z.number().int().min(0).max(262143),
    byteEnd: z.number().int().min(1).max(262144),
    contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .refine((chunk) => chunk.byteEnd > chunk.byteStart);

const documentIndexEnvelopeSchema = z.strictObject({
  success: z.literal(true),
  data: z
    .strictObject({
      embeddingModel: z.literal(DOCUMENT_EMBEDDING_MODEL),
      embeddingModelRevision: z.literal(DOCUMENT_EMBEDDING_MODEL_REVISION),
      embeddingDimension: z.literal(DOCUMENT_EMBEDDING_DIMENSION),
      vectorCollection: z.literal(DOCUMENT_VECTOR_COLLECTION),
      indexVersion: z.number().int().min(1).max(2147483647),
      published: z.literal(false),
      chunks: z.array(documentChunkDescriptorSchema).min(1).max(1000),
    })
    .superRefine((data, context) => {
      const pointIds = new Set();
      for (const [index, chunk] of data.chunks.entries()) {
        if (chunk.ordinal !== index) {
          context.addIssue({ code: "custom", path: ["chunks", index, "ordinal"] });
        }
        if (pointIds.has(chunk.pointId)) {
          context.addIssue({ code: "custom", path: ["chunks", index, "pointId"] });
        }
        pointIds.add(chunk.pointId);
      }
    }),
  requestId: z.uuid(),
});

const documentPublicationEnvelopeSchema = z.strictObject({
  success: z.literal(true),
  data: z.strictObject({
    documentVersionId: z.uuid(),
    indexVersion: z.number().int().min(1).max(2147483647),
    published: z.boolean(),
  }),
  requestId: z.uuid(),
});

const documentCandidatesEnvelopeSchema = z.strictObject({
  success: z.literal(true),
  data: z.strictObject({
    candidates: z
      .array(
        z.strictObject({
          pointId: z.uuid(),
          documentVersionId: z.uuid(),
          indexVersion: z.number().int().min(1).max(2147483647),
          score: z.number().finite().min(-1).max(1),
        }),
      )
      .max(8)
      .refine((candidates) => {
        const pointIds = candidates.map((candidate) => candidate.pointId);
        return (
          new Set(pointIds).size === pointIds.length &&
          candidates.every(
            (candidate, index) => index === 0 || candidate.score <= candidates[index - 1].score,
          )
        );
      }),
  }),
  requestId: z.uuid(),
});

const documentDeleteEnvelopeSchema = z.strictObject({
  success: z.literal(true),
  data: z.strictObject({
    documentVersionId: z.uuid(),
    deleted: z.literal(true),
  }),
  requestId: z.uuid(),
});

const documentInventoryEnvelopeSchema = z.strictObject({
  success: z.literal(true),
  data: z
    .strictObject({
      totalPoints: z.number().int().min(0).max(100000),
      versions: z
        .array(
          z.strictObject({
            documentVersionId: z.uuid(),
            pointCount: z.number().int().min(1).max(100000),
          }),
        )
        .max(5000),
    })
    .superRefine((data, context) => {
      const ids = data.versions.map((version) => version.documentVersionId);
      const sorted = [...ids].sort();
      const pointCount = data.versions.reduce((total, version) => total + version.pointCount, 0);
      if (new Set(ids).size !== ids.length || ids.some((id, index) => id !== sorted[index])) {
        context.addIssue({ code: "custom", path: ["versions"] });
      }
      if (pointCount !== data.totalPoints) {
        context.addIssue({ code: "custom", path: ["totalPoints"] });
      }
    }),
  requestId: z.uuid(),
});

const workflowEnvelopeSchema = z.strictObject({
  success: z.literal(true),
  data: z.strictObject({
    workflowRunId: z.uuid(),
    status: z.enum(["RUNNING", "AWAITING_APPROVAL", "SUCCEEDED", "FAILED", "UNKNOWN"]),
    artifactId: z.uuid().nullable(),
  }),
  requestId: z.uuid(),
});

const workflowDeleteEnvelopeSchema = z.strictObject({
  success: z.literal(true),
  data: z.strictObject({ threadId: z.uuid(), deleted: z.literal(true) }),
  requestId: z.uuid(),
});

export class AiInternalClientError extends Error {
  constructor(code, costDisposition = "HOLD") {
    super("The internal AI service request failed");
    this.name = "AiInternalClientError";
    this.code = safeCodePattern.test(code) ? code : "AI_SERVICE_UNAVAILABLE";
    this.costDisposition = costDisposition;
  }
}

function readBoundedJson(response, maximumResponseBytes = defaultMaximumResponseBytes) {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new AiInternalClientError("AI_SERVICE_INVALID_RESPONSE");
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^(?:0|[1-9]\d*)$/.test(contentLength) || Number(contentLength) > maximumResponseBytes) {
      throw new AiInternalClientError("AI_SERVICE_INVALID_RESPONSE");
    }
  }
  return response.arrayBuffer().then((arrayBuffer) => {
    const bytes = Buffer.from(arrayBuffer);
    if (bytes.length > maximumResponseBytes) {
      throw new AiInternalClientError("AI_SERVICE_INVALID_RESPONSE");
    }
    try {
      return JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new AiInternalClientError("AI_SERVICE_INVALID_RESPONSE");
    }
  });
}

function signatureHeaders({ key, keyId, requestId, method, path, body, now, idFactory }) {
  const timestamp = now().toISOString();
  const nonce = idFactory();
  const digest = createHash("sha256").update(body).digest("hex");
  const canonical = ["v1", timestamp, nonce, requestId, method, path, digest].join("\n");
  const signature = createHmac("sha256", key).update(canonical).digest("hex");
  return {
    "X-OpsPilot-Signature-Version": "v1",
    "X-OpsPilot-Key-Id": keyId,
    "X-OpsPilot-Timestamp": timestamp,
    "X-OpsPilot-Nonce": nonce,
    "X-Request-Id": requestId,
    "X-OpsPilot-Signature": signature,
  };
}

class DisabledAiInternalClient {
  state = "disabled";

  async health() {
    return {
      status: "ready",
      provider: "disabled",
      embedding: "disabled",
      vectorIndex: "disabled",
    };
  }

  async respond() {
    throw new AiInternalClientError("AI_DISABLED", "RELEASE");
  }

  async indexDocument() {
    throw new AiInternalClientError("AI_DISABLED", "RELEASE");
  }

  async setDocumentPublication() {
    throw new AiInternalClientError("AI_DISABLED", "RELEASE");
  }

  async documentCandidates() {
    throw new AiInternalClientError("AI_DISABLED", "RELEASE");
  }

  async deleteDocumentVectors() {
    throw new AiInternalClientError("AI_DISABLED", "RELEASE");
  }

  async documentVectorInventory() {
    throw new AiInternalClientError("AI_DISABLED", "RELEASE");
  }

  async startWorkflow() {
    throw new AiInternalClientError("AI_DISABLED", "RELEASE");
  }

  async resumeWorkflow() {
    throw new AiInternalClientError("AI_DISABLED", "RELEASE");
  }

  async deleteWorkflowThread() {
    throw new AiInternalClientError("AI_DISABLED", "RELEASE");
  }
}

class SignedAiInternalClient {
  #state = "unavailable";

  constructor(config, dependencies) {
    this.config = config;
    this.fetch = dependencies.fetchImplementation;
    this.now = dependencies.now;
    this.idFactory = dependencies.idFactory;
    this.key = Buffer.from(config.signingKey, "base64");
  }

  get state() {
    return this.#state;
  }

  async request(
    path,
    {
      method = "GET",
      payload,
      requestId,
      timeoutMs = this.config.timeoutMs,
      maximumResponseBytes = defaultMaximumResponseBytes,
    },
  ) {
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const headers = signatureHeaders({
      key: this.key,
      keyId: this.config.signingKeyId,
      requestId,
      method,
      path,
      body,
      now: this.now,
      idFactory: this.idFactory,
    });
    if (payload !== undefined) headers["Content-Type"] = "application/json";

    let response;
    try {
      response = await this.fetch(`${this.config.serviceUrl}${path}`, {
        method,
        headers,
        body: payload === undefined ? undefined : body,
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      this.#state = "unavailable";
      const code =
        error?.name === "TimeoutError" || error?.name === "AbortError"
          ? "AI_SERVICE_TIMEOUT"
          : "AI_SERVICE_UNAVAILABLE";
      throw new AiInternalClientError(code);
    }

    let parsed;
    try {
      parsed = await readBoundedJson(response, maximumResponseBytes);
    } catch (error) {
      this.#state = "unavailable";
      throw error instanceof AiInternalClientError
        ? error
        : new AiInternalClientError("AI_SERVICE_INVALID_RESPONSE");
    }
    if (!response.ok) {
      const result = errorEnvelopeSchema.safeParse(parsed);
      if (!result.success || result.data.requestId !== requestId) {
        this.#state = "unavailable";
        throw new AiInternalClientError("AI_SERVICE_INVALID_RESPONSE");
      }
      this.#state = "unavailable";
      throw new AiInternalClientError(result.data.error.code, result.data.error.costDisposition);
    }
    return parsed;
  }

  async health(requestId = randomUUID()) {
    const parsed = await this.request("/internal/v1/health", { requestId });
    const result = healthEnvelopeSchema.safeParse(parsed);
    if (!result.success || result.data.requestId !== requestId) {
      this.#state = "unavailable";
      throw new AiInternalClientError("AI_SERVICE_INVALID_RESPONSE");
    }
    const ready = result.data.data.status === "ready" && result.data.data.provider === "ready";
    this.#state = ready ? "ready" : "unavailable";
    return result.data.data;
  }

  async respond(payload, requestId) {
    const parsed = await this.request("/internal/v1/responses", {
      method: "POST",
      payload,
      requestId,
    });
    const result = responseEnvelopeSchema.safeParse(parsed);
    if (!result.success || result.data.requestId !== requestId) {
      this.#state = "unavailable";
      throw new AiInternalClientError("AI_SERVICE_INVALID_RESPONSE");
    }
    this.#state = "ready";
    return result.data.data;
  }

  async indexDocument(payload, requestId) {
    const parsed = await this.request("/internal/v1/documents/index", {
      method: "POST",
      payload,
      requestId,
      timeoutMs: this.config.documentTimeoutMs,
      maximumResponseBytes: documentIndexMaximumResponseBytes,
    });
    const result = documentIndexEnvelopeSchema.safeParse(parsed);
    if (
      !result.success ||
      result.data.requestId !== requestId ||
      result.data.data.indexVersion !== payload.indexVersion
    ) {
      this.#state = "unavailable";
      throw new AiInternalClientError("AI_SERVICE_INVALID_RESPONSE");
    }
    this.#state = "ready";
    return result.data.data;
  }

  async setDocumentPublication(payload, requestId) {
    const parsed = await this.request("/internal/v1/documents/publication", {
      method: "POST",
      payload,
      requestId,
      timeoutMs: this.config.documentTimeoutMs,
    });
    const result = documentPublicationEnvelopeSchema.safeParse(parsed);
    if (
      !result.success ||
      result.data.requestId !== requestId ||
      result.data.data.documentVersionId !== payload.documentVersionId ||
      result.data.data.indexVersion !== payload.indexVersion ||
      result.data.data.published !== payload.published
    ) {
      this.#state = "unavailable";
      throw new AiInternalClientError("AI_SERVICE_INVALID_RESPONSE");
    }
    this.#state = "ready";
    return result.data.data;
  }

  async documentCandidates(payload, requestId) {
    const parsed = await this.request("/internal/v1/documents/candidates", {
      method: "POST",
      payload,
      requestId,
      timeoutMs: this.config.documentTimeoutMs,
    });
    const result = documentCandidatesEnvelopeSchema.safeParse(parsed);
    if (!result.success || result.data.requestId !== requestId) {
      this.#state = "unavailable";
      throw new AiInternalClientError("AI_SERVICE_INVALID_RESPONSE");
    }
    this.#state = "ready";
    return result.data.data;
  }

  async deleteDocumentVectors(payload, requestId) {
    const parsed = await this.request("/internal/v1/documents/delete", {
      method: "POST",
      payload,
      requestId,
      timeoutMs: this.config.documentTimeoutMs,
    });
    const result = documentDeleteEnvelopeSchema.safeParse(parsed);
    if (
      !result.success ||
      result.data.requestId !== requestId ||
      result.data.data.documentVersionId !== payload.documentVersionId
    ) {
      this.#state = "unavailable";
      throw new AiInternalClientError("AI_SERVICE_INVALID_RESPONSE");
    }
    this.#state = "ready";
    return result.data.data;
  }

  async documentVectorInventory(requestId) {
    const parsed = await this.request("/internal/v1/documents/inventory", {
      requestId,
      timeoutMs: this.config.documentTimeoutMs,
      maximumResponseBytes: documentIndexMaximumResponseBytes,
    });
    const result = documentInventoryEnvelopeSchema.safeParse(parsed);
    if (!result.success || result.data.requestId !== requestId) {
      this.#state = "unavailable";
      throw new AiInternalClientError("AI_SERVICE_INVALID_RESPONSE");
    }
    this.#state = "ready";
    return result.data.data;
  }

  async startWorkflow(payload, requestId) {
    const parsed = await this.request("/internal/v1/workflows/start", {
      method: "POST",
      payload,
      requestId,
      timeoutMs: this.config.timeoutMs,
    });
    const result = workflowEnvelopeSchema.safeParse(parsed);
    if (
      !result.success ||
      result.data.requestId !== requestId ||
      result.data.data.workflowRunId !== payload.workflowRunId
    ) {
      throw new AiInternalClientError("AI_SERVICE_INVALID_RESPONSE");
    }
    return result.data.data;
  }

  async resumeWorkflow(payload, requestId) {
    const parsed = await this.request("/internal/v1/workflows/resume", {
      method: "POST",
      payload,
      requestId,
      timeoutMs: this.config.timeoutMs,
    });
    const result = workflowEnvelopeSchema.safeParse(parsed);
    if (
      !result.success ||
      result.data.requestId !== requestId ||
      result.data.data.workflowRunId !== payload.workflowRunId
    ) {
      throw new AiInternalClientError("AI_SERVICE_INVALID_RESPONSE");
    }
    return result.data.data;
  }

  async deleteWorkflowThread(threadId, requestId) {
    const path = `/internal/v1/workflows/threads/${threadId}`;
    const parsed = await this.request(path, {
      method: "DELETE",
      requestId,
      timeoutMs: this.config.timeoutMs,
    });
    const result = workflowDeleteEnvelopeSchema.safeParse(parsed);
    if (
      !result.success ||
      result.data.requestId !== requestId ||
      result.data.data.threadId !== threadId
    ) {
      throw new AiInternalClientError("AI_SERVICE_INVALID_RESPONSE");
    }
    return result.data.data;
  }
}

export function createAiInternalClient(config, dependencies = {}) {
  if (!config.ai?.enabled) return new DisabledAiInternalClient();
  return new SignedAiInternalClient(config.ai, {
    fetchImplementation: dependencies.fetchImplementation ?? globalThis.fetch,
    now: dependencies.now ?? (() => new Date()),
    idFactory: dependencies.idFactory ?? randomUUID,
  });
}
