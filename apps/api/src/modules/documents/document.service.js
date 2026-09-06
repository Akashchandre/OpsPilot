import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "../audit/audit.constants.js";
import { auditDescriptor } from "../audit/audit.descriptor.js";
import { createAuditService } from "../audit/audit.service.js";
import { PERMISSIONS } from "../auth/auth.constants.js";
import { enqueueJob } from "../jobs/jobs.queue.js";
import { JOB_STATUSES, JOB_TYPES } from "../jobs/jobs.constants.js";
import {
  DOCUMENT_INDEX_VERSION,
  DOCUMENT_STATUSES,
  DOCUMENT_UPLOAD_DAILY_MAXIMUM,
  DOCUMENT_VERSION_STATUSES,
} from "./document.constants.js";
import { validateAndNormalizeDocumentContent } from "./document.content.js";
import {
  documentContentTypeMismatch,
  documentNotFound,
  documentRecoveryUnavailable,
  documentStateConflict,
  documentStorageUnavailable,
  documentUploadDailyLimitReached,
  documentUploadInFlight,
  documentVersionConflict,
  documentVersionNotFound,
  documentsDisabled,
  mapDocumentContentError,
} from "./document.errors.js";
import {
  createDocumentMutationReceipt,
  DOCUMENT_MUTATION_OPERATIONS,
  documentMutationHash,
  findDocumentMutationReceipt,
  lockDocumentActor,
} from "./document.idempotency.js";
import { presentDocument, presentDocumentVersion } from "./document.presenter.js";

const versionInclude = Object.freeze({
  audiences: {
    select: { audience: true },
    orderBy: { audience: "asc" },
  },
});

const documentDetailInclude = Object.freeze({
  versions: {
    include: versionInclude,
    orderBy: { versionNumber: "desc" },
  },
  activeVersion: { include: versionInclude },
});

function paginationMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

function mapDatabaseError(error) {
  if (error?.isOperational) throw error;
  if (error?.code === "P2034") throw documentVersionConflict();
  throw error;
}

async function lockDocument(transaction, documentId) {
  const rows = await transaction.$queryRaw`
    SELECT id
    FROM company_documents
    WHERE id = ${documentId}
    FOR UPDATE
  `;
  if (!Array.isArray(rows) || rows.length !== 1) throw documentNotFound();
  const document = await transaction.companyDocument.findUnique({
    where: { id: documentId },
    include: documentDetailInclude,
  });
  if (!document) throw documentNotFound();
  return document;
}

function assertMutableDocument(document) {
  if ([DOCUMENT_STATUSES.DELETING, DOCUMENT_STATUSES.DELETED].includes(document.status)) {
    throw documentStateConflict();
  }
}

function versionCreateData(input, actorId, versionNumber) {
  return {
    versionNumber,
    originalFilename: input.filename,
    mediaType: input.mediaType,
    language: input.language,
    indexVersion: DOCUMENT_INDEX_VERSION,
    uploadedById: actorId,
    audiences: {
      create: input.audiences.map((audience) => ({ audience })),
    },
  };
}

function documentVersionAuditMetadata(input, versionNumber) {
  return {
    versionNumber,
    audiences: input.audiences,
    mediaType: input.mediaType,
    language: input.language,
  };
}

function safeJob(jobResult) {
  return {
    id: jobResult.job.id,
    status: jobResult.job.status,
    created: jobResult.created,
  };
}

function receiptIdentity(actor, idempotencyKey, operation, requestHash) {
  return { actorUserId: actor.id, idempotencyKey, operation, requestHash };
}

async function receiptDocument(transaction, receipt) {
  if (!receipt.documentId) throw documentStateConflict();
  const document = await transaction.companyDocument.findUnique({
    where: { id: receipt.documentId },
    include: documentDetailInclude,
  });
  if (!document) throw documentStateConflict();
  return presentDocument(document);
}

async function receiptVersion(transaction, receipt) {
  if (!receipt.documentVersionId) throw documentStateConflict();
  const version = await transaction.companyDocumentVersion.findUnique({
    where: { id: receipt.documentVersionId },
    include: versionInclude,
  });
  if (!version) throw documentStateConflict();
  return presentDocumentVersion(version);
}

async function receiptJob(transaction, receipt) {
  if (!receipt.jobId) throw documentStateConflict();
  const job = await transaction.backgroundJob.findUnique({ where: { id: receipt.jobId } });
  if (!job) throw documentStateConflict();
  return safeJob({ job, created: false });
}

