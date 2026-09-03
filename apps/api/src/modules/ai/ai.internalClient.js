import { createHash, createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import { AI_MODEL, AI_OUTCOMES, AI_SAFE_NOTICES } from "./ai.constants.js";

const maximumResponseBytes = 64 * 1024;
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
    promptVersion: z.enum(["customer-help-v1", "owner-overview-v1"]),
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

export class AiInternalClientError extends Error {
  constructor(code, costDisposition = "HOLD") {
    super("The internal AI service request failed");
    this.name = "AiInternalClientError";
    this.code = safeCodePattern.test(code) ? code : "AI_SERVICE_UNAVAILABLE";
    this.costDisposition = costDisposition;
  }
}

function readBoundedJson(response) {
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
    return { status: "ready", provider: "disabled" };
  }

  async respond() {
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

  async request(path, { method = "GET", payload, requestId }) {
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
        signal: AbortSignal.timeout(this.config.timeoutMs),
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
      parsed = await readBoundedJson(response);
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
}

export function createAiInternalClient(config, dependencies = {}) {
  if (!config.ai?.enabled) return new DisabledAiInternalClient();
  return new SignedAiInternalClient(config.ai, {
    fetchImplementation: dependencies.fetchImplementation ?? globalThis.fetch,
    now: dependencies.now ?? (() => new Date()),
    idFactory: dependencies.idFactory ?? randomUUID,
  });
}
