import { createHash, randomUUID } from "node:crypto";
import { promises as filesystem } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import { AiInternalClientError } from "./modules/ai/ai.internalClient.js";
import { AUDIT_GENESIS_HASH } from "./modules/audit/audit.constants.js";
import {
  DOCUMENT_EMBEDDING_DIMENSION,
  DOCUMENT_EMBEDDING_MODEL,
  DOCUMENT_EMBEDDING_MODEL_REVISION,
  DOCUMENT_VECTOR_COLLECTION,
} from "./modules/documents/document.constants.js";
import { validateAndNormalizeDocumentContent } from "./modules/documents/document.content.js";
import { createDocumentJobHandler } from "./modules/documents/document.jobs.js";
import { createDocumentRetrievalService } from "./modules/documents/document.retrieval.js";
import { createConfiguredDocumentStore } from "./modules/documents/document.store.factory.js";
import { JOB_ERROR_CODES, JOB_TYPES } from "./modules/jobs/jobs.constants.js";

dotenv.config({ path: ".env.test", override: true, quiet: true });

let config;
let database;
let documentStore;
let storageRoot;
const encryptionKey = Buffer.alloc(32, 0x59).toString("base64");

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

async function createUser() {
  return database.user.create({
    data: {
      email: `phase8-jobs-${randomUUID()}@example.com`,
      displayName: "Phase 8 Jobs",
      passwordHash: "not-used-by-phase8-job-tests",
    },
  });
}

async function createQueuedVersion({
  user,
  document,
  versionNumber = 1,
  content = "Returns are accepted within 30 days.",
  audiences = ["CUSTOMER"],
}) {
  const normalized = validateAndNormalizeDocumentContent({
    filename: `policy-v${versionNumber}.txt`,
    mediaType: "text/plain",
    language: "en",
    rawBytes: Buffer.from(content),
  });
  let logicalDocument = document;
  let version;
  if (!logicalDocument) {
    logicalDocument = await database.companyDocument.create({
      data: {
        title: "Returns policy",
        createdById: user.id,
        updatedById: user.id,
        versions: {
          create: {
            versionNumber,
            originalFilename: `policy-v${versionNumber}.txt`,
            mediaType: "text/plain",
            language: "en",
            uploadedById: user.id,
            audiences: { create: audiences.map((audience) => ({ audience })) },
          },
        },
      },
      include: { versions: true },
    });
    [version] = logicalDocument.versions;
  } else {
    version = await database.companyDocumentVersion.create({
      data: {
        documentId: logicalDocument.id,
        versionNumber,
        originalFilename: `policy-v${versionNumber}.txt`,
        mediaType: "text/plain",
        language: "en",
        uploadedById: user.id,
        audiences: { create: audiences.map((audience) => ({ audience })) },
      },
    });
  }
  const stored = await documentStore.write({
    documentVersionId: version.id,
    plaintext: normalized.normalizedBytes,
  });
  version = await database.companyDocumentVersion.update({
    where: { id: version.id },
    data: {
      status: "QUEUED",
      normalizedByteLength: normalized.byteLength,
      contentSha256: normalized.sha256,
      storageObjectKey: stored.objectKey,
      storageKeyId: stored.keyId,
      uploadedAt: new Date(),
      version: { increment: 1 },
    },
  });
  return { document: logicalDocument, version, normalized };
}

function documentJob(type, payload) {
  return {
    id: randomUUID(),
    type,
    payload,
    sourceRequestId: randomUUID(),
    attemptCount: 1,
    maxAttempts: 8,
  };
}

function createFakeAi({ onIndex, mutateResult } = {}) {
  const cachedResults = new Map();
  const indexPayloads = [];
  const publications = [];
  const deletions = [];
  return {
    indexPayloads,
    publications,
    deletions,
    async indexDocument(payload) {
      indexPayloads.push(payload);
      await onIndex?.(payload);
      const key = `${payload.documentVersionId}:${payload.indexVersion}`;
      let result = cachedResults.get(key);
      if (!result) {
        const bytes = Buffer.from(payload.content, "utf8");
        result = {
          embeddingModel: DOCUMENT_EMBEDDING_MODEL,
          embeddingModelRevision: DOCUMENT_EMBEDDING_MODEL_REVISION,
          embeddingDimension: DOCUMENT_EMBEDDING_DIMENSION,
          vectorCollection: DOCUMENT_VECTOR_COLLECTION,
          indexVersion: payload.indexVersion,
          published: false,
          chunks: [
            {
              pointId: randomUUID(),
              ordinal: 0,
              byteStart: 0,
              byteEnd: bytes.length,
              contentSha256: createHash("sha256").update(bytes).digest("hex"),
            },
          ],
        };
        cachedResults.set(key, result);
      }
      return mutateResult ? mutateResult(structuredClone(result)) : result;
    },
    async setDocumentPublication(payload) {
      publications.push(payload);
      return payload;
    },
    async deleteDocumentVectors(payload) {
      deletions.push(payload);
      return { documentVersionId: payload.documentVersionId, deleted: true };
    },
  };
}

