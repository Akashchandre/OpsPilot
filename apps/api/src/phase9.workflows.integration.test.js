import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import { AI_WORKFLOW_NOTICE_VERSION } from "./modules/ai/ai.workflow.constants.js";
import { createAiWorkflowService } from "./modules/ai/ai.workflow.service.js";
import { AUDIT_GENESIS_HASH } from "./modules/audit/audit.constants.js";
import { createOpaqueToken, digestToken } from "./modules/auth/auth.tokens.js";

dotenv.config({ path: ".env.test", override: true, quiet: true });

const serviceSigningKey = Buffer.alloc(32, 0x31).toString("base64");
const reverseSigningKey = Buffer.alloc(32, 0x32).toString("base64");
const artifactKey = Buffer.alloc(32, 0x33).toString("base64");
const config = loadEnvironment({
  ...process.env,
  AI_ENABLED: "true",
  AI_SERVICE_SIGNING_KEY: serviceSigningKey,
  AI_SERVICE_SIGNING_KEY_ID: "phase9-node-to-ai-v1",
  DOCUMENTS_ENABLED: "true",
  DOCUMENT_STORAGE_ROOT: "C:\\tmp\\opspilot-phase9-documents",
  DOCUMENT_ENCRYPTION_KEY: Buffer.alloc(32, 0x34).toString("base64"),
  DOCUMENT_ENCRYPTION_KEY_ID: "phase9-documents-v1",
  AI_WORKFLOWS_ENABLED: "true",
  AI_BUSINESS_BRIEF_ENABLED: "true",
  AI_SUPPORT_WORKFLOW_ENABLED: "true",
  AI_SUPPORT_DATA_PROCESSING_CONFIRMED: "true",
  AI_WORKFLOW_NODE_SIGNING_KEY: reverseSigningKey,
  AI_WORKFLOW_NODE_SIGNING_KEY_ID: "phase9-ai-to-node-v1",
  AI_WORKFLOW_ARTIFACT_KEY: artifactKey,
  AI_WORKFLOW_ARTIFACT_KEY_ID: "phase9-artifacts-v1",
  AI_WORKFLOW_RATE_LIMIT_MAX: "100",
  AI_WORKFLOW_DAILY_LIMIT: "100",
  AI_WORKFLOW_MAX_ACTIVE_PER_USER: "10",
});
const database = createDatabase(config.databaseUrl);
const documentStore = {};
const aiClient = {
  state: "ready",
  health: vi.fn(async () => ({ status: "ready", provider: "ready" })),
  documentCandidates: vi.fn(async () => ({ candidates: [] })),
  respond: vi.fn(),
  startWorkflow: vi.fn(),
  resumeWorkflow: vi.fn(),
  deleteWorkflowThread: vi.fn(),
};
const app = createApp({ config, database, aiClient, documentStore });
const service = createAiWorkflowService(database, config, aiClient, { documentStore });

async function clearData() {
  await database.notification.deleteMany();
  await database.supportTicketMessage.deleteMany();
  await database.aiWorkflowApproval.deleteMany();
  await database.aiWorkflowToolCall.deleteMany();
  await database.aiUsageEvent.deleteMany();
  await database.aiWorkflowArtifact.deleteMany();
  await database.aiWorkflowRun.deleteMany();
  await database.aiProviderConsent.deleteMany();
  await database.backgroundJobAttempt.deleteMany();
  await database.backgroundJob.deleteMany();
  await database.workerHeartbeat.deleteMany();
  await database.supportTicketEvent.deleteMany();
  await database.supportTicket.deleteMany();
  await database.providerWebhookEvent.deleteMany();
  await database.refund.deleteMany();
  await database.paymentAttempt.deleteMany();
  await database.payment.deleteMany();
  await database.orderStatusEvent.deleteMany();
  await database.inventoryReservation.deleteMany();
  await database.orderItem.deleteMany();
  await database.order.deleteMany();
  await database.cartItem.deleteMany();
  await database.cart.deleteMany();
  await database.productCategory.deleteMany();
  await database.inventoryAdjustment.deleteMany();
  await database.inventoryBalance.deleteMany();
  await database.product.deleteMany();
  await database.category.deleteMany();
  await database.auditEvent.deleteMany();
  await database.auditChainHead.update({
    where: { id: 1 },
    data: { headSequence: 0n, headHash: AUDIT_GENESIS_HASH },
  });
  await database.securityEvent.deleteMany();
  await database.authSession.deleteMany();
  await database.userRole.deleteMany();
  await database.user.deleteMany();
}

