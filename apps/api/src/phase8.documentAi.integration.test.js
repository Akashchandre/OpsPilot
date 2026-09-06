import { createHash, randomUUID } from "node:crypto";
import { promises as filesystem } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import {
  AI_DOCUMENT_NOTICE_VERSION,
  AI_DOCUMENT_PROMPT_VERSIONS,
  AI_NOTICE_VERSION,
} from "./modules/ai/ai.constants.js";
import { AUDIT_GENESIS_HASH } from "./modules/audit/audit.constants.js";
import { createOpaqueToken, digestToken } from "./modules/auth/auth.tokens.js";
import {
  DOCUMENT_EMBEDDING_DIMENSION,
  DOCUMENT_EMBEDDING_MODEL,
  DOCUMENT_EMBEDDING_MODEL_REVISION,
  DOCUMENT_VECTOR_COLLECTION,
} from "./modules/documents/document.constants.js";
import { validateAndNormalizeDocumentContent } from "./modules/documents/document.content.js";
import { createConfiguredDocumentStore } from "./modules/documents/document.store.factory.js";

dotenv.config({ path: ".env.test", override: true, quiet: true });

let app;
let config;
let database;
let documentStore;
let storageRoot;
const encryptionKey = Buffer.alloc(32, 0x5a).toString("base64");

const aiClient = {
  state: "ready",
  health: vi.fn(async () => ({ status: "ready", provider: "ready" })),
  documentCandidates: vi.fn(),
  respond: vi.fn(),
};

async function clearData() {
  await database.documentMutationReceipt.deleteMany();
  await database.aiDocumentCitation.deleteMany();
  await database.companyDocumentChunk.deleteMany();
  await database.companyDocument.updateMany({ data: { activeVersionId: null } });
  await database.companyDocumentVersionAudience.deleteMany();
  await database.companyDocumentVersion.deleteMany();
  await database.companyDocument.deleteMany();
  await database.backgroundJobAttempt.deleteMany();
  await database.backgroundJob.deleteMany();
  await database.workerHeartbeat.deleteMany();
  await database.aiUsageEvent.deleteMany();
  await database.aiProviderConsent.deleteMany();
  await database.auditEvent.deleteMany();
  await database.auditChainHead.update({
    where: { id: 1 },
    data: { headSequence: 0n, headHash: AUDIT_GENESIS_HASH },
  });
  await database.authSession.deleteMany();
  await database.userRole.deleteMany();
  await database.user.deleteMany();
  if (storageRoot) {
    const entries = await filesystem.readdir(storageRoot).catch(() => []);
    await Promise.all(entries.map((entry) => filesystem.unlink(path.join(storageRoot, entry))));
  }
}