function utcDayStart(date = new Date()) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

async function enforceUploadLimits(transaction, actorUserId) {
  const [activeIngestions, dailyUploads] = await Promise.all([
    transaction.backgroundJob.count({
      where: {
        type: JOB_TYPES.DOCUMENT_VERSION_INGEST,
        sourceActorUserId: actorUserId,
        status: { in: [JOB_STATUSES.PENDING, JOB_STATUSES.PROCESSING] },
      },
    }),
    transaction.companyDocumentVersion.count({
      where: { uploadedById: actorUserId, uploadedAt: { gte: utcDayStart() } },
    }),
  ]);
  if (activeIngestions >= 1) throw documentUploadInFlight();
  if (dailyUploads >= DOCUMENT_UPLOAD_DAILY_MAXIMUM) {
    throw documentUploadDailyLimitReached();
  }
}

export function createDocumentService(database, config, documentStore, aiClient = null) {
  const appendAudit = createAuditService(database, config).append;

  function requireEnabled() {
    if (!config.documents?.enabled || !documentStore) throw documentsDisabled();
  }

  return Object.freeze({
    async list(query) {
      requireEnabled();
      const where = query.status === "ALL" ? {} : { status: query.status };
      const [documents, total] = await database.$transaction([
        database.companyDocument.findMany({
          where,
          include: { activeVersion: { include: versionInclude } },
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        database.companyDocument.count({ where }),
      ]);
      return {
        documents: documents.map((document) => presentDocument(document)),
        meta: paginationMeta(query.page, query.limit, total),
      };
    },

    async recovery({ actor, requestId }) {
      requireEnabled();
      if (!documentStore?.inventory || !aiClient?.documentVectorInventory) {
        throw documentRecoveryUnavailable();
      }
      let storageInventory;
      let vectorInventory;
      try {
        [storageInventory, vectorInventory] = await Promise.all([
          documentStore.inventory(),
          aiClient.documentVectorInventory(requestId),
        ]);
      } catch {
        throw documentRecoveryUnavailable();
      }

      const versions = await database.companyDocumentVersion.findMany({
        select: {
          id: true,
          storageObjectKey: true,
          _count: { select: { chunks: true } },
        },
      });
      const metadataObjectKeys = new Set(
        versions.map((version) => version.storageObjectKey).filter(Boolean),
      );
      const actualObjectKeys = new Set(storageInventory.objectKeys);
      const orphanObjectCount = [...actualObjectKeys].filter(
        (objectKey) => !metadataObjectKeys.has(objectKey),
      ).length;
      const missingObjectCount = [...metadataObjectKeys].filter(
        (objectKey) => !actualObjectKeys.has(objectKey),
      ).length;

      const metadataPointCounts = new Map(
        versions.map((version) => [version.id, version._count.chunks]),
      );
      const actualPointCounts = new Map(
        vectorInventory.versions.map((version) => [version.documentVersionId, version.pointCount]),
      );
      const orphanVectorEntries = vectorInventory.versions.filter(
        (version) => !metadataPointCounts.has(version.documentVersionId),
      );
      const missingVectorVersionCount = [...metadataPointCounts].filter(
        ([versionId, pointCount]) => pointCount > 0 && !actualPointCounts.has(versionId),
      ).length;
      const vectorPointCountMismatchVersionCount = [...actualPointCounts].filter(
        ([versionId, pointCount]) =>
          metadataPointCounts.has(versionId) && metadataPointCounts.get(versionId) !== pointCount,
      ).length;
      const auditMetadata = {
        orphanObjectCount,
        missingObjectCount,
        unexpectedStorageEntryCount: storageInventory.unexpectedEntryCount,
        orphanVectorVersionCount: orphanVectorEntries.length,
        orphanVectorPointCount: orphanVectorEntries.reduce(
          (total, version) => total + version.pointCount,
          0,
        ),
        missingVectorVersionCount,
        vectorPointCountMismatchVersionCount,
      };
      auditMetadata.clean = Object.values(auditMetadata).every((count) => count === 0);
      await database.$transaction(async (transaction) => {
        await appendAudit(
          transaction,
          auditDescriptor({
            action: AUDIT_ACTIONS.DOCUMENT_RECOVERY_SCANNED,
            targetType: AUDIT_TARGET_TYPES.DOCUMENT_RECOVERY,
            targetId: null,
            actorUserId: actor.id,
            requestId,
            metadata: auditMetadata,
          }),
        );
      });

      return {
        clean: auditMetadata.clean,
        advisoryOnly: true,
        scannedAt: new Date().toISOString(),
        storage: {
          objectCount: actualObjectKeys.size,
          metadataObjectCount: metadataObjectKeys.size,
          orphanObjectCount,
          missingObjectCount,
          unexpectedEntryCount: storageInventory.unexpectedEntryCount,
        },
        vectorIndex: {
          pointCount: vectorInventory.totalPoints,
          metadataPointCount: [...metadataPointCounts.values()].reduce(
            (total, count) => total + count,
            0,
          ),
          orphanVersionCount: orphanVectorEntries.length,
          orphanPointCount: auditMetadata.orphanVectorPointCount,
          missingVersionCount: missingVectorVersionCount,
          pointCountMismatchVersionCount: vectorPointCountMismatchVersionCount,
        },
      };
    },

    async get(documentId) {
      requireEnabled();
      const document = await database.companyDocument.findUnique({
        where: { id: documentId },
        include: documentDetailInclude,
      });
      if (!document) throw documentNotFound();
      return presentDocument(document);
    },

    async create({ actor, input, idempotencyKey, requestId }) {
      requireEnabled();
      const operation = DOCUMENT_MUTATION_OPERATIONS.CREATE_DOCUMENT;
      const requestHash = documentMutationHash(operation, input);
      const identity = receiptIdentity(actor, idempotencyKey, operation, requestHash);
      try {
        return await database.$transaction(
          async (transaction) => {
            await lockDocumentActor(transaction, actor.id, PERMISSIONS.DOCUMENTS_MANAGE);
            const receipt = await findDocumentMutationReceipt(transaction, identity);
            if (receipt) return receiptDocument(transaction, receipt);
            const document = await transaction.companyDocument.create({
              data: {
                title: input.title,
                createdById: actor.id,
                updatedById: actor.id,
                versions: { create: versionCreateData(input, actor.id, 1) },
              },
              include: documentDetailInclude,
            });
            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.DOCUMENT_CREATED,
                targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT,
                targetId: document.id,
                actorUserId: actor.id,
                requestId,
                metadata: documentVersionAuditMetadata(input, 1),
              }),
            );
            await createDocumentMutationReceipt(transaction, {
              ...identity,
              documentId: document.id,
              documentVersionId: document.versions[0].id,
            });
            return presentDocument(document);
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        return mapDatabaseError(error);
      }
    },

    async createVersion({ actor, documentId, input, idempotencyKey, requestId }) {
      requireEnabled();
      const operation = DOCUMENT_MUTATION_OPERATIONS.CREATE_VERSION;
      const requestHash = documentMutationHash(operation, { documentId, ...input });
      const identity = receiptIdentity(actor, idempotencyKey, operation, requestHash);
      try {
        return await database.$transaction(
          async (transaction) => {
            await lockDocumentActor(transaction, actor.id, PERMISSIONS.DOCUMENTS_MANAGE);
            const receipt = await findDocumentMutationReceipt(transaction, identity);
            if (receipt) return receiptVersion(transaction, receipt);
            const document = await lockDocument(transaction, documentId);
            assertMutableDocument(document);
            if (document.version !== input.version) throw documentVersionConflict();
            const versionNumber =
              Math.max(...document.versions.map((entry) => entry.versionNumber)) + 1;
            const version = await transaction.companyDocumentVersion.create({
              data: {
                documentId,
                ...versionCreateData(input, actor.id, versionNumber),
              },
              include: versionInclude,
            });
            await transaction.companyDocument.update({
              where: { id: documentId },
              data: { updatedById: actor.id, version: { increment: 1 } },
            });
            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.DOCUMENT_VERSION_CREATED,
                targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT_VERSION,
                targetId: version.id,
                actorUserId: actor.id,
                requestId,
                metadata: documentVersionAuditMetadata(input, versionNumber),
              }),
            );
            await createDocumentMutationReceipt(transaction, {
              ...identity,
              documentId,
              documentVersionId: version.id,
            });
            return presentDocumentVersion(version);
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        return mapDatabaseError(error);
      }
    },

    async uploadContent({
      actor,
      documentId,
      versionId,
      rawBytes,
      contentType,
      idempotencyKey,
      requestId,
    }) {
      requireEnabled();
      const draft = await database.companyDocumentVersion.findFirst({
        where: { id: versionId, documentId },
        include: { document: true },
      });
      if (!draft) throw documentVersionNotFound();
      if (contentType !== draft.mediaType) throw documentContentTypeMismatch();

      let content;
      try {
        content = validateAndNormalizeDocumentContent({
          filename: draft.originalFilename,
          mediaType: draft.mediaType,
          language: draft.language,
          rawBytes,
          maximumBytes: config.documents?.maximumUploadBytes,
        });
      } catch (error) {
        throw mapDocumentContentError(error);
      }

      const operation = DOCUMENT_MUTATION_OPERATIONS.UPLOAD_CONTENT;
      const requestHash = documentMutationHash(operation, {
        documentId,
        versionId,
        contentType,
        contentSha256: content.sha256,
      });
      const identity = receiptIdentity(actor, idempotencyKey, operation, requestHash);
      const existingReceipt = await database.$transaction(
        async (transaction) => {
          await lockDocumentActor(transaction, actor.id, PERMISSIONS.DOCUMENTS_MANAGE);
          return findDocumentMutationReceipt(transaction, identity);
        },
        { isolationLevel: "Serializable" },
      );
      if (existingReceipt) {
        return {
          version: await receiptVersion(database, existingReceipt),
          job: await receiptJob(database, existingReceipt),
        };
      }
      assertMutableDocument(draft.document);
      if (draft.status !== DOCUMENT_VERSION_STATUSES.AWAITING_UPLOAD) {
        throw documentStateConflict();
      }

      let stored;
      try {
        stored = await documentStore.write({
          documentVersionId: versionId,
          plaintext: content.normalizedBytes,
        });
      } catch {
        throw documentStorageUnavailable();
      }

      let outcome;
      try {
        outcome = await database.$transaction(
          async (transaction) => {
            await lockDocumentActor(transaction, actor.id, PERMISSIONS.DOCUMENTS_MANAGE);
            const receipt = await findDocumentMutationReceipt(transaction, identity);
            if (receipt) {
              return {
                replayed: true,
                result: {
                  version: await receiptVersion(transaction, receipt),
                  job: await receiptJob(transaction, receipt),
                },
              };
            }
            const document = await lockDocument(transaction, documentId);
            assertMutableDocument(document);
            const current = document.versions.find((entry) => entry.id === versionId);
            if (!current) throw documentVersionNotFound();
            if (current.status !== DOCUMENT_VERSION_STATUSES.AWAITING_UPLOAD) {
              throw documentStateConflict();
            }
            await enforceUploadLimits(transaction, actor.id);

            const uploadedAt = new Date();
            const update = await transaction.companyDocumentVersion.updateMany({
              where: {
                id: versionId,
                documentId,
                status: DOCUMENT_VERSION_STATUSES.AWAITING_UPLOAD,
                version: current.version,
              },
              data: {
                status: DOCUMENT_VERSION_STATUSES.QUEUED,
                normalizedByteLength: content.byteLength,
                contentSha256: content.sha256,
                storageObjectKey: stored.objectKey,
                storageKeyId: stored.keyId,
                uploadedAt,
                version: { increment: 1 },
              },
            });
            if (update.count !== 1) throw documentVersionConflict();

            const jobResult = await enqueueJob(transaction, config, {
              type: JOB_TYPES.DOCUMENT_VERSION_INGEST,
              dedupeKey: `document-ingest:${versionId}:${content.sha256}:${current.indexVersion}`,
              payload: { documentVersionId: versionId, indexVersion: current.indexVersion },
              sourceRequestId: requestId,
              sourceActorUserId: actor.id,
            });
            await transaction.companyDocument.update({
              where: { id: documentId },
              data: { updatedById: actor.id, version: { increment: 1 } },
            });
            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.DOCUMENT_CONTENT_UPLOADED,
                targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT_VERSION,
                targetId: versionId,
                actorUserId: actor.id,
                requestId,
                metadata: {
                  versionNumber: current.versionNumber,
                  byteLength: content.byteLength,
                  jobCreated: jobResult.created,
                },
              }),
            );
            const version = await transaction.companyDocumentVersion.findUnique({
              where: { id: versionId },
              include: versionInclude,
            });
            await createDocumentMutationReceipt(transaction, {
              ...identity,
              documentId,
              documentVersionId: versionId,
              jobId: jobResult.job.id,
            });
            return {
              replayed: false,
              result: { version: presentDocumentVersion(version), job: safeJob(jobResult) },
            };
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        try {
          await documentStore.delete(stored.objectKey);
        } catch {
          throw documentStorageUnavailable();
        }
        return mapDatabaseError(error);
      }
      if (outcome.replayed) {
        try {
          await documentStore.delete(stored.objectKey);
        } catch {
          throw documentStorageUnavailable();
        }
      }
      return outcome.result;
    },

    async readContent({ actor, documentId, versionId, requestId }) {
      requireEnabled();
      const source = await database.companyDocumentVersion.findFirst({
        where: { id: versionId, documentId },
        include: { document: true },
      });
      if (!source) throw documentVersionNotFound();
      assertMutableDocument(source.document);
      if (
        !source.storageObjectKey ||
        !source.contentSha256 ||
        [DOCUMENT_VERSION_STATUSES.DELETING, DOCUMENT_VERSION_STATUSES.DELETED].includes(
          source.status,
        )
      ) {
        throw documentStateConflict();
      }

      let restored;
      try {
        restored = await documentStore.read({
          objectKey: source.storageObjectKey,
          documentVersionId: versionId,
          expectedSha256: source.contentSha256,
        });
      } catch {
        throw documentStorageUnavailable();
      }

      await database.$transaction(
        async (transaction) => {
          const document = await lockDocument(transaction, documentId);
          assertMutableDocument(document);
          const current = document.versions.find((entry) => entry.id === versionId);
          if (
            !current ||
            current.storageObjectKey !== source.storageObjectKey ||
            current.contentSha256 !== source.contentSha256 ||
            [DOCUMENT_VERSION_STATUSES.DELETING, DOCUMENT_VERSION_STATUSES.DELETED].includes(
              current.status,
            )
          ) {
            throw documentStateConflict();
          }
          await appendAudit(
            transaction,
            auditDescriptor({
              action: AUDIT_ACTIONS.DOCUMENT_CONTENT_READ,
              targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT_VERSION,
              targetId: versionId,
              actorUserId: actor.id,
              requestId,
              metadata: {
                versionNumber: current.versionNumber,
                byteLength: restored.plaintext.length,
              },
            }),
          );
        },
        { isolationLevel: "Serializable" },
      );

      return {
        bytes: restored.plaintext,
        filename: source.originalFilename,
        mediaType: source.mediaType,
      };
    },

    async updateStatus({ actor, documentId, input, idempotencyKey, requestId }) {
      requireEnabled();
      const operation = DOCUMENT_MUTATION_OPERATIONS.UPDATE_STATUS;
      const requestHash = documentMutationHash(operation, { documentId, ...input });
      const identity = receiptIdentity(actor, idempotencyKey, operation, requestHash);
      try {
        return await database.$transaction(
          async (transaction) => {
            await lockDocumentActor(transaction, actor.id, PERMISSIONS.DOCUMENTS_MANAGE);
            const receipt = await findDocumentMutationReceipt(transaction, identity);
            if (receipt) return receiptDocument(transaction, receipt);
            const document = await lockDocument(transaction, documentId);
            assertMutableDocument(document);
            if (document.version !== input.version) throw documentVersionConflict();
            if (document.status === input.status) {
              await createDocumentMutationReceipt(transaction, {
                ...identity,
                documentId,
              });
              return presentDocument(document);
            }

            const updated = await transaction.companyDocument.update({
              where: { id: documentId },
              data: {
                status: input.status,
                updatedById: actor.id,
                version: { increment: 1 },
              },
              include: documentDetailInclude,
            });
            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.DOCUMENT_STATUS_CHANGED,
                targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT,
                targetId: documentId,
                actorUserId: actor.id,
                requestId,
                metadata: { fromStatus: document.status, toStatus: input.status },
              }),
            );
            await createDocumentMutationReceipt(transaction, {
              ...identity,
              documentId,
            });
            return presentDocument(updated);
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        return mapDatabaseError(error);
      }
    },

    async requestReindex({ actor, documentId, versionId, input, idempotencyKey, requestId }) {
      requireEnabled();
      const operation = DOCUMENT_MUTATION_OPERATIONS.REQUEST_REINDEX;
      const requestHash = documentMutationHash(operation, { documentId, versionId, ...input });
      const identity = receiptIdentity(actor, idempotencyKey, operation, requestHash);
      try {
        return await database.$transaction(
          async (transaction) => {
            await lockDocumentActor(transaction, actor.id, PERMISSIONS.DOCUMENTS_MANAGE);
            const receipt = await findDocumentMutationReceipt(transaction, identity);
            if (receipt) {
              if (!receipt.targetIndexVersion) throw documentStateConflict();
              return {
                job: await receiptJob(transaction, receipt),
                targetIndexVersion: receipt.targetIndexVersion,
              };
            }
            const document = await lockDocument(transaction, documentId);
            assertMutableDocument(document);
            const version = document.versions.find((entry) => entry.id === versionId);
            if (!version) throw documentVersionNotFound();
            if (
              document.status !== DOCUMENT_STATUSES.ACTIVE ||
              document.activeVersionId !== versionId ||
              version.status !== DOCUMENT_VERSION_STATUSES.READY
            ) {
              throw documentStateConflict();
            }
            if (version.version !== input.version) throw documentVersionConflict();
            const targetIndexVersion = version.indexVersion + 1;
            const jobResult = await enqueueJob(transaction, config, {
              type: JOB_TYPES.DOCUMENT_VERSION_REINDEX,
              dedupeKey: `document-reindex:${versionId}:${targetIndexVersion}`,
              payload: { documentVersionId: versionId, indexVersion: targetIndexVersion },
              sourceRequestId: requestId,
              sourceActorUserId: actor.id,
            });
            if (jobResult.created) {
              await appendAudit(
                transaction,
                auditDescriptor({
                  action: AUDIT_ACTIONS.DOCUMENT_REINDEX_REQUESTED,
                  targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT_VERSION,
                  targetId: versionId,
                  actorUserId: actor.id,
                  requestId,
                  metadata: {
                    fromIndexVersion: version.indexVersion,
                    toIndexVersion: targetIndexVersion,
                    jobCreated: true,
                  },
                }),
              );
            }
            await createDocumentMutationReceipt(transaction, {
              ...identity,
              documentId,
              documentVersionId: versionId,
              jobId: jobResult.job.id,
              targetIndexVersion,
            });
            return { job: safeJob(jobResult), targetIndexVersion };
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        return mapDatabaseError(error);
      }
    },

    async requestDelete({ actor, documentId, input, idempotencyKey, requestId }) {
      requireEnabled();
      const operation = DOCUMENT_MUTATION_OPERATIONS.REQUEST_DELETE;
      const requestHash = documentMutationHash(operation, { documentId, ...input });
      const identity = receiptIdentity(actor, idempotencyKey, operation, requestHash);
      try {
        return await database.$transaction(
          async (transaction) => {
            await lockDocumentActor(transaction, actor.id, PERMISSIONS.DOCUMENTS_DELETE);
            const receipt = await findDocumentMutationReceipt(transaction, identity);
            if (receipt) {
              return {
                document: await receiptDocument(transaction, receipt),
                job: await receiptJob(transaction, receipt),
              };
            }
            const document = await lockDocument(transaction, documentId);
            assertMutableDocument(document);
            if (document.version !== input.version) throw documentVersionConflict();
            const versionCount = document.versions.length;
            const updated = await transaction.companyDocument.update({
              where: { id: documentId },
              data: {
                status: DOCUMENT_STATUSES.DELETING,
                activeVersionId: null,
                updatedById: actor.id,
                version: { increment: 1 },
                versions: {
                  updateMany: {
                    where: { status: { not: DOCUMENT_VERSION_STATUSES.DELETED } },
                    data: { status: DOCUMENT_VERSION_STATUSES.DELETING, version: { increment: 1 } },
                  },
                },
              },
              include: documentDetailInclude,
            });
            const jobResult = await enqueueJob(transaction, config, {
              type: JOB_TYPES.DOCUMENT_VERSION_DELETE,
              dedupeKey: `document-delete:${documentId}`,
              payload: { documentId },
              sourceRequestId: requestId,
              sourceActorUserId: actor.id,
            });
            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.DOCUMENT_DELETE_REQUESTED,
                targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT,
                targetId: documentId,
                actorUserId: actor.id,
                requestId,
                metadata: { versionCount, jobCreated: jobResult.created },
              }),
            );
            await createDocumentMutationReceipt(transaction, {
              ...identity,
              documentId,
              jobId: jobResult.job.id,
            });
            return { document: presentDocument(updated), job: safeJob(jobResult) };
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        return mapDatabaseError(error);
      }
    },
  });
}
