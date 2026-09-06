import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Router, raw } from "express";
import { z } from "zod";
import { AppError } from "../../errors/AppError.js";
import { AI_OUTCOMES } from "./ai.constants.js";
import { AI_WORKFLOW_TOOL_CODES } from "./ai.workflow.constants.js";
import { createAiWorkflowService } from "./ai.workflow.service.js";

const signatureVersion = "v1";
const replayWindowMs = 30_000;
const maximumReplayEntries = 10_000;
const uuid = z.uuid();
const safeCode = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/);

function internalAuthenticationError() {
  return new AppError({
    statusCode: 401,
    code: "INTERNAL_AUTHENTICATION_FAILED",
    message: "The internal request could not be authenticated",
  });
}

function canonical({ timestamp, nonce, requestId, method, path, body }) {
  return [
    signatureVersion,
    timestamp,
    nonce,
    requestId,
    method.toUpperCase(),
    path,
    createHash("sha256").update(body).digest("hex"),
  ].join("\n");
}

function createVerifier(config, dependencies = {}) {
  const now = dependencies.now ?? (() => new Date());
  const claimed = new Map();
  const encodedKey = config.ai?.workflows?.nodeSigningKey;
  const keyId = config.ai?.workflows?.nodeSigningKeyId;
  const key = encodedKey ? Buffer.from(encodedKey, "base64") : null;
  return function verify(request, _response, next) {
    try {
      if (!config.ai?.workflows?.enabled || !key || key.length < 32 || !keyId) {
        throw internalAuthenticationError();
      }
      const remote = request.socket?.remoteAddress ?? "";
      if (!new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]).has(remote)) {
        throw internalAuthenticationError();
      }
      const version = request.get("X-OpsPilot-Signature-Version");
      const suppliedKeyId = request.get("X-OpsPilot-Key-Id");
      const timestamp = request.get("X-OpsPilot-Timestamp");
      const nonce = request.get("X-OpsPilot-Nonce");
      const requestId = request.get("X-Request-Id");
      const supplied = request.get("X-OpsPilot-Signature");
      if (
        version !== signatureVersion ||
        suppliedKeyId !== keyId ||
        !timestamp ||
        !nonce ||
        !requestId ||
        !supplied ||
        !/^[0-9a-f]{64}$/.test(supplied) ||
        !z.uuid().safeParse(nonce).success ||
        !z.uuid().safeParse(requestId).success
      ) {
        throw internalAuthenticationError();
      }
      const parsedTime = new Date(timestamp);
      const current = now();
      if (
        parsedTime.toISOString() !== timestamp ||
        Math.abs(current - parsedTime) > replayWindowMs
      ) {
        throw internalAuthenticationError();
      }
      for (const [cachedNonce, expiresAt] of claimed) {
        if (expiresAt <= current.getTime()) claimed.delete(cachedNonce);
      }
      if (claimed.has(nonce) || claimed.size >= maximumReplayEntries) {
        throw internalAuthenticationError();
      }
      const body = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
      const expected = createHmac("sha256", key)
        .update(
          canonical({
            timestamp,
            nonce,
            requestId,
            method: request.method,
            path: request.originalUrl,
            body,
          }),
        )
        .digest();
      const actual = Buffer.from(supplied, "hex");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        throw internalAuthenticationError();
      }
      claimed.set(nonce, current.getTime() + 5 * 60 * 1000);
      request.internalRequestId = requestId;
      try {
        request.internalBody = body.length === 0 ? {} : JSON.parse(body.toString("utf8"));
      } catch {
        throw internalAuthenticationError();
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

const toolParams = z.strictObject({ toolCallId: uuid });
const toolBody = z.strictObject({
  contractVersion: z.literal(1),
  workflowRunId: uuid,
  toolCode: z.enum(Object.values(AI_WORKFLOW_TOOL_CODES)),
});
const modelStepBody = z.strictObject({
  contractVersion: z.literal(1),
  workflowRunId: uuid,
  modelStepId: uuid,
});
const usageSchema = z
  .strictObject({
    inputTokens: z.number().int().min(0).max(100000),
    outputTokens: z.number().int().min(0).max(500),
    totalTokens: z.number().int().min(0).max(100500),
    costInUsdTicks: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .refine((value) => value.totalTokens === value.inputTokens + value.outputTokens);
const businessOutput = z.strictObject({
  summary: z.string().trim().min(1).max(2000),
  findings: z
    .array(
      z.strictObject({
        text: z.string().trim().min(1).max(500),
        sourceLabels: z
          .array(z.enum(["REPORTS", "INVENTORY", "SUPPORT"]))
          .min(1)
          .max(3),
      }),
    )
    .max(8),
  nextSteps: z.array(z.string().trim().min(1).max(300)).max(5),
  uncertainties: z.array(z.string().trim().min(1).max(300)).max(5),
});
const supportOutput = z
  .strictObject({
    status: z.enum(["READY_FOR_REVIEW", "ESCALATE", "INSUFFICIENT_CONTEXT", "REFUSAL"]),
    draft: z.string().trim().min(1).max(2000).nullable(),
    reasons: z.array(z.string().trim().min(1).max(300)).max(5),
    citations: z.array(z.string().regex(/^S[1-3]$/)).max(3),
  })
  .superRefine((value, context) => {
    if (value.status === "READY_FOR_REVIEW" && !value.draft) {
      context.addIssue({ code: "custom", path: ["draft"] });
    }
    if (value.status !== "READY_FOR_REVIEW" && value.draft !== null) {
      context.addIssue({ code: "custom", path: ["draft"] });
    }
  });
const finalizeBody = z.discriminatedUnion("status", [
  z.strictObject({
    contractVersion: z.literal(1),
    workflowRunId: uuid,
    modelStepId: uuid,
    status: z.literal("SUCCEEDED"),
    outcome: z.enum(Object.values(AI_OUTCOMES)),
    output: z.union([businessOutput, supportOutput]),
    providerRequestId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
    usage: usageSchema,
    durationMs: z.number().int().min(0).max(60000),
  }),
  z.strictObject({
    contractVersion: z.literal(1),
    workflowRunId: uuid,
    modelStepId: uuid,
    status: z.enum(["FAILED", "UNKNOWN"]),
    safeErrorCode: safeCode,
    durationMs: z.number().int().min(0).max(60000),
  }),
]);

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError({
      statusCode: 400,
      code: "INVALID_INTERNAL_REQUEST",
      message: "The internal request is invalid",
    });
  }
  return result.data;
}

export function createAiWorkflowGatewayRouter(database, config, aiClient, documentStore) {
  const router = Router();
  const service = createAiWorkflowService(database, config, aiClient, { documentStore });
  router.use(raw({ type: "application/json", limit: "100kb" }));
  router.use(createVerifier(config));

  router.post("/workflow-tools/:toolCallId/execute", async (request, response, next) => {
    try {
      const params = parse(toolParams, request.params);
      const body = parse(toolBody, request.internalBody);
      const output = await service.executeTool({
        toolCallId: params.toolCallId,
        workflowRunId: body.workflowRunId,
        toolCode: body.toolCode,
        requestId: request.internalRequestId,
      });
      response
        .status(200)
        .json({ success: true, data: { output }, requestId: request.internalRequestId });
    } catch (error) {
      next(error);
    }
  });
  router.post("/workflow-model-steps/:modelStepId/reserve", async (request, response, next) => {
    try {
      const body = parse(modelStepBody, request.internalBody);
      if (body.modelStepId !== request.params.modelStepId) throw internalAuthenticationError();
      const result = await service.reserveModelStep({
        ...body,
        requestId: request.internalRequestId,
      });
      response
        .status(200)
        .json({ success: true, data: result, requestId: request.internalRequestId });
    } catch (error) {
      next(error);
    }
  });
  router.post("/workflow-model-steps/:modelStepId/finalize", async (request, response, next) => {
    try {
      const body = parse(finalizeBody, request.internalBody);
      if (body.modelStepId !== request.params.modelStepId) throw internalAuthenticationError();
      const result = await service.finalizeModelStep({
        workflowRunId: body.workflowRunId,
        modelStepId: body.modelStepId,
        result: body,
        requestId: request.internalRequestId,
      });
      response
        .status(200)
        .json({ success: true, data: result, requestId: request.internalRequestId });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