async function createAuthenticatedUser(roleCode, label) {
  const user = await database.user.create({
    data: {
      email: `phase8-ai-${label}-${randomUUID()}@example.com`,
      displayName: `Phase 8 AI ${label}`,
      passwordHash: "not-used-by-phase8-ai-tests",
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

function mutate(method, url, auth) {
  const operation = request(app)[method](url);
  return operation
    .set("Origin", config.corsOrigin)
    .set("Cookie", auth.cookie)
    .set("X-CSRF-Token", auth.csrfToken);
}

async function acceptDocumentConsent(auth, assistant = "customer") {
  return mutate("put", `/api/v1/ai/document-consents/${assistant}`, auth).send({
    noticeVersion: AI_DOCUMENT_NOTICE_VERSION,
  });
}

async function createReadyDocument({
  uploader,
  audiences = ["CUSTOMER"],
  content = "Returns are accepted within 30 days.",
}) {
  const normalized = validateAndNormalizeDocumentContent({
    filename: "policy.txt",
    mediaType: "text/plain",
    language: "en",
    rawBytes: Buffer.from(content),
  });
  const document = await database.companyDocument.create({
    data: {
      title: "Returns policy",
      createdById: uploader.id,
      updatedById: uploader.id,
      versions: {
        create: {
          versionNumber: 1,
          originalFilename: "policy.txt",
          mediaType: "text/plain",
          language: "en",
          uploadedById: uploader.id,
          audiences: { create: audiences.map((audience) => ({ audience })) },
        },
      },
    },
    include: { versions: true },
  });
  const version = document.versions[0];
  const stored = await documentStore.write({
    documentVersionId: version.id,
    plaintext: normalized.normalizedBytes,
  });
  const readyAt = new Date();
  await database.companyDocumentVersion.update({
    where: { id: version.id },
    data: {
      status: "READY",
      normalizedByteLength: normalized.byteLength,
      contentSha256: normalized.sha256,
      storageObjectKey: stored.objectKey,
      storageKeyId: stored.keyId,
      embeddingModel: DOCUMENT_EMBEDDING_MODEL,
      embeddingModelRevision: DOCUMENT_EMBEDDING_MODEL_REVISION,
      embeddingDimension: DOCUMENT_EMBEDDING_DIMENSION,
      vectorCollection: DOCUMENT_VECTOR_COLLECTION,
      chunkCount: 1,
      uploadedAt: readyAt,
      processingStartedAt: readyAt,
      readyAt,
    },
  });
  const chunk = await database.companyDocumentChunk.create({
    data: {
      documentVersionId: version.id,
      pointId: randomUUID(),
      ordinal: 0,
      byteStart: 0,
      byteEnd: normalized.byteLength,
      contentSha256: createHash("sha256").update(normalized.normalizedBytes).digest("hex"),
      indexVersion: 1,
    },
  });
  await database.companyDocument.update({
    where: { id: document.id },
    data: { activeVersionId: version.id },
  });
  return { document, version, chunk, normalized };
}

function candidateFor(source, score = 1) {
  return {
    pointId: source.chunk.pointId,
    documentVersionId: source.version.id,
    indexVersion: 1,
    score,
  };
}

function providerResult(payload, overrides = {}) {
  const hasSources = payload.context.sources.length > 0;
  return {
    answer: hasSources
      ? "The return period is 30 days."
      : "The supplied documents do not provide enough evidence.",
    outcome: hasSources ? "ANSWER" : "INSUFFICIENT_EVIDENCE",
    notices: [],
    citations: hasSources ? ["S1"] : [],
    promptVersion:
      payload.assistant === "CUSTOMER"
        ? AI_DOCUMENT_PROMPT_VERSIONS.CUSTOMER
        : AI_DOCUMENT_PROMPT_VERSIONS.OWNER,
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

function postDocumentQuestion(
  auth,
  assistant = "customer",
  question = "What is the return period?",
) {
  return mutate("post", `/api/v1/ai/${assistant}/document-responses`, auth)
    .set("Idempotency-Key", randomUUID())
    .send({ question });
}

beforeAll(async () => {
  storageRoot = await filesystem.mkdtemp(path.join(tmpdir(), "opspilot-phase8-ai-"));
  config = loadEnvironment({
    ...process.env,
    AI_ENABLED: "true",
    AI_SERVICE_SIGNING_KEY: Buffer.alloc(32, 0x61).toString("base64"),
    AI_SERVICE_SIGNING_KEY_ID: "phase8-ai-v1",
    AI_CUSTOMER_RATE_LIMIT_MAX: "1000",
    AI_OWNER_RATE_LIMIT_MAX: "1000",
    DOCUMENTS_ENABLED: "true",
    DOCUMENT_STORAGE_ROOT: storageRoot,
    DOCUMENT_ENCRYPTION_KEY: encryptionKey,
    DOCUMENT_ENCRYPTION_KEY_ID: "phase8-ai-documents-v1",
  });
  database = createDatabase(config.databaseUrl);
  documentStore = await createConfiguredDocumentStore(config);
  app = createApp({ config, database, aiClient, documentStore });
});

beforeEach(async () => {
  await clearData();
  aiClient.documentCandidates.mockReset();
  aiClient.respond.mockReset();
  aiClient.documentCandidates.mockResolvedValue({ candidates: [] });
  aiClient.respond.mockImplementation(async (payload) => providerResult(payload));
});

afterAll(async () => {
  if (database) {
    await clearData();
    await database.$disconnect();
  }
  if (storageRoot) await filesystem.rm(storageRoot, { recursive: true, force: true });
});

describe.sequential("Phase 8 document AI API", () => {
  it("requires separate consent and records a grounded citation after final authorization", async () => {
    const customer = await createAuthenticatedUser("CUSTOMER", "customer");
    const uploader = await createAuthenticatedUser("ADMIN", "uploader");
    const source = await createReadyDocument({ uploader: uploader.user });
    aiClient.documentCandidates.mockResolvedValue({ candidates: [candidateFor(source)] });

    const baseConsent = await mutate("put", "/api/v1/ai/consents/customer", customer).send({
      noticeVersion: AI_NOTICE_VERSION,
    });
    expect(baseConsent.status).toBe(201);
    const documentConsentBefore = await request(app)
      .get("/api/v1/ai/document-consents/customer")
      .set("Cookie", customer.cookie);
    expect(documentConsentBefore.body.data.consent.active).toBe(false);
    const denied = await postDocumentQuestion(customer);
    expect(denied.status).toBe(409);
    expect(denied.body.error.code).toBe("AI_CONSENT_REQUIRED");
    expect(aiClient.documentCandidates).not.toHaveBeenCalled();

    const accepted = await acceptDocumentConsent(customer);
    expect(accepted.status).toBe(201);
    expect(accepted.body.data.consent).toMatchObject({
      active: true,
      assistant: "CUSTOMER",
      notice: { version: AI_DOCUMENT_NOTICE_VERSION },
    });
    const response = await postDocumentQuestion(customer);
    expect(response.status).toBe(200);
    expect(response.body.data.response).toMatchObject({
      answer: "The return period is 30 days.",
      outcome: "ANSWER",
      citations: [
        {
          label: "S1",
          documentId: source.document.id,
          title: "Returns policy",
          versionNumber: 1,
          excerpt: "Returns are accepted within 30 days.",
        },
      ],
    });
    expect(response.body.data.response.citations[0].id).toMatch(/^[0-9a-f-]{36}$/);
    const internalPayload = aiClient.respond.mock.calls[0][0];
    expect(internalPayload).toMatchObject({
      assistant: "CUSTOMER",
      intent: "CUSTOMER_DOCUMENT_QA",
      context: {
        sources: [{ label: "S1", excerpt: "Returns are accepted within 30 days." }],
      },
    });
    expect(JSON.stringify(internalPayload.context)).not.toContain(source.document.id);
    expect(JSON.stringify(internalPayload.context)).not.toContain(source.version.id);

    const usage = await database.aiUsageEvent.findFirst({
      where: { userId: customer.user.id },
    });
    expect(usage).toMatchObject({
      intent: "CUSTOMER_DOCUMENT_QA",
      promptVersion: "customer-documents-v1",
      outcome: "ANSWER",
      status: "SUCCEEDED",
    });
    const citation = await database.aiDocumentCitation.findFirst({
      where: { usageEventId: usage.id },
    });
    expect(citation).toMatchObject({
      documentVersionId: source.version.id,
      chunkId: source.chunk.id,
      sourceLabel: "S1",
    });
    const citationRead = await request(app)
      .get(`/api/v1/ai/document-citations/${citation.id}`)
      .set("Cookie", customer.cookie);
    expect(citationRead.status).toBe(200);
    expect(citationRead.body.data.citation).toEqual(response.body.data.response.citations[0]);

    const revoked = await mutate("delete", "/api/v1/ai/document-consents/customer", customer);
    expect(revoked.status).toBe(200);
    const citationAfterRevocation = await request(app)
      .get(`/api/v1/ai/document-citations/${citation.id}`)
      .set("Cookie", customer.cookie);
    expect(citationAfterRevocation.status).toBe(404);
    expect(citationAfterRevocation.body.error.code).toBe("AI_DOCUMENT_CITATION_NOT_FOUND");

    const otherCustomer = await createAuthenticatedUser("CUSTOMER", "other-customer");
    const hiddenCitation = await request(app)
      .get(`/api/v1/ai/document-citations/${citation.id}`)
      .set("Cookie", otherCustomer.cookie);
    expect(hiddenCitation.status).toBe(404);
    expect(
      await database.auditEvent.count({ where: { action: "AI_DOCUMENT_CITATION_READ" } }),
    ).toBe(1);
    const persistedEvidence = JSON.stringify({
      usage: {
        intent: usage.intent,
        outcome: usage.outcome,
        status: usage.status,
      },
      citation,
      audits: await database.auditEvent.findMany({
        select: { action: true, metadata: true },
      }),
    });
    expect(persistedEvidence).not.toContain("What is the return period?");
    expect(persistedEvidence).not.toContain("Returns are accepted within 30 days.");
    expect(persistedEvidence).not.toContain("The return period is 30 days.");
  });

  it("returns insufficient evidence without fabricating citations", async () => {
    const customer = await createAuthenticatedUser("CUSTOMER", "no-evidence");
    await acceptDocumentConsent(customer);

    const response = await postDocumentQuestion(customer, "customer", "Is there a warranty?");
    expect(response.status).toBe(200);
    expect(response.body.data.response).toEqual({
      answer: "The supplied documents do not provide enough evidence.",
      outcome: "INSUFFICIENT_EVIDENCE",
      notices: [],
      citations: [],
    });
    expect(aiClient.respond.mock.calls[0][0].context).toEqual({ sources: [] });
    expect(await database.aiDocumentCitation.count()).toBe(0);
    await expect(database.aiUsageEvent.findFirst()).resolves.toMatchObject({
      status: "SUCCEEDED",
      outcome: "INSUFFICIENT_EVIDENCE",
    });
  });

  it("rejects an unknown model citation and holds ambiguous provider cost", async () => {
    const customer = await createAuthenticatedUser("CUSTOMER", "unknown-citation");
    const uploader = await createAuthenticatedUser("ADMIN", "unknown-citation-uploader");
    const source = await createReadyDocument({ uploader: uploader.user });
    await acceptDocumentConsent(customer);
    aiClient.documentCandidates.mockResolvedValue({ candidates: [candidateFor(source)] });
    aiClient.respond.mockImplementation(async (payload) =>
      providerResult(payload, { citations: ["S2"] }),
    );

    const response = await postDocumentQuestion(customer);
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("AI_PROVIDER_UNAVAILABLE");
    expect(JSON.stringify(response.body)).not.toContain("The return period is 30 days.");
    expect(await database.aiDocumentCitation.count()).toBe(0);
    await expect(database.aiUsageEvent.findFirst()).resolves.toMatchObject({
      status: "UNKNOWN",
      safeErrorCode: "AI_SERVICE_INVALID_RESPONSE",
      outcome: null,
    });
  });

  it("suppresses a valid provider result when the source is archived during generation", async () => {
    const customer = await createAuthenticatedUser("CUSTOMER", "final-check");
    const uploader = await createAuthenticatedUser("ADMIN", "final-check-uploader");
    const source = await createReadyDocument({ uploader: uploader.user });
    await acceptDocumentConsent(customer);
    aiClient.documentCandidates.mockResolvedValue({ candidates: [candidateFor(source)] });
    aiClient.respond.mockImplementation(async (payload) => {
      await database.companyDocument.update({
        where: { id: source.document.id },
        data: { status: "ARCHIVED" },
      });
      return providerResult(payload);
    });

    const response = await postDocumentQuestion(customer);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("AI_AUTHORIZATION_CHANGED");
    expect(JSON.stringify(response.body)).not.toContain("The return period is 30 days.");
    expect(await database.aiDocumentCitation.count()).toBe(0);
    await expect(database.aiUsageEvent.findFirst()).resolves.toMatchObject({
      status: "SUCCEEDED",
      outcome: "ANSWER",
    });
  });
});