async function authenticated(roleCode, label) {
  const user = await database.user.create({
    data: {
      email: `phase9-${label}-${randomUUID()}@example.com`,
      displayName: `Phase 9 ${label}`,
      passwordHash: "not-used-by-phase9-tests",
      roles: { create: { role: { connect: { code: roleCode } } } },
    },
  });
  const sessionToken = createOpaqueToken();
  const csrfToken = createOpaqueToken();
  await database.authSession.create({
    data: {
      userId: user.id,
      tokenHash: digestToken(sessionToken),
      csrfTokenHash: digestToken(csrfToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return {
    user,
    csrfToken,
    cookie: `${config.auth.sessionCookieName}=${sessionToken}; ${config.auth.csrfCookieName}=${csrfToken}`,
  };
}

function mutate(method, path, auth) {
  const agent = request(app);
  return agent[method](path)
    .set("Origin", config.corsOrigin)
    .set("Cookie", auth.cookie)
    .set("X-CSRF-Token", auth.csrfToken);
}

async function acceptConsent(auth, scope) {
  const response = await mutate("put", `/api/v1/ai/workflow-consents/${scope}`, auth).send({
    noticeVersion: AI_WORKFLOW_NOTICE_VERSION,
  });
  expect([200, 201]).toContain(response.status);
  return response;
}

async function seedTicket(requester) {
  const id = randomUUID();
  return database.supportTicket.create({
    data: {
      id,
      ticketNumber: `SP-${id.replaceAll("-", "").slice(0, 18).toUpperCase()}`,
      category: "ORDER",
      subject: "Where is my order?",
      priority: "NORMAL",
      status: "OPEN",
      requesterId: requester.id,
      idempotencyKey: randomUUID(),
      requestHash: "d".repeat(64),
      messages: {
        create: [
          {
            authorUserId: requester.id,
            visibility: "CUSTOMER_VISIBLE",
            body: "Please share the current delivery policy.",
            idempotencyKey: randomUUID(),
            requestHash: "a".repeat(64),
          },
          {
            authorUserId: requester.id,
            visibility: "INTERNAL",
            body: "INTERNAL SECRET NOTE",
            idempotencyKey: randomUUID(),
            requestHash: "b".repeat(64),
          },
        ],
      },
    },
  });
}

async function startSupportRun(owner, ticketId) {
  const response = await mutate("post", "/api/v1/ai/workflows/support-reply/runs", owner)
    .set("Idempotency-Key", randomUUID())
    .send({ ticketId });
  expect(response.status).toBe(202);
  return database.aiWorkflowRun.findUnique({
    where: { id: response.body.data.run.id },
    include: { toolCalls: { orderBy: { ordinal: "asc" } } },
  });
}

async function advanceSupportToReview(run) {
  await service.jobDescriptor(run.id, "START");
  const publicContext = await service.executeTool({
    toolCallId: run.toolCalls[0].id,
    workflowRunId: run.id,
    toolCode: run.toolCalls[0].toolCode,
    requestId: randomUUID(),
  });
  expect(JSON.stringify(publicContext)).not.toContain("INTERNAL SECRET NOTE");
  await service.executeTool({
    toolCallId: run.toolCalls[1].id,
    workflowRunId: run.id,
    toolCode: run.toolCalls[1].toolCode,
    requestId: randomUUID(),
  });
  await service.reserveModelStep({
    workflowRunId: run.id,
    modelStepId: run.id,
    requestId: randomUUID(),
  });
  await service.finalizeModelStep({
    workflowRunId: run.id,
    modelStepId: run.id,
    requestId: randomUUID(),
    result: {
      status: "SUCCEEDED",
      outcome: "READY_FOR_REVIEW",
      output: {
        status: "READY_FOR_REVIEW",
        draft: "The current policy asks customers to verify delivery status in Orders.",
        reasons: ["Bounded policy response"],
        citations: [],
      },
      providerRequestId: `resp_${randomUUID()}`,
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, costInUsdTicks: 150_000 },
      durationMs: 25,
    },
  });
  return database.aiWorkflowRun.findUnique({ where: { id: run.id } });
}

beforeEach(async () => {
  await clearData();
  vi.clearAllMocks();
  aiClient.documentCandidates.mockResolvedValue({ candidates: [] });
});

afterAll(async () => {
  await clearData();
  await database.$disconnect();
});

describe.sequential("Phase 9 controlled workflows", () => {
  it("runs the fixed business brief plan once and returns encrypted authoritative sources", async () => {
    const owner = await authenticated("OWNER", "business-owner");
    await acceptConsent(owner, "business");
    await database.product.create({
      data: {
        sku: `P9-${randomUUID().slice(0, 8)}`,
        name: "Low stock item",
        description: "Synthetic Phase 9 inventory fixture",
        price: "100.00",
        currency: "INR",
        status: "ACTIVE",
        inventoryBalance: { create: { onHand: 1, lowStockThreshold: 3 } },
      },
    });
    const submissionKey = randomUUID();
    const input = {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
      focus: "INVENTORY",
    };
    const created = await mutate("post", "/api/v1/ai/workflows/owner-business-brief/runs", owner)
      .set("Idempotency-Key", submissionKey)
      .send(input);
    expect(created.status).toBe(202);
    const replay = await mutate("post", "/api/v1/ai/workflows/owner-business-brief/runs", owner)
      .set("Idempotency-Key", submissionKey)
      .send(input);
    expect(replay.status).toBe(200);
    expect(replay.body.meta.idempotencyReplay).toBe(true);
    const conflict = await mutate("post", "/api/v1/ai/workflows/owner-business-brief/runs", owner)
      .set("Idempotency-Key", submissionKey)
      .send({ ...input, focus: "REVENUE" });
    expect(conflict.status).toBe(409);

    const run = await database.aiWorkflowRun.findUnique({
      where: { id: created.body.data.run.id },
      include: { toolCalls: { orderBy: { ordinal: "asc" } } },
    });
    expect(run.toolCalls.map((call) => call.toolCode)).toEqual([
      "REPORTS_OVERVIEW_V1",
      "INVENTORY_ATTENTION_V1",
      "SUPPORT_QUEUE_SUMMARY_V1",
    ]);
    expect(await database.backgroundJob.count({ where: { type: "AI_WORKFLOW_ADVANCE" } })).toBe(1);

    await service.jobDescriptor(run.id, "START");
    for (const toolCall of run.toolCalls) {
      await service.executeTool({
        toolCallId: toolCall.id,
        workflowRunId: run.id,
        toolCode: toolCall.toolCode,
        requestId: randomUUID(),
      });
    }
    expect(
      await service.reserveModelStep({
        workflowRunId: run.id,
        modelStepId: run.id,
        requestId: randomUUID(),
      }),
    ).toEqual({ status: "RESERVED" });
    const output = {
      summary: "Inventory attention is required for one synthetic product.",
      findings: [{ text: "One item is below threshold.", sourceLabels: ["INVENTORY"] }],
      nextSteps: ["Review the authoritative inventory record."],
      uncertainties: ["Demand is not forecast by this workflow."],
    };
    await service.finalizeModelStep({
      workflowRunId: run.id,
      modelStepId: run.id,
      requestId: randomUUID(),
      result: {
        status: "SUCCEEDED",
        outcome: "ANSWER",
        output,
        providerRequestId: `resp_${randomUUID()}`,
        usage: { inputTokens: 80, outputTokens: 30, totalTokens: 110, costInUsdTicks: 125_000 },
        durationMs: 20,
      },
    });
    const response = await request(app)
      .get(`/api/v1/ai/workflow-runs/${run.id}`)
      .set("Cookie", owner.cookie);
    expect(response.status).toBe(200);
    expect(response.body.data.run.result).toEqual(output);
    expect(response.body.data.run.sources).toHaveLength(3);
    expect(response.body.data.run.sources[1].output.items[0].name).toBe("Low stock item");
    expect(JSON.stringify(response.body)).not.toContain("ciphertext");
    const artifacts = await database.aiWorkflowArtifact.findMany({
      where: { workflowRunId: run.id },
    });
    expect(artifacts).toHaveLength(4);
    expect(
      Buffer.concat(artifacts.map((artifact) => artifact.ciphertext)).toString("utf8"),
    ).not.toContain(output.summary);
    expect(await database.aiUsageEvent.count({ where: { workflowRunId: run.id } })).toBe(1);
  });

  it("requires cross-operator review and publishes one traced support reply after an exact edit", async () => {
    const owner = await authenticated("OWNER", "support-owner");
    const admin = await authenticated("ADMIN", "support-reviewer");
    const customer = await authenticated("CUSTOMER", "support-customer");
    await acceptConsent(owner, "support");
    await acceptConsent(admin, "support");
    const ticket = await seedTicket(customer.user);
    const run = await startSupportRun(owner, ticket.id);
    const awaiting = await advanceSupportToReview(run);
    expect(awaiting.status).toBe("AWAITING_APPROVAL");

    const listed = await request(app)
      .get(`/api/v1/ai/workflow-runs?workflowCode=SUPPORT_REPLY_DRAFT_V1`)
      .set("Cookie", admin.cookie);
    expect(listed.status).toBe(200);
    expect(listed.body.data.runs.map((item) => item.id)).toContain(run.id);
    const detail = await request(app)
      .get(`/api/v1/ai/workflow-runs/${run.id}`)
      .set("Cookie", admin.cookie);
    expect(detail.body.data.run.draft.draft).toContain("current policy");
    expect(detail.body.data.run.approval).toMatchObject({
      draftDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      contextDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(detail.body.data.run.sourceFreshness).toHaveLength(2);
    expect(detail.body.data.run.canCancel).toBe(false);

    const decision = await mutate("post", `/api/v1/ai/workflow-runs/${run.id}/decisions`, admin)
      .set("Idempotency-Key", randomUUID())
      .send({
        decision: "EDIT_AND_APPROVE",
        version: detail.body.data.run.version,
        body: "Reviewed customer-visible response.",
      });
    expect(decision.status).toBe(202);
    expect(decision.body.data.run.status).toBe("APPROVED");
    await service.jobDescriptor(run.id, "RESUME");
    const receipt = await service.executeTool({
      toolCallId: run.toolCalls[2].id,
      workflowRunId: run.id,
      toolCode: run.toolCalls[2].toolCode,
      requestId: randomUUID(),
    });
    const replayedReceipt = await service.executeTool({
      toolCallId: run.toolCalls[2].id,
      workflowRunId: run.id,
      toolCode: run.toolCalls[2].toolCode,
      requestId: randomUUID(),
    });
    expect(replayedReceipt).toEqual(receipt);
    const published = await database.supportTicketMessage.findMany({
      where: { workflowRunId: run.id },
    });
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      body: "Reviewed customer-visible response.",
      origin: "AI_ASSISTED",
      visibility: "CUSTOMER_VISIBLE",
      authorUserId: admin.user.id,
    });
    expect(await database.notification.count()).toBe(0);
    expect(
      await database.backgroundJob.count({
        where: { type: "NOTIFICATION_SUPPORT_PUBLIC_REPLY_CREATED" },
      }),
    ).toBe(1);
    const approval = await database.aiWorkflowApproval.findUnique({
      where: { workflowRunId: run.id },
    });
    expect(approval.reviewerId).toBe(admin.user.id);
  });

  it("rechecks reviewer consent and context, and permits safe initiator cancellation", async () => {
    const owner = await authenticated("OWNER", "stale-owner");
    const admin = await authenticated("ADMIN", "stale-reviewer");
    const customer = await authenticated("CUSTOMER", "stale-customer");
    await acceptConsent(owner, "support");
    await acceptConsent(admin, "support");
    const ticket = await seedTicket(customer.user);
    const run = await startSupportRun(owner, ticket.id);
    await advanceSupportToReview(run);
    const detail = await request(app)
      .get(`/api/v1/ai/workflow-runs/${run.id}`)
      .set("Cookie", admin.cookie);

    await mutate("delete", "/api/v1/ai/workflow-consents/support", admin);
    const denied = await mutate("post", `/api/v1/ai/workflow-runs/${run.id}/decisions`, admin)
      .set("Idempotency-Key", randomUUID())
      .send({ decision: "APPROVE", version: detail.body.data.run.version });
    expect(denied.status).toBe(409);
    expect(denied.body.error.code).toBe("AI_WORKFLOW_CONSENT_REQUIRED");

    await acceptConsent(admin, "support");
    await database.supportTicketMessage.create({
      data: {
        ticketId: ticket.id,
        authorUserId: customer.user.id,
        visibility: "CUSTOMER_VISIBLE",
        body: "The ticket context changed after generation.",
        idempotencyKey: randomUUID(),
        requestHash: "c".repeat(64),
      },
    });
    const stale = await mutate("post", `/api/v1/ai/workflow-runs/${run.id}/decisions`, admin)
      .set("Idempotency-Key", randomUUID())
      .send({ decision: "APPROVE", version: detail.body.data.run.version });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("AI_WORKFLOW_CONTEXT_CHANGED");

    const cancelled = await mutate("post", `/api/v1/ai/workflow-runs/${run.id}/cancellation`, owner)
      .set("Idempotency-Key", randomUUID())
      .send({ version: detail.body.data.run.version });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.run.status).toBe("CANCELLED");
    expect(await service.jobDescriptor(run.id, "RESUME")).toBeNull();
  });

  it("closes failed usage holds and audits failure and retention lifecycle events", async () => {
    const owner = await authenticated("OWNER", "lifecycle-owner");
    await acceptConsent(owner, "business");
    const input = {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
      focus: "GENERAL",
    };
    const failed = await mutate("post", "/api/v1/ai/workflows/owner-business-brief/runs", owner)
      .set("Idempotency-Key", randomUUID())
      .send(input);
    const failedRunId = failed.body.data.run.id;
    await service.jobDescriptor(failedRunId, "START");
    await service.reserveModelStep({
      workflowRunId: failedRunId,
      modelStepId: failedRunId,
      requestId: randomUUID(),
    });
    const failureRequestId = randomUUID();
    await service.failRun(failedRunId, "AI_WORKFLOW_UNAVAILABLE", false, failureRequestId);

    expect(await database.aiWorkflowRun.findUnique({ where: { id: failedRunId } })).toMatchObject({
      status: "FAILED",
      safeErrorCode: "AI_WORKFLOW_UNAVAILABLE",
    });
    expect(
      await database.aiUsageEvent.findUnique({
        where: {
          workflowRunId_modelStepId: { workflowRunId: failedRunId, modelStepId: failedRunId },
        },
      }),
    ).toMatchObject({ status: "FAILED", safeErrorCode: "AI_WORKFLOW_UNAVAILABLE" });
    expect(
      await database.auditEvent.findMany({
        where: { requestId: failureRequestId },
        orderBy: { sequence: "asc" },
      }),
    ).toEqual([
      expect.objectContaining({ action: "AI_REQUEST_FAILED", targetId: expect.any(String) }),
      expect.objectContaining({ action: "AI_WORKFLOW_FAILED", targetId: failedRunId }),
    ]);

    const expiring = await mutate("post", "/api/v1/ai/workflows/owner-business-brief/runs", owner)
      .set("Idempotency-Key", randomUUID())
      .send(input);
    const expiringRunId = expiring.body.data.run.id;
    const futureService = createAiWorkflowService(database, config, aiClient, {
      documentStore,
      now: () => new Date(Date.now() + 25 * 60 * 60 * 1000),
    });
    const retention = await futureService.retentionSweep();
    const retentionRequestId = randomUUID();
    await futureService.recordRetention(
      { ...retention, deletedCheckpoints: 0 },
      retentionRequestId,
    );
    expect(retention.expiredRuns).toBe(1);
    expect(await database.aiWorkflowRun.findUnique({ where: { id: expiringRunId } })).toMatchObject(
      {
        status: "EXPIRED",
      },
    );
    expect(
      await database.auditEvent.findFirst({ where: { requestId: retentionRequestId } }),
    ).toMatchObject({
      action: "AI_WORKFLOW_RETENTION_APPLIED",
      metadata: { ...retention, deletedCheckpoints: 0 },
    });
  });

  it("rechecks authority after inference and before the approved support action", async () => {
    const owner = await authenticated("OWNER", "authority-owner");
    const admin = await authenticated("ADMIN", "authority-reviewer");
    const customer = await authenticated("CUSTOMER", "authority-customer");
    await acceptConsent(owner, "business");
    const business = await mutate("post", "/api/v1/ai/workflows/owner-business-brief/runs", owner)
      .set("Idempotency-Key", randomUUID())
      .send({
        from: "2026-08-01T00:00:00.000Z",
        to: "2026-09-01T00:00:00.000Z",
        focus: "GENERAL",
      });
    const businessRun = await database.aiWorkflowRun.findUnique({
      where: { id: business.body.data.run.id },
      include: { toolCalls: { orderBy: { ordinal: "asc" } } },
    });
    await service.jobDescriptor(businessRun.id, "START");
    for (const toolCall of businessRun.toolCalls) {
      await service.executeTool({
        toolCallId: toolCall.id,
        workflowRunId: businessRun.id,
        toolCode: toolCall.toolCode,
        requestId: randomUUID(),
      });
    }
    await service.reserveModelStep({
      workflowRunId: businessRun.id,
      modelStepId: businessRun.id,
      requestId: randomUUID(),
    });
    await mutate("delete", "/api/v1/ai/workflow-consents/business", owner);
    await expect(
      service.finalizeModelStep({
        workflowRunId: businessRun.id,
        modelStepId: businessRun.id,
        requestId: randomUUID(),
        result: {
          status: "SUCCEEDED",
          outcome: "ANSWER",
          output: {
            summary: "This result must not be stored after consent revocation.",
            findings: [],
            nextSteps: [],
            uncertainties: [],
          },
          providerRequestId: `resp_${randomUUID()}`,
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, costInUsdTicks: 10_000 },
          durationMs: 5,
        },
      }),
    ).rejects.toMatchObject({ code: "AI_WORKFLOW_CONSENT_REQUIRED" });
    await service.failRun(businessRun.id, "AI_AUTHORIZATION_CHANGED", true, randomUUID());
    expect(
      await database.aiWorkflowArtifact.count({
        where: { workflowRunId: businessRun.id, kind: "FINAL_RESULT" },
      }),
    ).toBe(0);
    expect(
      await database.aiUsageEvent.findFirst({ where: { workflowRunId: businessRun.id } }),
    ).toMatchObject({
      status: "UNKNOWN",
      safeErrorCode: "AI_AUTHORIZATION_CHANGED",
    });

    await acceptConsent(owner, "support");
    await acceptConsent(admin, "support");
    const ticket = await seedTicket(customer.user);
    const supportRun = await startSupportRun(owner, ticket.id);
    await advanceSupportToReview(supportRun);
    const supportDetail = await request(app)
      .get(`/api/v1/ai/workflow-runs/${supportRun.id}`)
      .set("Cookie", admin.cookie);
    const decision = await mutate(
      "post",
      `/api/v1/ai/workflow-runs/${supportRun.id}/decisions`,
      admin,
    )
      .set("Idempotency-Key", randomUUID())
      .send({ decision: "APPROVE", version: supportDetail.body.data.run.version });
    expect(decision.status).toBe(202);
    await database.userRole.deleteMany({ where: { userId: admin.user.id } });
    await service.jobDescriptor(supportRun.id, "RESUME");
    await expect(
      service.executeTool({
        toolCallId: supportRun.toolCalls[2].id,
        workflowRunId: supportRun.id,
        toolCode: supportRun.toolCalls[2].toolCode,
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "AI_WORKFLOW_NOT_FOUND" });
    expect(
      await database.supportTicketMessage.count({ where: { workflowRunId: supportRun.id } }),
    ).toBe(0);
    expect(await database.aiWorkflowRun.findUnique({ where: { id: supportRun.id } })).toMatchObject(
      {
        status: "UNKNOWN",
        safeErrorCode: "AI_WORKFLOW_ACTION_UNKNOWN",
      },
    );
  });

  it("keeps authorized read and cancellation recovery available behind a kill switch", async () => {
    const owner = await authenticated("OWNER", "kill-switch-owner");
    await acceptConsent(owner, "business");
    const created = await mutate("post", "/api/v1/ai/workflows/owner-business-brief/runs", owner)
      .set("Idempotency-Key", randomUUID())
      .send({
        from: "2026-08-01T00:00:00.000Z",
        to: "2026-09-01T00:00:00.000Z",
        focus: "GENERAL",
      });
    const runId = created.body.data.run.id;
    const disabledConfig = {
      ...config,
      ai: {
        ...config.ai,
        workflows: { ...config.ai.workflows, enabled: false, businessBriefEnabled: false },
      },
    };
    const disabledService = createAiWorkflowService(database, disabledConfig, aiClient, {
      documentStore,
    });
    await expect(disabledService.jobDescriptor(runId, "START")).rejects.toMatchObject({
      code: "AI_WORKFLOWS_DISABLED",
    });
    await mutate("delete", "/api/v1/ai/workflow-consents/business", owner);
    await expect(
      disabledService.get({ actor: owner.user, workflowRunId: runId }),
    ).resolves.toMatchObject({
      id: runId,
      status: "QUEUED",
    });
    await expect(
      disabledService.list({
        actor: owner.user,
        query: { page: 1, limit: 20, workflowCode: "OWNER_BUSINESS_BRIEF_V1" },
      }),
    ).resolves.toMatchObject({ runs: [expect.objectContaining({ id: runId })] });
    await expect(
      disabledService.cancel({
        actor: owner.user,
        workflowRunId: runId,
        version: created.body.data.run.version,
        decisionKey: randomUUID(),
        requestId: randomUUID(),
      }),
    ).resolves.toMatchObject({ id: runId, status: "CANCELLED" });
  });

  it("denies customer access and serializes concurrent approval and cancellation", async () => {
    const owner = await authenticated("OWNER", "race-owner");
    const admin = await authenticated("ADMIN", "race-reviewer");
    const customer = await authenticated("CUSTOMER", "race-customer");
    await acceptConsent(owner, "support");
    await acceptConsent(admin, "support");
    const ticket = await seedTicket(customer.user);
    const run = await startSupportRun(owner, ticket.id);
    await advanceSupportToReview(run);
    const detail = await request(app)
      .get(`/api/v1/ai/workflow-runs/${run.id}`)
      .set("Cookie", admin.cookie);

    expect(
      (
        await mutate("post", "/api/v1/ai/workflows/owner-business-brief/runs", customer)
          .set("Idempotency-Key", randomUUID())
          .send({
            from: "2026-08-01T00:00:00.000Z",
            to: "2026-09-01T00:00:00.000Z",
            focus: "GENERAL",
          })
      ).status,
    ).toBe(403);
    expect(
      (await request(app).get(`/api/v1/ai/workflow-runs/${run.id}`).set("Cookie", customer.cookie))
        .status,
    ).toBe(404);

    const [decision, cancellation] = await Promise.all([
      mutate("post", `/api/v1/ai/workflow-runs/${run.id}/decisions`, admin)
        .set("Idempotency-Key", randomUUID())
        .send({ decision: "APPROVE", version: detail.body.data.run.version }),
      mutate("post", `/api/v1/ai/workflow-runs/${run.id}/cancellation`, owner)
        .set("Idempotency-Key", randomUUID())
        .send({ version: detail.body.data.run.version }),
    ]);
    expect([decision.status, cancellation.status]).toContain(409);
    expect(
      [decision.status, cancellation.status].some((status) => [200, 202].includes(status)),
    ).toBe(true);
    expect(await database.supportTicketMessage.count({ where: { workflowRunId: run.id } })).toBe(0);
    const stored = await database.aiWorkflowRun.findUnique({ where: { id: run.id } });
    expect(["APPROVED", "CANCELLED"]).toContain(stored.status);
  });
});
