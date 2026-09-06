import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import { AUDIT_GENESIS_HASH } from "./modules/audit/audit.constants.js";
import { createOpaqueToken, digestToken } from "./modules/auth/auth.tokens.js";
import { AI_ASSISTANTS, AI_NOTICE_VERSION, AI_PROMPT_VERSIONS } from "./modules/ai/ai.constants.js";
import { AiInternalClientError } from "./modules/ai/ai.internalClient.js";

dotenv.config({ path: ".env.test", override: true, quiet: true });

const signingKey = Buffer.alloc(32, 0x37).toString("base64");
const baseConfig = loadEnvironment({
  ...process.env,
  AI_ENABLED: "true",
  AI_SERVICE_SIGNING_KEY: signingKey,
  AI_SERVICE_SIGNING_KEY_ID: "phase7-integration-v1",
  AI_CUSTOMER_RATE_LIMIT_MAX: "1000",
  AI_OWNER_RATE_LIMIT_MAX: "1000",
});
const database = createDatabase(baseConfig.databaseUrl);
const origin = baseConfig.corsOrigin;

function providerResult(payload, overrides = {}) {
  return {
    answer: "Use the Orders page to review the latest status.",
    outcome: "ANSWER",
    notices: ["VERIFY_AUTHORITATIVE_DATA"],
    citations: [],
    promptVersion:
      payload.assistant === AI_ASSISTANTS.CUSTOMER
        ? AI_PROMPT_VERSIONS.CUSTOMER
        : AI_PROMPT_VERSIONS.OWNER,
    model: "openai/gpt-oss-120b",
    providerRequestId: `resp_${randomUUID()}`,
    usage: {
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      costInUsdTicks: 150_000,
    },
    durationMs: 20,
    zeroDataRetention: true,
    ...overrides,
  };
}

const aiClient = {
  state: "ready",
  health: vi.fn(async () => ({ status: "ready", provider: "ready" })),
  respond: vi.fn(async (payload) => providerResult(payload)),
};
const app = createApp({ config: baseConfig, database, aiClient });

function appWithAi(overrides, selectedClient = aiClient) {
  const config = {
    ...baseConfig,
    ai: {
      ...baseConfig.ai,
      ...overrides,
      customer: { ...baseConfig.ai.customer, ...(overrides.customer ?? {}) },
      owner: { ...baseConfig.ai.owner, ...(overrides.owner ?? {}) },
    },
  };
  return { app: createApp({ config, database, aiClient: selectedClient }), config };
}

async function clearData() {
  await database.aiUsageEvent.deleteMany();
  await database.aiProviderConsent.deleteMany();
  await database.notification.deleteMany();
  await database.backgroundJobAttempt.deleteMany();
  await database.backgroundJob.deleteMany({ where: { replayedFromJobId: { not: null } } });
  await database.backgroundJob.deleteMany();
  await database.workerHeartbeat.deleteMany();
  await database.auditEvent.deleteMany();
  await database.auditChainHead.update({
    where: { id: 1 },
    data: { headSequence: 0n, headHash: AUDIT_GENESIS_HASH },
  });
  await database.supportTicketEvent.deleteMany();
  await database.supportTicketMessage.deleteMany();
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
  await database.securityEvent.deleteMany();
  await database.authSession.deleteMany();
  await database.userRole.deleteMany();
  await database.user.deleteMany();
  await database.rolePermission.deleteMany({ where: { role: { isSystem: false } } });
  await database.role.deleteMany({ where: { isSystem: false } });
}

