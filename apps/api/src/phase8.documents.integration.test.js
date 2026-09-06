import { randomUUID } from "node:crypto";
import { promises as filesystem } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import { AUDIT_GENESIS_HASH } from "./modules/audit/audit.constants.js";
import { authorizationInclude } from "./modules/auth/auth.presenter.js";
import { createOpaqueToken, digestToken } from "./modules/auth/auth.tokens.js";
import { createDocumentService } from "./modules/documents/document.service.js";
import { createConfiguredDocumentStore } from "./modules/documents/document.store.factory.js";

dotenv.config({ path: ".env.test", override: true, quiet: true });

let app;
let config;
let database;
let storageRoot;
let vectorInventory;
let documentStore;
let aiClient;
const documentEncryptionKey = Buffer.alloc(32, 0x58).toString("base64");

async function clearData() {
  await database.documentMutationReceipt.deleteMany();
  await database.aiDocumentCitation.deleteMany();
  await database.companyDocumentChunk.deleteMany();
  await database.companyDocumentVersionAudience.deleteMany();
  await database.companyDocument.updateMany({ data: { activeVersionId: null } });
  await database.companyDocumentVersion.deleteMany();
  await database.companyDocument.deleteMany();
  await database.backgroundJobAttempt.deleteMany();
  await database.backgroundJob.deleteMany({ where: { replayedFromJobId: { not: null } } });
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
      email: `phase8-${label}-${randomUUID()}@example.com`,
      displayName: `Phase 8 ${label}`,
      passwordHash: "not-used-by-phase8-tests",
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

async function currentActorSnapshot(userId) {
  return database.user.findUnique({ where: { id: userId }, include: authorizationInclude });
}

function documentService() {
  return createDocumentService(database, config, documentStore, aiClient);
}

function mutate(method, url, auth, idempotencyKey = randomUUID()) {
  const mutation = request(app)[method](url);
  return mutation
    .set("Origin", config.corsOrigin)
    .set("Cookie", auth.cookie)
    .set("X-CSRF-Token", auth.csrfToken)
    .set("Idempotency-Key", idempotencyKey);
}

function read(url, auth) {
  return request(app).get(url).set("Cookie", auth.cookie);
}

async function createDocument(auth, overrides = {}, idempotencyKey = randomUUID()) {
  return mutate("post", "/api/v1/documents", auth, idempotencyKey).send({
    title: "Returns policy",
    filename: "returns.md",
    mediaType: "text/markdown",
    language: "en",
    audiences: ["CUSTOMER"],
    ...overrides,
  });
}

async function uploadDocument(
  auth,
  documentId,
  versionId,
  content = "# Returns\r\nReturn within 30 days.\r\n",
  idempotencyKey = randomUUID(),
) {
  return mutate(
    "put",
    `/api/v1/documents/${documentId}/versions/${versionId}/content`,
    auth,
    idempotencyKey,
  )
    .set("Content-Type", "text/markdown")
    .send(content);
}

async function expectConstraintViolation(operation) {
  try {
    await operation;
    throw new Error("Expected MySQL to reject a constraint violation");
  } catch (error) {
    expect(["P2003", "P2004", "P2039"]).toContain(error.code);
  }
}

beforeAll(async () => {
  storageRoot = await filesystem.mkdtemp(path.join(tmpdir(), "opspilot-phase8-integration-"));
  config = loadEnvironment({
    ...process.env,
    DOCUMENTS_ENABLED: "true",
    DOCUMENT_STORAGE_ROOT: storageRoot,
    DOCUMENT_ENCRYPTION_KEY: documentEncryptionKey,
    DOCUMENT_ENCRYPTION_KEY_ID: "phase8-integration-v1",
  });
  database = createDatabase(config.databaseUrl);
  documentStore = await createConfiguredDocumentStore(config);
  aiClient = {
    async documentVectorInventory() {
      return structuredClone(vectorInventory);
    },
  };
  app = createApp({ config, database, documentStore, aiClient });
});

beforeEach(async () => {
  vectorInventory = { totalPoints: 0, versions: [] };
  await clearData();
});

afterAll(async () => {
  if (database) {
    await clearData();
    await database.$disconnect();
  }
  if (storageRoot) await filesystem.rm(storageRoot, { recursive: true, force: true });
});

describe.sequential("Phase 8 protected document foundation", () => {
  it("installs the exact deny-by-default document permission matrix", async () => {
    const roles = await database.role.findMany({
      include: {
        rolePermissions: {
          where: { permission: { code: { startsWith: "documents:" } } },
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

    expect(mapping.OWNER).toEqual(["documents:delete", "documents:manage", "documents:read"]);
    expect(mapping.ADMIN).toEqual(["documents:manage", "documents:read"]);
    expect(mapping.CUSTOMER).toEqual([]);

    const columns = await database.$queryRaw`
      SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (
          'company_documents',
          'company_document_versions',
          'company_document_chunks',
          'ai_document_citations'
        )
    `;
    expect(columns.map((column) => column.columnName)).not.toEqual(
      expect.arrayContaining(["body", "content", "chunk_text", "excerpt", "question", "answer"]),
    );
  });

  it("revalidates active document authority inside mutation transactions", async () => {
    const admin = await createAuthenticatedUser("ADMIN", "stale-manage-admin");
    const createKey = randomUUID();
    const created = await createDocument(admin, {}, createKey);
    expect(created.status).toBe(201);

    const staleAdmin = await currentActorSnapshot(admin.user.id);
    await database.userRole.deleteMany({ where: { userId: admin.user.id } });
    await expect(
      documentService().create({
        actor: staleAdmin,
        input: {
          title: "Returns policy",
          filename: "returns.md",
          mediaType: "text/markdown",
          language: "en",
          audiences: ["CUSTOMER"],
        },
        idempotencyKey: createKey,
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: "DOCUMENT_AUTHORIZATION_CHANGED" });
    expect(await database.companyDocument.count()).toBe(1);

    const disabledAdmin = await createAuthenticatedUser("ADMIN", "disabled-manage-admin");
    const staleDisabledAdmin = await currentActorSnapshot(disabledAdmin.user.id);
    await database.user.update({
      where: { id: disabledAdmin.user.id },
      data: { status: "DISABLED" },
    });
    await expect(
      documentService().create({
        actor: staleDisabledAdmin,
        input: {
          title: "Disabled actor policy",
          filename: "disabled.md",
          mediaType: "text/markdown",
          language: "en",
          audiences: ["CUSTOMER"],
        },
        idempotencyKey: randomUUID(),
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: "DOCUMENT_AUTHORIZATION_CHANGED" });
    expect(await database.companyDocument.count()).toBe(1);

    const deleteAdmin = await createAuthenticatedUser("ADMIN", "delete-source-admin");
    const deleteSource = await createDocument(deleteAdmin, { title: "Delete source" });
    const owner = await createAuthenticatedUser("OWNER", "downgraded-delete-owner");
    const staleOwner = await currentActorSnapshot(owner.user.id);
    const adminRole = await database.role.findUnique({ where: { code: "ADMIN" } });
    const ownerRole = await database.role.findUnique({ where: { code: "OWNER" } });
    await database.userRole.create({ data: { userId: owner.user.id, roleId: adminRole.id } });
    await database.userRole.delete({
      where: { userId_roleId: { userId: owner.user.id, roleId: ownerRole.id } },
    });

    await expect(
      documentService().requestDelete({
        actor: staleOwner,
        documentId: deleteSource.body.data.document.id,
        input: { version: deleteSource.body.data.document.version },
        idempotencyKey: randomUUID(),
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: "DOCUMENT_AUTHORIZATION_CHANGED" });
    expect(
      (
        await database.companyDocument.findUnique({
          where: { id: deleteSource.body.data.document.id },
        })
      ).status,
    ).toBe("ACTIVE");
  });

  it("reports owner-only advisory orphan counts without exposing opaque identifiers", async () => {
    const owner = await createAuthenticatedUser("OWNER", "recovery-owner");
    const admin = await createAuthenticatedUser("ADMIN", "recovery-admin");
    const created = await createDocument(admin, { title: "Recovery source" });
    const document = created.body.data.document;
    await uploadDocument(admin, document.id, document.versions[0].id, "Recovery source text.");

    const orphanObjectKey = `${randomUUID()}.opdoc`;
    const orphanVectorVersionId = randomUUID();
    await filesystem.writeFile(path.join(storageRoot, orphanObjectKey), "orphan ciphertext");
    await filesystem.writeFile(path.join(storageRoot, "unexpected.tmp"), "unexpected entry");
    vectorInventory = {
      totalPoints: 2,
      versions: [{ documentVersionId: orphanVectorVersionId, pointCount: 2 }],
    };

    expect((await read("/api/v1/documents/recovery/orphans", admin)).status).toBe(403);
    const response = await read("/api/v1/documents/recovery/orphans", owner);

    expect(response.status).toBe(200);
    expect(response.body.data.recovery).toMatchObject({
      clean: false,
      advisoryOnly: true,
      storage: {
        objectCount: 2,
        metadataObjectCount: 1,
        orphanObjectCount: 1,
        missingObjectCount: 0,
        unexpectedEntryCount: 1,
      },
      vectorIndex: {
        pointCount: 2,
        metadataPointCount: 0,
        orphanVersionCount: 1,
        orphanPointCount: 2,
        missingVersionCount: 0,
        pointCountMismatchVersionCount: 0,
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(orphanObjectKey);
    expect(JSON.stringify(response.body)).not.toContain(orphanVectorVersionId);
    const audit = await database.auditEvent.findFirst({
      where: { action: "DOCUMENT_RECOVERY_SCANNED" },
    });
    expect(audit).toMatchObject({
      actorUserId: owner.user.id,
      targetType: "DOCUMENT_RECOVERY",
      targetId: null,
      metadata: {
        clean: false,
        orphanObjectCount: 1,
        missingObjectCount: 0,
        unexpectedStorageEntryCount: 1,
        orphanVectorVersionCount: 1,
        orphanVectorPointCount: 2,
        missingVectorVersionCount: 0,
        vectorPointCountMismatchVersionCount: 0,
      },
    });
  });

  it("creates, encrypts, queues, reads, and audits a strict text version", async () => {
    const admin = await createAuthenticatedUser("ADMIN", "admin");
    const customer = await createAuthenticatedUser("CUSTOMER", "customer");
    const created = await createDocument(admin);

    expect(created.status).toBe(201);
    expect(created.body.data.document).toMatchObject({
      title: "Returns policy",
      status: "ACTIVE",
      activeVersionId: null,
      versions: [
        {
          versionNumber: 1,
          status: "AWAITING_UPLOAD",
          filename: "returns.md",
          audiences: ["CUSTOMER"],
        },
      ],
    });
    expect(JSON.stringify(created.body)).not.toContain("storageObjectKey");
    expect(JSON.stringify(created.body)).not.toContain("contentSha256");

    const document = created.body.data.document;
    const version = document.versions[0];
    const uploaded = await uploadDocument(admin, document.id, version.id);
    expect(uploaded.status).toBe(202);
    expect(uploaded.body.data.version.status).toBe("QUEUED");
    expect(uploaded.body.data.job).toMatchObject({ status: "PENDING", created: true });

    const storedVersion = await database.companyDocumentVersion.findUnique({
      where: { id: version.id },
    });
    expect(storedVersion.normalizedByteLength).toBe(
      Buffer.byteLength("# Returns\nReturn within 30 days.\n"),
    );
    expect(storedVersion.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    const encrypted = await filesystem.readFile(
      path.join(storageRoot, storedVersion.storageObjectKey),
    );
    expect(encrypted.includes(Buffer.from("Return within 30 days."))).toBe(false);

    const job = await database.backgroundJob.findUnique({
      where: { id: uploaded.body.data.job.id },
    });
    expect(job.type).toBe("DOCUMENT_VERSION_INGEST");
    expect(job.payload).toEqual({ documentVersionId: version.id, indexVersion: 1 });
    expect(JSON.stringify(job.payload)).not.toContain("Returns");

    const downloaded = await read(
      `/api/v1/documents/${document.id}/versions/${version.id}/content`,
      admin,
    );
    expect(downloaded.status).toBe(200);
    expect(downloaded.text).toBe("# Returns\nReturn within 30 days.\n");
    expect(downloaded.headers["cache-control"]).toBe("no-store");
    expect(downloaded.headers["content-disposition"]).toContain("filename*=UTF-8''returns.md");

    expect(
      (await read(`/api/v1/documents/${document.id}/versions/${version.id}/content`, customer))
        .status,
    ).toBe(403);

    const auditEvents = await database.auditEvent.findMany({ orderBy: { sequence: "asc" } });
    expect(auditEvents.map((event) => event.action)).toEqual([
      "DOCUMENT_CREATED",
      "DOCUMENT_CONTENT_UPLOADED",
      "DOCUMENT_CONTENT_READ",
    ]);
    const auditJson = JSON.stringify(
      auditEvents.map((event) => ({
        action: event.action,
        targetId: event.targetId,
        metadata: event.metadata,
      })),
    );
    expect(auditJson).not.toContain("Return within 30 days");
    expect(auditJson).not.toContain("returns.md");
  });

  it("requires and persists at-most-once mutation keys without retaining content", async () => {
    const admin = await createAuthenticatedUser("ADMIN", "idempotency-admin");
    const missingKey = await request(app)
      .post("/api/v1/documents")
      .set("Origin", config.corsOrigin)
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrfToken)
      .send({
        title: "Returns policy",
        filename: "returns.md",
        mediaType: "text/markdown",
        language: "en",
        audiences: ["CUSTOMER"],
      });
    expect(missingKey.status).toBe(422);
    expect(missingKey.body.error.code).toBe("IDEMPOTENCY_KEY_INVALID");

    const createKey = randomUUID();
    const first = await createDocument(admin, {}, createKey);
    const replay = await createDocument(admin, {}, createKey);
    expect(replay.status).toBe(201);
    expect(replay.body.data.document.id).toBe(first.body.data.document.id);
    expect(await database.companyDocument.count()).toBe(1);
    expect(await database.auditEvent.count({ where: { action: "DOCUMENT_CREATED" } })).toBe(1);

    const conflict = await createDocument(admin, { title: "Different policy" }, createKey);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("DOCUMENT_IDEMPOTENCY_CONFLICT");

    const document = first.body.data.document;
    const uploadKey = randomUUID();
    const uploaded = await uploadDocument(
      admin,
      document.id,
      document.versions[0].id,
      "# Returns\nReturn within 30 days.\n",
      uploadKey,
    );
    const uploadReplay = await uploadDocument(
      admin,
      document.id,
      document.versions[0].id,
      "# Returns\nReturn within 30 days.\n",
      uploadKey,
    );
    expect(uploaded.status).toBe(202);
    expect(uploadReplay.status).toBe(202);
    expect(uploadReplay.body.data.job).toMatchObject({
      id: uploaded.body.data.job.id,
      created: false,
    });
    expect(await filesystem.readdir(storageRoot)).toHaveLength(1);
    expect(await database.backgroundJob.count()).toBe(1);

    const receipts = await database.documentMutationReceipt.findMany();
    expect(receipts).toHaveLength(2);
    const serialized = JSON.stringify(receipts);
    expect(serialized).not.toContain("Returns policy");
    expect(serialized).not.toContain("returns.md");
    expect(serialized).not.toContain("Return within 30 days");
  });

  it("enforces one active ingestion and ten uploads per user per UTC day", async () => {
    const admin = await createAuthenticatedUser("ADMIN", "upload-limits-admin");
    const first = (await createDocument(admin, { title: "First" })).body.data.document;
    const second = (await createDocument(admin, { title: "Second", filename: "second.md" })).body
      .data.document;
    expect((await uploadDocument(admin, first.id, first.versions[0].id)).status).toBe(202);
    const concurrent = await uploadDocument(admin, second.id, second.versions[0].id);
    expect(concurrent.status).toBe(429);
    expect(concurrent.body.error.code).toBe("DOCUMENT_UPLOAD_IN_FLIGHT");

    await database.backgroundJob.updateMany({
      data: { status: "SUCCEEDED", completedAt: new Date() },
    });
    for (let index = 0; index < 9; index += 1) {
      const uploadedAt = new Date();
      await database.companyDocument.create({
        data: {
          title: `Historical ${index}`,
          createdById: admin.user.id,
          updatedById: admin.user.id,
          versions: {
            create: {
              versionNumber: 1,
              status: "FAILED",
              originalFilename: `historical-${index}.txt`,
              mediaType: "text/plain",
              language: "en",
              uploadedById: admin.user.id,
              createdAt: uploadedAt,
              uploadedAt,
              audiences: { create: { audience: "CUSTOMER" } },
            },
          },
        },
      });
    }
    const daily = await uploadDocument(admin, second.id, second.versions[0].id);
    expect(daily.status).toBe(429);
    expect(daily.body.error.code).toBe("DOCUMENT_UPLOAD_DAILY_LIMIT_REACHED");
    expect(await filesystem.readdir(storageRoot)).toHaveLength(1);
  });

  it("rejects unsafe formats, mismatched declarations, duplicate audiences, and oversized bodies", async () => {
    const admin = await createAuthenticatedUser("ADMIN", "validation-admin");
    for (const body of [
      {
        filename: "policy.pdf",
        mediaType: "text/plain",
        audiences: ["CUSTOMER"],
      },
      {
        filename: "../policy.md",
        mediaType: "text/markdown",
        audiences: ["CUSTOMER"],
      },
      {
        filename: "policy.md",
        mediaType: "text/markdown",
        audiences: ["CUSTOMER", "CUSTOMER"],
      },
    ]) {
      const response = await createDocument(admin, body);
      expect(response.status).toBe(422);
    }

    const created = await createDocument(admin);
    const document = created.body.data.document;
    const version = document.versions[0];
    const mismatched = await mutate(
      "put",
      `/api/v1/documents/${document.id}/versions/${version.id}/content`,
      admin,
    )
      .set("Content-Type", "text/plain")
      .send("mismatch");
    expect(mismatched.status).toBe(415);

    const oversized = await uploadDocument(admin, document.id, version.id, "a".repeat(262145));
    expect(oversized.status).toBe(413);
    expect(await filesystem.readdir(storageRoot)).toHaveLength(0);
  });

  it("enforces optimistic versioning, archive/restore, owner-only deletion, and immediate exclusion", async () => {
    const owner = await createAuthenticatedUser("OWNER", "owner");
    const admin = await createAuthenticatedUser("ADMIN", "lifecycle-admin");
    const created = await createDocument(admin, { audiences: ["CUSTOMER", "OWNER"] });
    const document = created.body.data.document;
    const firstVersion = document.versions[0];
    await uploadDocument(admin, document.id, firstVersion.id);

    const detail = await read(`/api/v1/documents/${document.id}`, admin);
    const currentDocumentVersion = detail.body.data.document.version;
    const archived = await mutate("patch", `/api/v1/documents/${document.id}/status`, admin).send({
      status: "ARCHIVED",
      version: currentDocumentVersion,
    });
    expect(archived.status).toBe(200);
    expect(archived.body.data.document.status).toBe("ARCHIVED");

    const staleRestore = await mutate(
      "patch",
      `/api/v1/documents/${document.id}/status`,
      admin,
    ).send({ status: "ACTIVE", version: currentDocumentVersion });
    expect(staleRestore.status).toBe(409);

    const restored = await mutate("patch", `/api/v1/documents/${document.id}/status`, admin).send({
      status: "ACTIVE",
      version: archived.body.data.document.version,
    });
    expect(restored.status).toBe(200);

    const versionCreated = await mutate(
      "post",
      `/api/v1/documents/${document.id}/versions`,
      admin,
    ).send({
      filename: "returns-v2.txt",
      mediaType: "text/plain",
      language: "en",
      audiences: ["OWNER"],
      version: restored.body.data.document.version,
    });
    expect(versionCreated.status).toBe(201);
    expect(versionCreated.body.data.version).toMatchObject({
      versionNumber: 2,
      status: "AWAITING_UPLOAD",
      audiences: ["OWNER"],
    });

    const latest = await read(`/api/v1/documents/${document.id}`, owner);
    const forbiddenDelete = await mutate("delete", `/api/v1/documents/${document.id}`, admin).send({
      version: latest.body.data.document.version,
    });
    expect(forbiddenDelete.status).toBe(403);

    const deletion = await mutate("delete", `/api/v1/documents/${document.id}`, owner).send({
      version: latest.body.data.document.version,
    });
    expect(deletion.status).toBe(202);
    expect(deletion.body.data.document).toMatchObject({
      status: "DELETING",
      activeVersionId: null,
    });
    const deletionJob = await database.backgroundJob.findUnique({
      where: { id: deletion.body.data.job.id },
    });
    expect(deletionJob.payload).toEqual({ documentId: document.id });

    const excludedRead = await read(
      `/api/v1/documents/${document.id}/versions/${firstVersion.id}/content`,
      owner,
    );
    expect(excludedRead.status).toBe(409);
  });

  it("keeps one encrypted object and one job under concurrent duplicate uploads", async () => {
    const admin = await createAuthenticatedUser("ADMIN", "concurrency-admin");
    const created = await createDocument(admin);
    const document = created.body.data.document;
    const version = document.versions[0];

    const results = await Promise.all([
      uploadDocument(admin, document.id, version.id, "First contender"),
      uploadDocument(admin, document.id, version.id, "Second contender"),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([202, 409]);
    expect(await filesystem.readdir(storageRoot)).toHaveLength(1);
    expect(
      await database.backgroundJob.count({
        where: { type: "DOCUMENT_VERSION_INGEST" },
      }),
    ).toBe(1);
  });

  it("enforces active-version ownership and chunk byte ranges in MySQL", async () => {
    const admin = await createAuthenticatedUser("ADMIN", "integrity-admin");
    const first = (await createDocument(admin)).body.data.document;
    const second = (await createDocument(admin, { title: "Second policy", filename: "second.md" }))
      .body.data.document;

    await expectConstraintViolation(
      database.companyDocument.update({
        where: { id: first.id },
        data: { activeVersionId: second.versions[0].id },
      }),
    );

    await expectConstraintViolation(
      database.companyDocumentChunk.create({
        data: {
          documentVersionId: first.versions[0].id,
          pointId: randomUUID(),
          ordinal: 0,
          byteStart: 10,
          byteEnd: 10,
          contentSha256: "a".repeat(64),
          indexVersion: 1,
        },
      }),
    );
  });
});