function createHandler(aiClient) {
  return createDocumentJobHandler(database, config, { documentStore, aiClient });
}

beforeAll(async () => {
  storageRoot = await filesystem.mkdtemp(path.join(tmpdir(), "opspilot-phase8-jobs-"));
  config = loadEnvironment({
    ...process.env,
    DOCUMENTS_ENABLED: "true",
    DOCUMENT_STORAGE_ROOT: storageRoot,
    DOCUMENT_ENCRYPTION_KEY: encryptionKey,
    DOCUMENT_ENCRYPTION_KEY_ID: "phase8-jobs-v1",
  });
  database = createDatabase(config.databaseUrl);
  documentStore = await createConfiguredDocumentStore(config);
});

beforeEach(async () => {
  await clearData();
});

afterAll(async () => {
  if (database) {
    await clearData();
    await database.$disconnect();
  }
  if (storageRoot) await filesystem.rm(storageRoot, { recursive: true, force: true });
});

describe.sequential("Phase 8 document lifecycle jobs", () => {
  it("stages, publishes, activates, audits, and idempotently completes an ingestion", async () => {
    const user = await createUser();
    const source = await createQueuedVersion({ user });
    const aiClient = createFakeAi();
    const handler = createHandler(aiClient);
    const job = documentJob(JOB_TYPES.DOCUMENT_VERSION_INGEST, {
      documentVersionId: source.version.id,
      indexVersion: 1,
    });

    await expect(handler.execute(job)).resolves.toEqual({ indexedChunks: 1 });
    const document = await database.companyDocument.findUnique({
      where: { id: source.document.id },
      include: { activeVersion: true },
    });
    expect(document.activeVersion).toMatchObject({
      id: source.version.id,
      status: "READY",
      embeddingModel: DOCUMENT_EMBEDDING_MODEL,
      embeddingModelRevision: DOCUMENT_EMBEDDING_MODEL_REVISION,
      embeddingDimension: 384,
      vectorCollection: DOCUMENT_VECTOR_COLLECTION,
      indexVersion: 1,
      chunkCount: 1,
    });
    expect(aiClient.publications).toEqual([
      {
        contractVersion: 1,
        documentVersionId: source.version.id,
        indexVersion: 1,
        published: true,
      },
    ]);
    const chunk = await database.companyDocumentChunk.findFirst({
      where: { documentVersionId: source.version.id },
    });
    expect(chunk).toMatchObject({
      ordinal: 0,
      byteStart: 0,
      byteEnd: source.normalized.byteLength,
    });
    const audit = await database.auditEvent.findFirst({
      where: { action: "DOCUMENT_INGESTION_COMPLETED" },
    });
    expect(audit).toMatchObject({
      actorKind: "SYSTEM",
      actorUserId: null,
      targetId: source.version.id,
      metadata: { indexVersion: 1, chunkCount: 1 },
    });

    await expect(handler.execute(job)).resolves.toEqual({ alreadyComplete: true });
    expect(aiClient.indexPayloads).toHaveLength(1);
    expect(
      await database.auditEvent.count({ where: { action: "DOCUMENT_INGESTION_COMPLETED" } }),
    ).toBe(1);
  });

  it("activates a replacement only after indexing and supersedes the prior version", async () => {
    const user = await createUser();
    const first = await createQueuedVersion({
      user,
      content: "Returns are accepted within 30 days.",
    });
    const aiClient = createFakeAi();
    const handler = createHandler(aiClient);
    await handler.execute(
      documentJob(JOB_TYPES.DOCUMENT_VERSION_INGEST, {
        documentVersionId: first.version.id,
        indexVersion: 1,
      }),
    );

    const replacement = await createQueuedVersion({
      user,
      document: first.document,
      versionNumber: 2,
      content: "Returns are accepted within 45 days.",
    });
    await handler.execute(
      documentJob(JOB_TYPES.DOCUMENT_VERSION_INGEST, {
        documentVersionId: replacement.version.id,
        indexVersion: 1,
      }),
    );

    const document = await database.companyDocument.findUnique({
      where: { id: first.document.id },
      include: { versions: { orderBy: { versionNumber: "asc" } } },
    });
    expect(document.activeVersionId).toBe(replacement.version.id);
    expect(document.versions[0]).toMatchObject({
      id: first.version.id,
      status: "SUPERSEDED",
    });
    expect(document.versions[0].supersededAt).toBeInstanceOf(Date);
    expect(document.versions[1]).toMatchObject({
      id: replacement.version.id,
      status: "READY",
    });
    expect(aiClient.publications).toEqual([
      {
        contractVersion: 1,
        documentVersionId: first.version.id,
        indexVersion: 1,
        published: true,
      },
      {
        contractVersion: 1,
        documentVersionId: first.version.id,
        indexVersion: 1,
        published: false,
      },
      {
        contractVersion: 1,
        documentVersionId: replacement.version.id,
        indexVersion: 1,
        published: true,
      },
    ]);
    expect(
      await database.auditEvent.count({ where: { action: "DOCUMENT_INGESTION_COMPLETED" } }),
    ).toBe(2);
  });

  it("reindexes without losing citation history, then erases content during deletion", async () => {
    const user = await createUser();
    const source = await createQueuedVersion({ user, audiences: ["CUSTOMER", "OWNER"] });
    const aiClient = createFakeAi();
    const handler = createHandler(aiClient);
    await handler.execute(
      documentJob(JOB_TYPES.DOCUMENT_VERSION_INGEST, {
        documentVersionId: source.version.id,
        indexVersion: 1,
      }),
    );
    const firstChunk = await database.companyDocumentChunk.findFirst({
      where: { documentVersionId: source.version.id, indexVersion: 1 },
    });

    await expect(
      handler.execute(
        documentJob(JOB_TYPES.DOCUMENT_VERSION_REINDEX, {
          documentVersionId: source.version.id,
          indexVersion: 2,
        }),
      ),
    ).resolves.toEqual({ indexedChunks: 1 });
    const reindexed = await database.companyDocumentVersion.findUnique({
      where: { id: source.version.id },
    });
    expect(reindexed).toMatchObject({ status: "READY", indexVersion: 2, chunkCount: 1 });
    expect(
      await database.companyDocumentChunk.findMany({
        where: { documentVersionId: source.version.id },
        orderBy: { indexVersion: "asc" },
        select: { indexVersion: true },
      }),
    ).toEqual([{ indexVersion: 1 }, { indexVersion: 2 }]);
    expect(aiClient.publications.slice(-2)).toEqual([
      {
        contractVersion: 1,
        documentVersionId: source.version.id,
        indexVersion: 1,
        published: false,
      },
      {
        contractVersion: 1,
        documentVersionId: source.version.id,
        indexVersion: 2,
        published: true,
      },
    ]);

    const usage = await database.aiUsageEvent.create({
      data: {
        userId: user.id,
        submissionKey: randomUUID(),
        provider: "GROQ",
        assistant: "CUSTOMER",
        intent: "CUSTOMER_DOCUMENT_QA",
        promptVersion: "customer-documents-v1",
        model: "openai/gpt-oss-120b",
        reservedCostTicks: 0n,
      },
    });
    const citation = await database.aiDocumentCitation.create({
      data: {
        usageEventId: usage.id,
        documentVersionId: source.version.id,
        chunkId: firstChunk.id,
        sourceLabel: "S1",
      },
    });
    await database.$transaction(async (transaction) => {
      await transaction.companyDocument.update({
        where: { id: source.document.id },
        data: { status: "DELETING", activeVersionId: null, version: { increment: 1 } },
      });
      await transaction.companyDocumentVersion.update({
        where: { id: source.version.id },
        data: { status: "DELETING", version: { increment: 1 } },
      });
    });

    await expect(
      handler.execute(
        documentJob(JOB_TYPES.DOCUMENT_VERSION_DELETE, { documentId: source.document.id }),
      ),
    ).resolves.toEqual({ deletedVersions: 1 });
    const deletedDocument = await database.companyDocument.findUnique({
      where: { id: source.document.id },
    });
    const deletedVersion = await database.companyDocumentVersion.findUnique({
      where: { id: source.version.id },
    });
    expect(deletedDocument).toMatchObject({
      title: "Deleted document",
      status: "DELETED",
      activeVersionId: null,
    });
    expect(deletedVersion).toMatchObject({
      originalFilename: "deleted.txt",
      status: "DELETED",
      contentSha256: null,
      storageObjectKey: null,
      embeddingModel: null,
      chunkCount: null,
    });
    expect(
      await database.companyDocumentChunk.count({
        where: { documentVersionId: source.version.id },
      }),
    ).toBe(0);
    expect(
      await database.companyDocumentVersionAudience.count({
        where: { documentVersionId: source.version.id },
      }),
    ).toBe(0);
    await expect(
      database.aiDocumentCitation.findUnique({ where: { id: citation.id } }),
    ).resolves.toMatchObject({
      documentVersionId: source.version.id,
      chunkId: firstChunk.id,
    });
    await expect(
      filesystem.access(path.join(storageRoot, source.version.storageObjectKey)),
    ).rejects.toThrow();
    expect(aiClient.deletions).toContainEqual({
      contractVersion: 1,
      documentVersionId: source.version.id,
    });
  });

  it("fails a version closed on descriptor-integrity mismatch", async () => {
    const user = await createUser();
    const source = await createQueuedVersion({ user });
    const aiClient = createFakeAi({
      mutateResult(result) {
        result.chunks[0].contentSha256 = "0".repeat(64);
        return result;
      },
    });
    const handler = createHandler(aiClient);
    const job = documentJob(JOB_TYPES.DOCUMENT_VERSION_INGEST, {
      documentVersionId: source.version.id,
      indexVersion: 1,
    });

    await expect(handler.execute(job)).rejects.toMatchObject({
      code: JOB_ERROR_CODES.DOCUMENT_INTEGRITY_INVALID,
      terminal: true,
    });
    await expect(
      database.companyDocumentVersion.findUnique({ where: { id: source.version.id } }),
    ).resolves.toMatchObject({
      status: "FAILED",
      failureCode: JOB_ERROR_CODES.DOCUMENT_INTEGRITY_INVALID,
    });
    const audit = await database.auditEvent.findFirst({
      where: { action: "DOCUMENT_INGESTION_FAILED" },
    });
    expect(audit).toMatchObject({ outcome: "FAILURE", actorKind: "SYSTEM" });
    expect(await database.companyDocumentChunk.count()).toBe(0);
  });

  it("keeps transient index outages retryable without falsely marking failure", async () => {
    const user = await createUser();
    const source = await createQueuedVersion({ user });
    const aiClient = createFakeAi();
    aiClient.indexDocument = async () => {
      throw new AiInternalClientError("DOCUMENT_INDEX_UNAVAILABLE");
    };
    const handler = createHandler(aiClient);

    await expect(
      handler.execute(
        documentJob(JOB_TYPES.DOCUMENT_VERSION_INGEST, {
          documentVersionId: source.version.id,
          indexVersion: 1,
        }),
      ),
    ).rejects.toMatchObject({
      code: JOB_ERROR_CODES.DOCUMENT_INDEX_UNAVAILABLE,
      terminal: false,
    });
    await expect(
      database.companyDocumentVersion.findUnique({ where: { id: source.version.id } }),
    ).resolves.toMatchObject({ status: "PROCESSING", failureCode: null });
    expect(
      await database.auditEvent.count({ where: { action: "DOCUMENT_INGESTION_FAILED" } }),
    ).toBe(0);
  });

  it("cancels and removes vectors when deletion wins an in-flight ingestion race", async () => {
    const user = await createUser();
    const source = await createQueuedVersion({ user });
    const aiClient = createFakeAi({
      async onIndex() {
        await database.$transaction(async (transaction) => {
          await transaction.companyDocument.update({
            where: { id: source.document.id },
            data: { status: "DELETING", activeVersionId: null },
          });
          await transaction.companyDocumentVersion.update({
            where: { id: source.version.id },
            data: { status: "DELETING" },
          });
        });
      },
    });
    const handler = createHandler(aiClient);

    await expect(
      handler.execute(
        documentJob(JOB_TYPES.DOCUMENT_VERSION_INGEST, {
          documentVersionId: source.version.id,
          indexVersion: 1,
        }),
      ),
    ).resolves.toEqual({ cancelledByDeletion: true });
    expect(aiClient.publications).toEqual([]);
    expect(aiClient.deletions).toEqual([
      { contractVersion: 1, documentVersionId: source.version.id },
    ]);
    expect(await database.companyDocumentChunk.count()).toBe(0);
  });

  it("reauthorizes audience-filtered candidates and sends only labeled excerpts to AI", async () => {
    const user = await createUser();
    const customerSource = await createQueuedVersion({
      user,
      content: "Customer returns are accepted within 30 days.",
      audiences: ["CUSTOMER"],
    });
    const ownerSource = await createQueuedVersion({
      user,
      content: "Owner escalation policy is reviewed weekly.",
      audiences: ["OWNER"],
    });
    const aiClient = createFakeAi();
    const handler = createHandler(aiClient);
    for (const source of [customerSource, ownerSource]) {
      await handler.execute(
        documentJob(JOB_TYPES.DOCUMENT_VERSION_INGEST, {
          documentVersionId: source.version.id,
          indexVersion: 1,
        }),
      );
    }
    const chunks = await database.companyDocumentChunk.findMany({
      include: { documentVersion: true },
    });
    const customerChunk = chunks.find(
      (chunk) => chunk.documentVersionId === customerSource.version.id,
    );
    const ownerChunk = chunks.find((chunk) => chunk.documentVersionId === ownerSource.version.id);
    const candidateRequests = [];
    aiClient.documentCandidates = async (payload) => {
      candidateRequests.push(payload);
      return {
        candidates: [
          {
            pointId: ownerChunk.pointId,
            documentVersionId: ownerChunk.documentVersionId,
            indexVersion: ownerChunk.indexVersion,
            score: 1,
          },
          {
            pointId: customerChunk.pointId,
            documentVersionId: customerChunk.documentVersionId,
            indexVersion: customerChunk.indexVersion,
            score: 1,
          },
        ],
      };
    };
    const retrieval = createDocumentRetrievalService(database, config, documentStore, aiClient);

    const customer = await retrieval.retrieve({
      assistant: "CUSTOMER",
      question: "What is the return period?",
    });
    expect(customer.internalContext).toEqual({
      sources: [{ label: "S1", excerpt: "Customer returns are accepted within 30 days." }],
    });
    expect(JSON.stringify(customer.internalContext)).not.toContain(customerSource.document.id);
    expect(JSON.stringify(customer.internalContext)).not.toContain(customerSource.version.id);
    expect(customer.sources[0]).toMatchObject({
      documentId: customerSource.document.id,
      documentVersionId: customerSource.version.id,
      chunkId: customerChunk.id,
    });

    const owner = await retrieval.retrieve({
      assistant: "OWNER",
      question: "Which policies are available?",
    });
    expect(owner.internalContext.sources).toEqual([
      { label: "S1", excerpt: "Owner escalation policy is reviewed weekly." },
      { label: "S2", excerpt: "Customer returns are accepted within 30 days." },
    ]);
    expect(candidateRequests.map((request) => request.audiences)).toEqual([
      ["CUSTOMER"],
      ["CUSTOMER", "OWNER"],
    ]);
  });

  it("fails closed when document authorization changes after decryption", async () => {
    const user = await createUser();
    const source = await createQueuedVersion({ user });
    const aiClient = createFakeAi();
    await createHandler(aiClient).execute(
      documentJob(JOB_TYPES.DOCUMENT_VERSION_INGEST, {
        documentVersionId: source.version.id,
        indexVersion: 1,
      }),
    );
    const chunk = await database.companyDocumentChunk.findFirst({
      where: { documentVersionId: source.version.id },
    });
    aiClient.documentCandidates = async () => ({
      candidates: [
        {
          pointId: chunk.pointId,
          documentVersionId: chunk.documentVersionId,
          indexVersion: chunk.indexVersion,
          score: 1,
        },
      ],
    });
    let changed = false;
    const racingStore = {
      async read(input) {
        const result = await documentStore.read(input);
        if (!changed) {
          changed = true;
          await database.companyDocument.update({
            where: { id: source.document.id },
            data: { status: "ARCHIVED" },
          });
        }
        return result;
      },
    };
    const retrieval = createDocumentRetrievalService(database, config, racingStore, aiClient);

    await expect(
      retrieval.retrieve({ assistant: "CUSTOMER", question: "What is the policy?" }),
    ).rejects.toMatchObject({ code: "DOCUMENT_AUTHORIZATION_CHANGED" });
  });
});