async function createAuthenticatedUser(roleCodes, label = "user") {
  const user = await database.user.create({
    data: {
      email: `phase7-${label}-${randomUUID()}@example.com`,
      displayName: `Phase 7 ${label}`,
      passwordHash: "not-used-by-phase7-tests",
      roles: {
        create: roleCodes.map((code) => ({ role: { connect: { code } } })),
      },
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
    cookie: `${baseConfig.auth.sessionCookieName}=${sessionToken}; ${baseConfig.auth.csrfCookieName}=${csrfToken}`,
  };
}

async function grantConsent(userId, assistant) {
  return database.aiProviderConsent.create({
    data: {
      userId,
      provider: "GROQ",
      assistant,
      noticeVersion: AI_NOTICE_VERSION,
    },
  });
}

function submitCustomer(
  selectedApp,
  auth,
  submissionKey,
  body = { question: "How do I track it?" },
) {
  return request(selectedApp)
    .post("/api/v1/ai/customer/responses")
    .set("Origin", origin)
    .set("Cookie", auth.cookie)
    .set("X-CSRF-Token", auth.csrfToken)
    .set("Idempotency-Key", submissionKey)
    .send(body);
}

async function expectConstraintViolation(operation) {
  try {
    await operation;
    throw new Error("Expected MySQL to reject a check constraint violation");
  } catch (error) {
    expect(["P2004", "P2039"]).toContain(error.code);
  }
}

beforeEach(async () => {
  await clearData();
  aiClient.respond.mockReset();
  aiClient.respond.mockImplementation(async (payload) => providerResult(payload));
});

afterAll(async () => {
  await clearData();
  await database.$disconnect();
});

describe.sequential("Phase 7 AI foundation", () => {
  it("installs isolated permissions and metadata-only restrictive persistence", async () => {
    const roles = await database.role.findMany({
      include: {
        rolePermissions: {
          where: { permission: { code: { startsWith: "ai:" } } },
          include: { permission: true },
        },
      },
    });
    const mapping = Object.fromEntries(
      roles.map((role) => [
        role.code,
        role.rolePermissions.map((entry) => entry.permission.code).sort(),
      ]),
    );
    expect(mapping.OWNER).toEqual(["ai:owner:use", "ai:usage:read"]);
    expect(mapping.CUSTOMER).toEqual(["ai:customer:use"]);
    expect(mapping.ADMIN).toEqual([]);

    const columns = await database.$queryRaw`
      SELECT COLUMN_NAME AS columnName
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'ai_usage_events'
    `;
    expect(columns.map((column) => column.columnName)).not.toEqual(
      expect.arrayContaining(["question", "answer", "prompt", "reasoning", "raw_response"]),
    );

    const indexes = await database.$queryRaw`
      SELECT DISTINCT INDEX_NAME AS indexName
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('ai_provider_consents', 'ai_usage_events')
    `;
    expect(indexes.map((row) => row.indexName)).toEqual(
      expect.arrayContaining([
        "ai_consents_user_provider_assistant_notice",
        "ai_consents_active_lookup_idx",
        "ai_usage_user_submission_key",
        "ai_usage_user_assistant_created_idx",
        "ai_usage_status_created_idx",
      ]),
    );

    const auth = await createAuthenticatedUser([], "persistence");
    const consent = await grantConsent(auth.user.id, AI_ASSISTANTS.CUSTOMER);
    await expect(grantConsent(auth.user.id, AI_ASSISTANTS.CUSTOMER)).rejects.toMatchObject({
      code: "P2002",
    });
    await expectConstraintViolation(
      database.aiUsageEvent.create({
        data: {
          userId: auth.user.id,
          submissionKey: randomUUID(),
          provider: "GROQ",
          assistant: "CUSTOMER",
          intent: "OWNER_OVERVIEW_EXPLAIN",
          status: "PENDING",
          promptVersion: "customer-help-v1",
          model: "openai/gpt-oss-120b",
          reservedCostTicks: 200_000_000n,
        },
      }),
    );
    expect(consent.userId).toBe(auth.user.id);
    await expect(database.user.delete({ where: { id: auth.user.id } })).rejects.toMatchObject({
      code: "P2003",
    });
  });

  it("owns, versions, audits, and permits revocation of consent after permission loss", async () => {
    const auth = await createAuthenticatedUser(["CUSTOMER"], "consent");
    const initial = await request(app)
      .get("/api/v1/ai/consents/customer")
      .set("Cookie", auth.cookie);
    expect(initial.status).toBe(200);
    expect(initial.body.data.consent).toMatchObject({
      provider: "GROQ",
      assistant: "CUSTOMER",
      active: false,
      consentedAt: null,
      revokedAt: null,
    });
    expect(initial.body.data.consent).not.toHaveProperty("id");

    const wrongVersion = await request(app)
      .put("/api/v1/ai/consents/customer")
      .set("Origin", origin)
      .set("Cookie", auth.cookie)
      .set("X-CSRF-Token", auth.csrfToken)
      .send({ noticeVersion: "different-notice" });
    expect(wrongVersion.status).toBe(422);

    const accepted = await request(app)
      .put("/api/v1/ai/consents/customer")
      .set("Origin", origin)
      .set("Cookie", auth.cookie)
      .set("X-CSRF-Token", auth.csrfToken)
      .send({ noticeVersion: AI_NOTICE_VERSION });
    expect(accepted.status).toBe(201);
    expect(accepted.body.data.consent.active).toBe(true);
    expect(accepted.body.data.consent.notice.warning).toContain("Do not enter passwords");

    const repeated = await request(app)
      .put("/api/v1/ai/consents/customer")
      .set("Origin", origin)
      .set("Cookie", auth.cookie)
      .set("X-CSRF-Token", auth.csrfToken)
      .send({ noticeVersion: AI_NOTICE_VERSION });
    expect(repeated.status).toBe(200);

    await database.userRole.deleteMany({ where: { userId: auth.user.id } });
    const revoked = await request(app)
      .delete("/api/v1/ai/consents/customer")
      .set("Origin", origin)
      .set("Cookie", auth.cookie)
      .set("X-CSRF-Token", auth.csrfToken);
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.consent.active).toBe(false);

    const actions = (await database.auditEvent.findMany({ orderBy: { sequence: "asc" } })).map(
      (event) => event.action,
    );
    expect(actions).toEqual(["AI_CONSENT_ACCEPTED", "AI_CONSENT_REVOKED"]);
  });

  it("denies anonymous, cross-role, admin, missing-report, CSRF, and disabled requests", async () => {
    expect((await request(app).get("/api/v1/ai/consents/customer")).status).toBe(401);
    const customer = await createAuthenticatedUser(["CUSTOMER"], "customer-authz");
    const owner = await createAuthenticatedUser(["OWNER"], "owner-authz");
    const admin = await createAuthenticatedUser(["ADMIN"], "admin-authz");

    const customerToOwner = await request(app)
      .post("/api/v1/ai/owner/overview-responses")
      .set("Origin", origin)
      .set("Cookie", customer.cookie)
      .set("X-CSRF-Token", customer.csrfToken)
      .set("Idempotency-Key", randomUUID())
      .send({ question: "Explain revenue" });
    expect(customerToOwner.status).toBe(403);
    expect((await submitCustomer(app, owner, randomUUID())).status).toBe(403);
    expect((await submitCustomer(app, admin, randomUUID())).status).toBe(403);

    const customRole = await database.role.create({
      data: {
        code: `PHASE7_AI_OWNER_${randomUUID().replaceAll("-", "").slice(0, 8)}`,
        name: "Phase 7 AI only",
        description: "Test role without report access",
        isSystem: false,
        rolePermissions: {
          create: {
            permission: { connect: { code: "ai:owner:use" } },
          },
        },
      },
    });
    const limitedOwner = await createAuthenticatedUser([customRole.code], "limited-owner");
    const missingReport = await request(app)
      .post("/api/v1/ai/owner/overview-responses")
      .set("Origin", origin)
      .set("Cookie", limitedOwner.cookie)
      .set("X-CSRF-Token", limitedOwner.csrfToken)
      .set("Idempotency-Key", randomUUID())
      .send({ question: "Explain revenue" });
    expect(missingReport.status).toBe(403);

    const missingCsrf = await request(app)
      .post("/api/v1/ai/customer/responses")
      .set("Origin", origin)
      .set("Cookie", customer.cookie)
      .set("Idempotency-Key", randomUUID())
      .send({ question: "Help" });
    expect(missingCsrf.status).toBe(403);
    expect(missingCsrf.body.error.code).toBe("CSRF_INVALID");

    const disabled = appWithAi({ enabled: false }).app;
    const disabledResponse = await submitCustomer(disabled, customer, randomUUID());
    expect(disabledResponse.status).toBe(503);
    expect(disabledResponse.body.error.code).toBe("AI_DISABLED");
    expect(aiClient.respond).not.toHaveBeenCalled();
  });

  it("normalizes a customer request, stores metadata only, and consumes its submission key", async () => {
    const auth = await createAuthenticatedUser(["CUSTOMER"], "customer-success");
    await grantConsent(auth.user.id, AI_ASSISTANTS.CUSTOMER);
    const submissionKey = randomUUID();

    const rejectedContext = await submitCustomer(app, auth, randomUUID(), {
      question: "Help",
      context: { orderId: randomUUID() },
    });
    expect(rejectedContext.status).toBe(422);
    expect(aiClient.respond).not.toHaveBeenCalled();

    const response = await submitCustomer(app, auth, submissionKey, {
      question: "  How   do I track my order?  ",
    });
    expect(response.status).toBe(200);
    expect(response.body.data.response).toEqual({
      answer: "Use the Orders page to review the latest status.",
      outcome: "ANSWER",
      notices: ["VERIFY_AUTHORITATIVE_DATA"],
    });
    expect(aiClient.respond).toHaveBeenCalledTimes(1);
    expect(aiClient.respond.mock.calls[0][0]).toMatchObject({
      contractVersion: 1,
      subjectId: auth.user.id,
      assistant: "CUSTOMER",
      intent: "CUSTOMER_HELP",
      question: "How do I track my order?",
      context: null,
    });

    const event = await database.aiUsageEvent.findUnique({
      where: { userId_submissionKey: { userId: auth.user.id, submissionKey } },
    });
    expect(event).toMatchObject({
      status: "SUCCEEDED",
      provider: "GROQ",
      assistant: "CUSTOMER",
      intent: "CUSTOMER_HELP",
      promptVersion: "customer-help-v1",
      model: "openai/gpt-oss-120b",
      outcome: "ANSWER",
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
    });
    expect(event.reservedCostTicks).toBe(200_000_000n);
    expect(event.exactCostTicks).toBe(150_000n);
    expect(event).not.toHaveProperty("question");
    expect(event).not.toHaveProperty("answer");

    const auditText = JSON.stringify(
      (await database.auditEvent.findMany()).map((auditEvent) => auditEvent.metadata),
    );
    expect(auditText).not.toContain("How do I track my order");
    expect(auditText).not.toContain("Use the Orders page");

    const replay = await submitCustomer(app, auth, submissionKey, {
      question: "A different question",
    });
    expect(replay.status).toBe(409);
    expect(replay.body.error.code).toBe("AI_SUBMISSION_KEY_CONSUMED");
    expect(aiClient.respond).toHaveBeenCalledTimes(1);
  });

  it("records timeout uncertainty, releases known failures, and never retries internally", async () => {
    const auth = await createAuthenticatedUser(["CUSTOMER"], "customer-failure");
    await grantConsent(auth.user.id, AI_ASSISTANTS.CUSTOMER);
    const timeoutKey = randomUUID();
    aiClient.respond.mockRejectedValueOnce(new AiInternalClientError("PROVIDER_TIMEOUT"));

    const timeout = await submitCustomer(app, auth, timeoutKey);
    expect(timeout.status).toBe(503);
    expect(timeout.body.error.code).toBe("AI_PROVIDER_TIMEOUT");
    expect(
      await database.aiUsageEvent.findUnique({
        where: { userId_submissionKey: { userId: auth.user.id, submissionKey: timeoutKey } },
      }),
    ).toMatchObject({ status: "UNKNOWN", safeErrorCode: "PROVIDER_TIMEOUT" });

    const replay = await submitCustomer(app, auth, timeoutKey);
    expect(replay.status).toBe(409);
    aiClient.respond.mockRejectedValueOnce(
      new AiInternalClientError("PROVIDER_RATE_LIMITED", "RELEASE"),
    );
    const rateKey = randomUUID();
    const rateLimited = await submitCustomer(app, auth, rateKey);
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.body.error.code).toBe("AI_PROVIDER_BUSY");
    expect(
      await database.aiUsageEvent.findUnique({
        where: { userId_submissionKey: { userId: auth.user.id, submissionKey: rateKey } },
      }),
    ).toMatchObject({ status: "FAILED", safeErrorCode: "PROVIDER_RATE_LIMITED" });
    expect(aiClient.respond).toHaveBeenCalledTimes(2);
  });

  it("records exact provider usage but suppresses an answer that exceeds its reserved cost", async () => {
    const auth = await createAuthenticatedUser(["CUSTOMER"], "cost-overrun");
    await grantConsent(auth.user.id, AI_ASSISTANTS.CUSTOMER);
    const submissionKey = randomUUID();
    aiClient.respond.mockImplementationOnce(async (payload) =>
      providerResult(payload, {
        answer: "This costly answer must not be returned.",
        usage: {
          inputTokens: 100,
          outputTokens: 20,
          totalTokens: 120,
          costInUsdTicks: 200_000_001,
        },
      }),
    );

    const response = await submitCustomer(app, auth, submissionKey);
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("AI_COST_POLICY_EXCEEDED");
    expect(response.text).not.toContain("costly answer");
    const event = await database.aiUsageEvent.findUnique({
      where: { userId_submissionKey: { userId: auth.user.id, submissionKey } },
    });
    expect(event).toMatchObject({ status: "SUCCEEDED", exactCostTicks: 200_000_001n });
  });

  it("enforces daily quota and global reserved-cost exposure before provider work", async () => {
    const quotaClient = {
      state: "ready",
      health: vi.fn(),
      respond: vi.fn(async (payload) => providerResult(payload)),
    };
    const quotaApp = appWithAi({ customer: { dailyMaximum: 1 } }, quotaClient).app;
    const quotaUser = await createAuthenticatedUser(["CUSTOMER"], "quota");
    await grantConsent(quotaUser.user.id, AI_ASSISTANTS.CUSTOMER);
    expect((await submitCustomer(quotaApp, quotaUser, randomUUID())).status).toBe(200);
    const quota = await submitCustomer(quotaApp, quotaUser, randomUUID());
    expect(quota.status).toBe(429);
    expect(quota.body.error.code).toBe("AI_DAILY_QUOTA_REACHED");
    expect(quotaClient.respond).toHaveBeenCalledTimes(1);

    const costClient = {
      state: "ready",
      health: vi.fn(),
      respond: vi.fn(async () => {
        throw new AiInternalClientError("PROVIDER_TIMEOUT");
      }),
    };
    const costApp = appWithAi(
      { globalDailyCostLimitUsdCents: 3, maximumRequestCostUsdCents: 2 },
      costClient,
    ).app;
    const costUser = await createAuthenticatedUser(["CUSTOMER"], "cost");
    await grantConsent(costUser.user.id, AI_ASSISTANTS.CUSTOMER);
    expect((await submitCustomer(costApp, costUser, randomUUID())).status).toBe(503);
    const blocked = await submitCustomer(costApp, costUser, randomUUID());
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("AI_COST_CEILING_REACHED");
    expect(costClient.respond).toHaveBeenCalledTimes(1);
  });

  it("blocks a second in-flight request and suppresses a paid answer after consent changes", async () => {
    const auth = await createAuthenticatedUser(["CUSTOMER"], "in-flight");
    const consent = await grantConsent(auth.user.id, AI_ASSISTANTS.CUSTOMER);
    let releaseProvider;
    let markProviderStarted;
    const providerStarted = new Promise((resolve) => {
      markProviderStarted = resolve;
    });
    aiClient.respond.mockImplementationOnce(
      (payload) =>
        new Promise((resolve) => {
          releaseProvider = () => resolve(providerResult(payload));
          markProviderStarted();
        }),
    );

    const firstPromise = submitCustomer(app, auth, randomUUID()).then((response) => response);
    await providerStarted;
    const second = await submitCustomer(app, auth, randomUUID());
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("AI_REQUEST_IN_FLIGHT");

    await database.aiProviderConsent.update({
      where: { id: consent.id },
      data: { revokedAt: new Date() },
    });
    releaseProvider();
    const first = await firstPromise;
    expect(first.status).toBe(403);
    expect(first.body.error.code).toBe("AI_AUTHORIZATION_CHANGED");
    expect(first.text).not.toContain("Use the Orders page");
    expect(await database.aiUsageEvent.count({ where: { status: "SUCCEEDED" } })).toBe(1);
    expect(aiClient.respond).toHaveBeenCalledTimes(1);
  });

  it("recovers stale pending usage to unknown before allowing a new request", async () => {
    const auth = await createAuthenticatedUser(["CUSTOMER"], "recovery");
    await grantConsent(auth.user.id, AI_ASSISTANTS.CUSTOMER);
    const staleId = randomUUID();
    await database.aiUsageEvent.create({
      data: {
        id: staleId,
        userId: auth.user.id,
        submissionKey: randomUUID(),
        provider: "GROQ",
        assistant: "CUSTOMER",
        intent: "CUSTOMER_HELP",
        status: "PENDING",
        promptVersion: "customer-help-v1",
        model: "openai/gpt-oss-120b",
        reservedCostTicks: 200_000_000n,
        startedAt: new Date(Date.now() - baseConfig.ai.timeoutMs - 10_000),
        createdAt: new Date(Date.now() - baseConfig.ai.timeoutMs - 10_000),
      },
    });

    expect((await submitCustomer(app, auth, randomUUID())).status).toBe(200);
    expect(await database.aiUsageEvent.findUnique({ where: { id: staleId } })).toMatchObject({
      status: "UNKNOWN",
      safeErrorCode: "AI_PENDING_RECOVERED",
    });
  });

  it("sends only the authoritative owner overview and exposes aggregate usage", async () => {
    const owner = await createAuthenticatedUser(["OWNER"], "owner-success");
    const admin = await createAuthenticatedUser(["ADMIN"], "usage-admin");
    await grantConsent(owner.user.id, AI_ASSISTANTS.OWNER);
    const range = { from: "2026-01-01T00:00:00Z", to: "2026-12-31T00:00:00Z" };

    const ownerResponse = await request(app)
      .post("/api/v1/ai/owner/overview-responses")
      .set("Origin", origin)
      .set("Cookie", owner.cookie)
      .set("X-CSRF-Token", owner.csrfToken)
      .set("Idempotency-Key", randomUUID())
      .send({ question: "Explain this overview", range });
    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body.data).toHaveProperty("overview");
    expect(ownerResponse.body.data.response.outcome).toBe("ANSWER");
    expect(aiClient.respond.mock.calls[0][0]).toMatchObject({
      assistant: "OWNER",
      intent: "OWNER_OVERVIEW_EXPLAIN",
      question: "Explain this overview",
      context: { overview: ownerResponse.body.data.overview },
    });

    const usage = await request(app)
      .get("/api/v1/ai/usage")
      .query(range)
      .set("Cookie", owner.cookie);
    expect(usage.status).toBe(200);
    expect(usage.body.data.usage).toMatchObject({
      timeZone: "UTC",
      requests: {
        total: 1,
        assistantBreakdown: { CUSTOMER: 0, OWNER: 1 },
        statusBreakdown: { PENDING: 0, SUCCEEDED: 1, FAILED: 0, UNKNOWN: 0 },
      },
      tokens: { input: 100, output: 20, total: 120 },
      latency: { completedCount: 1 },
      failures: { total: 0, safeErrorBreakdown: {} },
      cost: {
        currency: "USD",
        confirmedInUsdTicks: "150000",
        confirmedUsd: "0.0000150000",
        reservedExposureInUsdTicks: "0",
      },
    });
    expect(JSON.stringify(usage.body)).not.toContain(owner.user.id);
    expect(
      (await request(app).get("/api/v1/ai/usage").query(range).set("Cookie", admin.cookie)).status,
    ).toBe(403);
    expect(await database.auditEvent.count({ where: { action: "AI_USAGE_READ" } })).toBe(1);
  });
});
