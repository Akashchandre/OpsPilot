import { createHash, createHmac, randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../middleware/errorHandler.js";
import { createAiWorkflowGatewayRouter } from "./ai.workflow.gateway.js";

const signingKey = Buffer.alloc(32, 0x34).toString("base64");
const keyId = "phase9-reverse-v1";
const config = {
  audit: {
    integrityKey: Buffer.alloc(32, 0x35).toString("base64"),
    integrityKeyId: "phase9-test-audit-v1",
  },
  ai: {
    workflows: {
      enabled: true,
      nodeSigningKey: signingKey,
      nodeSigningKeyId: keyId,
    },
  },
};

function signedHeaders(path, body, { nonce = randomUUID(), requestId = randomUUID() } = {}) {
  const timestamp = new Date().toISOString();
  const digest = createHash("sha256").update(body).digest("hex");
  const canonical = ["v1", timestamp, nonce, requestId, "POST", path, digest].join("\n");
  return {
    "X-OpsPilot-Signature-Version": "v1",
    "X-OpsPilot-Key-Id": keyId,
    "X-OpsPilot-Timestamp": timestamp,
    "X-OpsPilot-Nonce": nonce,
    "X-Request-Id": requestId,
    "X-OpsPilot-Signature": createHmac("sha256", Buffer.from(signingKey, "base64"))
      .update(canonical)
      .digest("hex"),
  };
}

function testApp() {
  const database = {
    aiWorkflowToolCall: { findFirst: vi.fn(async () => null) },
  };
  const app = express();
  app.use("/internal/v1/ai", createAiWorkflowGatewayRouter(database, config, {}, null));
  app.use(errorHandler);
  return app;
}

describe("AI-to-Node workflow gateway", () => {
  it("accepts an exact signed loopback body once and rejects nonce replay", async () => {
    const app = testApp();
    const toolCallId = randomUUID();
    const path = `/internal/v1/ai/workflow-tools/${toolCallId}/execute`;
    const body = JSON.stringify({
      contractVersion: 1,
      workflowRunId: randomUUID(),
      toolCode: "REPORTS_OVERVIEW_V1",
    });
    const headers = signedHeaders(path, body);

    const accepted = await request(app)
      .post(path)
      .set("Content-Type", "application/json")
      .set(headers)
      .send(body);
    expect(accepted.status).toBe(404);
    expect(accepted.body.error.code).toBe("AI_WORKFLOW_NOT_FOUND");

    const replay = await request(app)
      .post(path)
      .set("Content-Type", "application/json")
      .set(headers)
      .send(body);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("INTERNAL_AUTHENTICATION_FAILED");
  });

  it("rejects a body, path, or key identity that differs from the signature", async () => {
    const app = testApp();
    const toolCallId = randomUUID();
    const path = `/internal/v1/ai/workflow-tools/${toolCallId}/execute`;
    const signedBody = JSON.stringify({
      contractVersion: 1,
      workflowRunId: randomUUID(),
      toolCode: "REPORTS_OVERVIEW_V1",
    });
    const changedBody = signedBody.replace("REPORTS_OVERVIEW_V1", "INVENTORY_ATTENTION_V1");

    const tampered = await request(app)
      .post(path)
      .set("Content-Type", "application/json")
      .set(signedHeaders(path, signedBody))
      .send(changedBody);
    expect(tampered.status).toBe(401);

    const wrongKey = await request(app)
      .post(path)
      .set("Content-Type", "application/json")
      .set({ ...signedHeaders(path, signedBody), "X-OpsPilot-Key-Id": "old-key" })
      .send(signedBody);
    expect(wrongKey.status).toBe(401);
  });
});
