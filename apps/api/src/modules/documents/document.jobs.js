import { createHash, randomUUID } from "node:crypto";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_KINDS,
  AUDIT_OUTCOMES,
  AUDIT_TARGET_TYPES,
} from "../audit/audit.constants.js";
import { createAuditService } from "../audit/audit.service.js";
import { AiInternalClientError } from "../ai/ai.internalClient.js";
import { JOB_ERROR_CODES, JOB_TYPES } from "../jobs/jobs.constants.js";
import { JobExecutionError } from "../jobs/jobs.errors.js";
import {
  DOCUMENT_EMBEDDING_MODEL,
  DOCUMENT_EMBEDDING_MODEL_REVISION,
  DOCUMENT_STATUSES,
  DOCUMENT_VERSION_STATUSES,
} from "./document.constants.js";
import { DocumentContentError, validateAndNormalizeDocumentContent } from "./document.content.js";
import { DOCUMENT_STORAGE_ERROR_CODES, DocumentStorageError } from "./document.storage.js";

const maximumChunksPerVersion = 1000;
const deletedDocumentTitle = "Deleted document";
const deletedFilename = "deleted.txt";
const documentJobTypes = new Set([
  JOB_TYPES.DOCUMENT_VERSION_INGEST,
  JOB_TYPES.DOCUMENT_VERSION_REINDEX,
  JOB_TYPES.DOCUMENT_VERSION_DELETE,
]);
const erasableVersionStatuses = Object.values(DOCUMENT_VERSION_STATUSES).filter(
  (status) => status !== DOCUMENT_VERSION_STATUSES.DELETED,
);

function jobError(code, terminal = false) {
  return new JobExecutionError(code, { terminal });
}

function normalizeDocumentJobError(error) {
  if (error instanceof JobExecutionError) return error;
  if (error instanceof DocumentContentError) {
    return jobError(JOB_ERROR_CODES.DOCUMENT_INTEGRITY_INVALID, true);
  }
  if (error instanceof DocumentStorageError) {
    if (
      [
        DOCUMENT_STORAGE_ERROR_CODES.INVALID_REFERENCE,
        DOCUMENT_STORAGE_ERROR_CODES.NOT_FOUND,
        DOCUMENT_STORAGE_ERROR_CODES.INTEGRITY_FAILURE,
      ].includes(error.code)
    ) {
      return jobError(JOB_ERROR_CODES.DOCUMENT_INTEGRITY_INVALID, true);
    }
    return jobError(JOB_ERROR_CODES.HANDLER_FAILED);
  }
  if (error instanceof AiInternalClientError) {
    if (["AI_SERVICE_INVALID_RESPONSE", "INVALID_INTERNAL_REQUEST"].includes(error.code)) {
      return jobError(JOB_ERROR_CODES.DOCUMENT_INTEGRITY_INVALID, true);
    }
    return jobError(JOB_ERROR_CODES.DOCUMENT_INDEX_UNAVAILABLE);
  }
  return jobError(JOB_ERROR_CODES.HANDLER_FAILED);
}

function isDeleting(document, version) {
  return (
    [DOCUMENT_STATUSES.DELETING, DOCUMENT_STATUSES.DELETED].includes(document.status) ||
    [DOCUMENT_VERSION_STATUSES.DELETING, DOCUMENT_VERSION_STATUSES.DELETED].includes(version.status)
  );
}

function audiencesOf(version) {
  const audiences = version.audiences.map((entry) => entry.audience);
  const normalized = [...new Set(audiences)].sort();
  if (
    normalized.length < 1 ||
    normalized.length > 2 ||
    normalized.some((audience) => !["CUSTOMER", "OWNER"].includes(audience)) ||
    audiences.join("\0") !== normalized.join("\0")
  ) {
    throw jobError(JOB_ERROR_CODES.DOCUMENT_INTEGRITY_INVALID, true);
  }
  return normalized;
}

function assertSourceMetadata(version) {
  if (
    typeof version.storageObjectKey !== "string" ||
    typeof version.storageKeyId !== "string" ||
    typeof version.contentSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(version.contentSha256) ||
    !Number.isInteger(version.normalizedByteLength) ||
    version.normalizedByteLength < 1 ||
    version.normalizedByteLength > 262144
  ) {
    throw jobError(JOB_ERROR_CODES.DOCUMENT_INTEGRITY_INVALID, true);
  }
  audiencesOf(version);
}

function sourceIdentity(version) {
  return Object.freeze({
    documentId: version.documentId,
    documentVersionId: version.id,
    versionNumber: version.versionNumber,
    objectKey: version.storageObjectKey,
    keyId: version.storageKeyId,
    contentSha256: version.contentSha256,
    byteLength: version.normalizedByteLength,
    audiences: audiencesOf(version),
    filename: version.originalFilename,
    mediaType: version.mediaType,
    language: version.language,
  });
}

function sourceStillMatches(version, source) {
  return (
    version.documentId === source.documentId &&
    version.versionNumber === source.versionNumber &&
    version.storageObjectKey === source.objectKey &&
    version.storageKeyId === source.keyId &&
    version.contentSha256 === source.contentSha256 &&
    version.normalizedByteLength === source.byteLength &&
    audiencesOf(version).join("\0") === source.audiences.join("\0")
  );
}

async function lockedVersion(transaction, documentVersionId) {
  const reference = await transaction.companyDocumentVersion.findUnique({
    where: { id: documentVersionId },
    select: { documentId: true },
  });
  if (!reference) return null;
  const rows = await transaction.$queryRaw`
    SELECT id
    FROM company_documents
    WHERE id = ${reference.documentId}
    FOR UPDATE
  `;
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  return transaction.companyDocumentVersion.findUnique({
    where: { id: documentVersionId },
    include: {
      audiences: { select: { audience: true }, orderBy: { audience: "asc" } },
      document: {
        include: {
          activeVersion: {
            select: { id: true, versionNumber: true, status: true, indexVersion: true },
          },
        },
      },
    },
  });
}

function completedVersion(version, indexVersion) {
  return (
    version.indexVersion === indexVersion &&
    [DOCUMENT_VERSION_STATUSES.READY, DOCUMENT_VERSION_STATUSES.SUPERSEDED].includes(version.status)
  );
}

async function claimInitial(database, documentVersionId, indexVersion) {
  return database.$transaction(
    async (transaction) => {
      const version = await lockedVersion(transaction, documentVersionId);
      if (!version) throw jobError(JOB_ERROR_CODES.RESOURCE_NOT_FOUND, true);
      if (isDeleting(version.document, version)) return { kind: "delete" };
      if (completedVersion(version, indexVersion)) return { kind: "complete" };
      if (
        ![DOCUMENT_STATUSES.ACTIVE, DOCUMENT_STATUSES.ARCHIVED].includes(version.document.status)
      ) {
        throw jobError(JOB_ERROR_CODES.DOCUMENT_STATE_INVALID, true);
      }
      if (
        ![
          DOCUMENT_VERSION_STATUSES.QUEUED,
          DOCUMENT_VERSION_STATUSES.PROCESSING,
          DOCUMENT_VERSION_STATUSES.STAGED,
        ].includes(version.status) ||
        version.indexVersion !== indexVersion
      ) {
        throw jobError(JOB_ERROR_CODES.DOCUMENT_STATE_INVALID, true);
      }
      const activeVersion = version.document.activeVersion;
      if (activeVersion && activeVersion.id !== version.id) {
        if (activeVersion.status !== DOCUMENT_VERSION_STATUSES.READY) {
          throw jobError(JOB_ERROR_CODES.DOCUMENT_INTEGRITY_INVALID, true);
        }
        if (activeVersion.versionNumber >= version.versionNumber) {
          throw jobError(JOB_ERROR_CODES.DOCUMENT_STATE_INVALID, true);
        }
      }
      assertSourceMetadata(version);
      if (version.status === DOCUMENT_VERSION_STATUSES.QUEUED) {
        const updated = await transaction.companyDocumentVersion.updateMany({
          where: {
            id: version.id,
            status: DOCUMENT_VERSION_STATUSES.QUEUED,
            version: version.version,
          },
          data: {
            status: DOCUMENT_VERSION_STATUSES.PROCESSING,
            processingStartedAt: new Date(),
            failureCode: null,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw jobError(JOB_ERROR_CODES.DOCUMENT_STATE_INVALID);
      }
      return {
        kind: "work",
        source: sourceIdentity(version),
      };
    },
    { isolationLevel: "Serializable" },
  );
}

async function claimReindex(database, documentVersionId, indexVersion) {
  return database.$transaction(
    async (transaction) => {
      const version = await lockedVersion(transaction, documentVersionId);
      if (!version) throw jobError(JOB_ERROR_CODES.RESOURCE_NOT_FOUND, true);
      if (isDeleting(version.document, version)) return { kind: "delete" };
      if (completedVersion(version, indexVersion)) return { kind: "complete" };
      if (
        ![DOCUMENT_STATUSES.ACTIVE, DOCUMENT_STATUSES.ARCHIVED].includes(version.document.status) ||
        version.document.activeVersionId !== version.id ||
        version.status !== DOCUMENT_VERSION_STATUSES.READY ||
        indexVersion !== version.indexVersion + 1
      ) {
        throw jobError(JOB_ERROR_CODES.DOCUMENT_STATE_INVALID, true);
      }
      assertSourceMetadata(version);
      return {
        kind: "work",
        source: sourceIdentity(version),
        previousIndexVersion: version.indexVersion,
      };
    },
    { isolationLevel: "Serializable" },
  );
}

async function restoreSource(documentStore, config, source) {
  if (!documentStore) throw jobError(JOB_ERROR_CODES.DOCUMENT_INDEX_UNAVAILABLE);
  const restored = await documentStore.read({
    objectKey: source.objectKey,
    documentVersionId: source.documentVersionId,
    expectedSha256: source.contentSha256,
  });
  if (restored.keyId !== source.keyId || restored.plaintext.length !== source.byteLength) {
    throw jobError(JOB_ERROR_CODES.DOCUMENT_INTEGRITY_INVALID, true);
  }
  const normalized = validateAndNormalizeDocumentContent({
    filename: source.filename,
    mediaType: source.mediaType,
    language: source.language,
    rawBytes: restored.plaintext,
    maximumBytes: config.documents.maximumUploadBytes,
  });
  if (
    normalized.byteLength !== source.byteLength ||
    normalized.sha256 !== source.contentSha256 ||
    !normalized.normalizedBytes.equals(restored.plaintext)
  ) {
    throw jobError(JOB_ERROR_CODES.DOCUMENT_INTEGRITY_INVALID, true);
  }
  return normalized.normalizedBytes;
}

function verifyChunkDescriptors(chunks, content) {
  if (chunks.length < 1 || chunks.length > maximumChunksPerVersion) {
    throw jobError(JOB_ERROR_CODES.DOCUMENT_INTEGRITY_INVALID, true);
  }
  let previousStart = -1;
  let previousEnd = -1;
  for (const [ordinal, chunk] of chunks.entries()) {
    if (
      chunk.ordinal !== ordinal ||
      chunk.byteStart <= previousStart ||
      chunk.byteEnd <= previousEnd ||
      chunk.byteEnd > content.length
    ) {
      throw jobError(JOB_ERROR_CODES.DOCUMENT_INTEGRITY_INVALID, true);
    }
    const bytes = content.subarray(chunk.byteStart, chunk.byteEnd);
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw jobError(JOB_ERROR_CODES.DOCUMENT_INTEGRITY_INVALID, true);
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (!text.trim() || digest !== chunk.contentSha256) {
      throw jobError(JOB_ERROR_CODES.DOCUMENT_INTEGRITY_INVALID, true);
    }
    previousStart = chunk.byteStart;
    previousEnd = chunk.byteEnd;
  }
}

function indexRequest(source, indexVersion, content) {
  return {
    contractVersion: 1,
    documentVersionId: source.documentVersionId,
    indexVersion,
    contentSha256: source.contentSha256,
    audiences: source.audiences,
    embeddingModel: DOCUMENT_EMBEDDING_MODEL,
    embeddingModelRevision: DOCUMENT_EMBEDDING_MODEL_REVISION,
    content: content.toString("utf8"),
  };
}

function descriptorsMatch(rows, descriptors) {
  return (
    rows.length === descriptors.length &&
    rows.every((row, index) => {
      const descriptor = descriptors[index];
      return (
        row.pointId === descriptor.pointId &&
        row.ordinal === descriptor.ordinal &&
        row.byteStart === descriptor.byteStart &&
        row.byteEnd === descriptor.byteEnd &&
        row.contentSha256 === descriptor.contentSha256
      );
    })
  );
}

async function ensureChunkDescriptors(transaction, documentVersionId, indexVersion, descriptors) {
  const existing = await transaction.companyDocumentChunk.findMany({
    where: { documentVersionId, indexVersion },
    orderBy: { ordinal: "asc" },
  });
  if (existing.length > 0) {
    if (!descriptorsMatch(existing, descriptors)) {
      throw jobError(JOB_ERROR_CODES.DOCUMENT_INTEGRITY_INVALID, true);
    }
    return;
  }
  await transaction.companyDocumentChunk.createMany({
    data: descriptors.map((descriptor) => ({
      id: randomUUID(),
      documentVersionId,
      indexVersion,
      pointId: descriptor.pointId,
      ordinal: descriptor.ordinal,
      byteStart: descriptor.byteStart,
      byteEnd: descriptor.byteEnd,
      contentSha256: descriptor.contentSha256,
    })),
  });
}

function evidenceMatches(version, result, indexVersion) {
  return (
    version.indexVersion === indexVersion &&
    version.embeddingModel === result.embeddingModel &&
    version.embeddingModelRevision === result.embeddingModelRevision &&
    version.embeddingDimension === result.embeddingDimension &&
    version.vectorCollection === result.vectorCollection &&
    version.chunkCount === result.chunks.length
  );
}

async function stageInitial(database, source, indexVersion, result) {
  return database.$transaction(
    async (transaction) => {
      const version = await lockedVersion(transaction, source.documentVersionId);
      if (!version) throw jobError(JOB_ERROR_CODES.RESOURCE_NOT_FOUND, true);
      if (isDeleting(version.document, version)) return { kind: "delete" };
      if (completedVersion(version, indexVersion)) return { kind: "complete" };
      if (
        !sourceStillMatches(version, source) ||
        version.indexVersion !== indexVersion ||
        ![DOCUMENT_VERSION_STATUSES.PROCESSING, DOCUMENT_VERSION_STATUSES.STAGED].includes(
          version.status,
        )
      ) {
        throw jobError(JOB_ERROR_CODES.DOCUMENT_STATE_INVALID, true);
      }
      await ensureChunkDescriptors(transaction, version.id, indexVersion, result.chunks);
      if (version.status === DOCUMENT_VERSION_STATUSES.PROCESSING) {
        await transaction.companyDocumentVersion.update({
          where: { id: version.id },
          data: {
            status: DOCUMENT_VERSION_STATUSES.STAGED,
            embeddingModel: result.embeddingModel,
            embeddingModelRevision: result.embeddingModelRevision,
            embeddingDimension: result.embeddingDimension,
            vectorCollection: result.vectorCollection,
            chunkCount: result.chunks.length,
            version: { increment: 1 },
          },
        });
      } else if (!evidenceMatches(version, result, indexVersion)) {
        throw jobError(JOB_ERROR_CODES.DOCUMENT_INTEGRITY_INVALID, true);
      }
      return {
        kind: "staged",
        expectedActiveVersionId: version.document.activeVersionId,
        activeVersion: version.document.activeVersion,
      };
    },
    { isolationLevel: "Serializable" },
  );
}

async function stageReindex(database, source, previousIndexVersion, indexVersion, result) {
  return database.$transaction(
    async (transaction) => {
      const version = await lockedVersion(transaction, source.documentVersionId);
      if (!version) throw jobError(JOB_ERROR_CODES.RESOURCE_NOT_FOUND, true);
      if (isDeleting(version.document, version)) return { kind: "delete" };
      if (completedVersion(version, indexVersion)) return { kind: "complete" };
      if (
        !sourceStillMatches(version, source) ||
        version.document.activeVersionId !== version.id ||
        version.status !== DOCUMENT_VERSION_STATUSES.READY ||
        version.indexVersion !== previousIndexVersion ||
        indexVersion !== previousIndexVersion + 1
      ) {
        throw jobError(JOB_ERROR_CODES.DOCUMENT_STATE_INVALID, true);
      }
      await ensureChunkDescriptors(transaction, version.id, indexVersion, result.chunks);
      return { kind: "staged" };
    },
    { isolationLevel: "Serializable" },
  );
}

function systemAuditDescriptor({ action, outcome, targetType, targetId, requestId, metadata }) {
  return {
    action,
    outcome,
    actorKind: AUDIT_ACTOR_KINDS.SYSTEM,
    actorUserId: null,
    targetType,
    targetId,
    requestId: requestId ?? null,
    metadata,
  };
}

async function finalizeInitial(database, appendAudit, job, source, indexVersion, result, staged) {
  return database.$transaction(
    async (transaction) => {
      const version = await lockedVersion(transaction, source.documentVersionId);
      if (!version) throw jobError(JOB_ERROR_CODES.RESOURCE_NOT_FOUND, true);
      if (isDeleting(version.document, version)) return { kind: "delete" };
      if (
        version.document.activeVersionId === version.id &&
        version.status === DOCUMENT_VERSION_STATUSES.READY &&
        evidenceMatches(version, result, indexVersion)
      ) {
        return { kind: "complete" };
      }
      if (version.document.activeVersionId !== staged.expectedActiveVersionId) {
        const currentActive = version.document.activeVersion;
        if (currentActive && currentActive.versionNumber < version.versionNumber) {
          return { kind: "retry" };
        }
        return { kind: "stale" };
      }
      if (
        version.status !== DOCUMENT_VERSION_STATUSES.STAGED ||
        !sourceStillMatches(version, source) ||
        !evidenceMatches(version, result, indexVersion)
      ) {
        throw jobError(JOB_ERROR_CODES.DOCUMENT_INTEGRITY_INVALID, true);
      }
      const chunks = await transaction.companyDocumentChunk.findMany({
        where: { documentVersionId: version.id, indexVersion },
        orderBy: { ordinal: "asc" },
      });
      if (!descriptorsMatch(chunks, result.chunks)) {
        throw jobError(JOB_ERROR_CODES.DOCUMENT_INTEGRITY_INVALID, true);
      }
      const readyAt = new Date();
      await transaction.companyDocumentVersion.update({
        where: { id: version.id },
        data: {
          status: DOCUMENT_VERSION_STATUSES.READY,
          readyAt,
          failureCode: null,
          version: { increment: 1 },
        },
      });
      await transaction.companyDocument.update({
        where: { id: version.documentId },
        data: { activeVersionId: version.id, version: { increment: 1 } },
      });
      if (staged.activeVersion && staged.activeVersion.id !== version.id) {
        const superseded = await transaction.companyDocumentVersion.updateMany({
          where: {
            id: staged.activeVersion.id,
            status: DOCUMENT_VERSION_STATUSES.READY,
            indexVersion: staged.activeVersion.indexVersion,
          },
          data: {
            status: DOCUMENT_VERSION_STATUSES.SUPERSEDED,
            supersededAt: readyAt,
            version: { increment: 1 },
          },
        });
        if (superseded.count !== 1) {
          throw jobError(JOB_ERROR_CODES.DOCUMENT_INTEGRITY_INVALID, true);
        }
      }
      await appendAudit(
        transaction,
        systemAuditDescriptor({
          action: AUDIT_ACTIONS.DOCUMENT_INGESTION_COMPLETED,
          outcome: AUDIT_OUTCOMES.SUCCESS,
          targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT_VERSION,
          targetId: version.id,
          requestId: job.sourceRequestId,
          metadata: { indexVersion, chunkCount: result.chunks.length },
        }),
      );
      return { kind: "complete" };
    },
    { isolationLevel: "Serializable" },
  );
}

async function finalizeReindex(database, appendAudit, job, source, indexVersion, result) {
  return database.$transaction(
    async (transaction) => {
      const version = await lockedVersion(transaction, source.documentVersionId);
      if (!version) throw jobError(JOB_ERROR_CODES.RESOURCE_NOT_FOUND, true);
      if (isDeleting(version.document, version)) return { kind: "delete" };
      if (completedVersion(version, indexVersion)) return { kind: "complete" };
      if (
        version.document.activeVersionId !== version.id ||
        version.status !== DOCUMENT_VERSION_STATUSES.READY ||
        version.indexVersion + 1 !== indexVersion ||
        !sourceStillMatches(version, source)
      ) {
        return { kind: "stale" };
      }
      const chunks = await transaction.companyDocumentChunk.findMany({
        where: { documentVersionId: version.id, indexVersion },
        orderBy: { ordinal: "asc" },
      });
      if (!descriptorsMatch(chunks, result.chunks)) {
        throw jobError(JOB_ERROR_CODES.DOCUMENT_INTEGRITY_INVALID, true);
      }
      await transaction.companyDocumentVersion.update({
        where: { id: version.id },
        data: {
          embeddingModel: result.embeddingModel,
          embeddingModelRevision: result.embeddingModelRevision,
          embeddingDimension: result.embeddingDimension,
          vectorCollection: result.vectorCollection,
          indexVersion,
          chunkCount: result.chunks.length,
          failureCode: null,
          version: { increment: 1 },
        },
      });
      await appendAudit(
        transaction,
        systemAuditDescriptor({
          action: AUDIT_ACTIONS.DOCUMENT_INGESTION_COMPLETED,
          outcome: AUDIT_OUTCOMES.SUCCESS,
          targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT_VERSION,
          targetId: version.id,
          requestId: job.sourceRequestId,
          metadata: { indexVersion, chunkCount: result.chunks.length },
        }),
      );
      return { kind: "complete" };
    },
    { isolationLevel: "Serializable" },
  );
}

async function recordFailedIngestion(database, appendAudit, job, error, preserveReadyVersion) {
  if (!error.terminal) return;
  await database.$transaction(
    async (transaction) => {
      const version = await lockedVersion(transaction, job.payload.documentVersionId);
      if (!version || isDeleting(version.document, version)) return;
      if (
        !preserveReadyVersion &&
        [
          DOCUMENT_VERSION_STATUSES.QUEUED,
          DOCUMENT_VERSION_STATUSES.PROCESSING,
          DOCUMENT_VERSION_STATUSES.STAGED,
        ].includes(version.status)
      ) {
        await transaction.companyDocumentVersion.update({
          where: { id: version.id },
          data: {
            status: DOCUMENT_VERSION_STATUSES.FAILED,
            failureCode: error.code,
            version: { increment: 1 },
          },
        });
      } else if (preserveReadyVersion && version.status !== DOCUMENT_VERSION_STATUSES.READY) {
        return;
      } else if (!preserveReadyVersion) {
        return;
      }
      await appendAudit(
        transaction,
        systemAuditDescriptor({
          action: AUDIT_ACTIONS.DOCUMENT_INGESTION_FAILED,
          outcome: AUDIT_OUTCOMES.FAILURE,
          targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT_VERSION,
          targetId: version.id,
          requestId: job.sourceRequestId,
          metadata: { indexVersion: job.payload.indexVersion, safeErrorCode: error.code },
        }),
      );
    },
    { isolationLevel: "Serializable" },
  );
}

async function callPublication(
  aiClient,
  requestIdFactory,
  documentVersionId,
  indexVersion,
  published,
) {
  if (!aiClient) throw jobError(JOB_ERROR_CODES.DOCUMENT_INDEX_UNAVAILABLE);
  return aiClient.setDocumentPublication(
    { contractVersion: 1, documentVersionId, indexVersion, published },
    requestIdFactory(),
  );
}

async function deleteVectors(aiClient, requestIdFactory, documentVersionId) {
  if (!aiClient) throw jobError(JOB_ERROR_CODES.DOCUMENT_INDEX_UNAVAILABLE);
  return aiClient.deleteDocumentVectors(
    { contractVersion: 1, documentVersionId },
    requestIdFactory(),
  );
}

async function cleanupPublication(
  aiClient,
  requestIdFactory,
  documentVersionId,
  indexVersion,
  deleteAll,
) {
  if (deleteAll) return deleteVectors(aiClient, requestIdFactory, documentVersionId);
  return callPublication(aiClient, requestIdFactory, documentVersionId, indexVersion, false);
}

async function processIngest(
  { database, config, documentStore, aiClient, appendAudit, requestIdFactory },
  job,
) {
  try {
    const claimed = await claimInitial(
      database,
      job.payload.documentVersionId,
      job.payload.indexVersion,
    );
    if (claimed.kind === "complete") return { alreadyComplete: true };
    if (claimed.kind === "delete") {
      await deleteVectors(aiClient, requestIdFactory, job.payload.documentVersionId);
      return { cancelledByDeletion: true };
    }
    const content = await restoreSource(documentStore, config, claimed.source);
    if (!aiClient) throw jobError(JOB_ERROR_CODES.DOCUMENT_INDEX_UNAVAILABLE);
    const result = await aiClient.indexDocument(
      indexRequest(claimed.source, job.payload.indexVersion, content),
      requestIdFactory(),
    );
    verifyChunkDescriptors(result.chunks, content);
    const staged = await stageInitial(database, claimed.source, job.payload.indexVersion, result);
    if (staged.kind === "complete") return { alreadyComplete: true };
    if (staged.kind === "delete") {
      await deleteVectors(aiClient, requestIdFactory, job.payload.documentVersionId);
      return { cancelledByDeletion: true };
    }
    if (staged.activeVersion) {
      await callPublication(
        aiClient,
        requestIdFactory,
        staged.activeVersion.id,
        staged.activeVersion.indexVersion,
        false,
      );
    }
    await callPublication(
      aiClient,
      requestIdFactory,
      job.payload.documentVersionId,
      job.payload.indexVersion,
      true,
    );
    let finalized;
    try {
      finalized = await finalizeInitial(
        database,
        appendAudit,
        job,
        claimed.source,
        job.payload.indexVersion,
        result,
        staged,
      );
    } catch (error) {
      await cleanupPublication(
        aiClient,
        requestIdFactory,
        job.payload.documentVersionId,
        job.payload.indexVersion,
        false,
      );
      throw error;
    }
    if (finalized.kind === "delete") {
      await cleanupPublication(
        aiClient,
        requestIdFactory,
        job.payload.documentVersionId,
        job.payload.indexVersion,
        true,
      );
      return { cancelledByDeletion: true };
    }
    if (["retry", "stale"].includes(finalized.kind)) {
      await cleanupPublication(
        aiClient,
        requestIdFactory,
        job.payload.documentVersionId,
        job.payload.indexVersion,
        false,
      );
      throw jobError(JOB_ERROR_CODES.DOCUMENT_STATE_INVALID, finalized.kind === "stale");
    }
    return { indexedChunks: result.chunks.length };
  } catch (rawError) {
    const error = normalizeDocumentJobError(rawError);
    await recordFailedIngestion(database, appendAudit, job, error, false);
    throw error;
  }
}

async function processReindex(
  { database, config, documentStore, aiClient, appendAudit, requestIdFactory },
  job,
) {
  try {
    const claimed = await claimReindex(
      database,
      job.payload.documentVersionId,
      job.payload.indexVersion,
    );
    if (claimed.kind === "complete") return { alreadyComplete: true };
    if (claimed.kind === "delete") {
      await deleteVectors(aiClient, requestIdFactory, job.payload.documentVersionId);
      return { cancelledByDeletion: true };
    }
    const content = await restoreSource(documentStore, config, claimed.source);
    if (!aiClient) throw jobError(JOB_ERROR_CODES.DOCUMENT_INDEX_UNAVAILABLE);
    const result = await aiClient.indexDocument(
      indexRequest(claimed.source, job.payload.indexVersion, content),
      requestIdFactory(),
    );
    verifyChunkDescriptors(result.chunks, content);
    const staged = await stageReindex(
      database,
      claimed.source,
      claimed.previousIndexVersion,
      job.payload.indexVersion,
      result,
    );
    if (staged.kind === "complete") return { alreadyComplete: true };
    if (staged.kind === "delete") {
      await deleteVectors(aiClient, requestIdFactory, job.payload.documentVersionId);
      return { cancelledByDeletion: true };
    }
    await callPublication(
      aiClient,
      requestIdFactory,
      job.payload.documentVersionId,
      claimed.previousIndexVersion,
      false,
    );
    await callPublication(
      aiClient,
      requestIdFactory,
      job.payload.documentVersionId,
      job.payload.indexVersion,
      true,
    );
    let finalized;
    try {
      finalized = await finalizeReindex(
        database,
        appendAudit,
        job,
        claimed.source,
        job.payload.indexVersion,
        result,
      );
    } catch (error) {
      await cleanupPublication(
        aiClient,
        requestIdFactory,
        job.payload.documentVersionId,
        job.payload.indexVersion,
        false,
      );
      throw error;
    }
    if (finalized.kind === "delete") {
      await cleanupPublication(
        aiClient,
        requestIdFactory,
        job.payload.documentVersionId,
        job.payload.indexVersion,
        true,
      );
      return { cancelledByDeletion: true };
    }
    if (finalized.kind === "stale") {
      await cleanupPublication(
        aiClient,
        requestIdFactory,
        job.payload.documentVersionId,
        job.payload.indexVersion,
        false,
      );
      throw jobError(JOB_ERROR_CODES.DOCUMENT_STATE_INVALID, true);
    }
    return { indexedChunks: result.chunks.length };
  } catch (rawError) {
    const error = normalizeDocumentJobError(rawError);
    await recordFailedIngestion(database, appendAudit, job, error, true);
    throw error;
  }
}

async function processInBatches(values, operation, batchSize = 4) {
  for (let index = 0; index < values.length; index += batchSize) {
    await Promise.all(values.slice(index, index + batchSize).map(operation));
  }
}

async function processDelete(
  { database, documentStore, aiClient, appendAudit, requestIdFactory },
  job,
) {
  try {
    const document = await database.companyDocument.findUnique({
      where: { id: job.payload.documentId },
      include: { versions: { orderBy: { versionNumber: "asc" } } },
    });
    if (!document) throw jobError(JOB_ERROR_CODES.RESOURCE_NOT_FOUND, true);
    if (document.status === DOCUMENT_STATUSES.DELETED) return { alreadyComplete: true };
    if (document.status !== DOCUMENT_STATUSES.DELETING) {
      throw jobError(JOB_ERROR_CODES.DOCUMENT_STATE_INVALID, true);
    }
    if (!documentStore || !aiClient) {
      throw jobError(JOB_ERROR_CODES.DOCUMENT_INDEX_UNAVAILABLE);
    }
    await processInBatches(document.versions, (version) =>
      deleteVectors(aiClient, requestIdFactory, version.id),
    );
    await processInBatches(
      document.versions.filter((version) => version.storageObjectKey),
      (version) => documentStore.delete(version.storageObjectKey),
    );

    return await database.$transaction(
      async (transaction) => {
        const rows = await transaction.$queryRaw`
          SELECT id
          FROM company_documents
          WHERE id = ${document.id}
          FOR UPDATE
        `;
        if (!Array.isArray(rows) || rows.length !== 1) {
          throw jobError(JOB_ERROR_CODES.RESOURCE_NOT_FOUND, true);
        }
        const current = await transaction.companyDocument.findUnique({
          where: { id: document.id },
          include: { versions: { orderBy: { versionNumber: "asc" } } },
        });
        if (current.status === DOCUMENT_STATUSES.DELETED) return { alreadyComplete: true };
        if (current.status !== DOCUMENT_STATUSES.DELETING) {
          throw jobError(JOB_ERROR_CODES.DOCUMENT_STATE_INVALID, true);
        }
        const versionIds = current.versions.map((version) => version.id);
        await transaction.companyDocumentChunk.deleteMany({
          where: { documentVersionId: { in: versionIds } },
        });
        await transaction.companyDocumentVersionAudience.deleteMany({
          where: { documentVersionId: { in: versionIds } },
        });
        await transaction.companyDocumentVersion.updateMany({
          where: {
            id: { in: versionIds },
            status: { in: erasableVersionStatuses },
          },
          data: {
            status: DOCUMENT_VERSION_STATUSES.DELETED,
            originalFilename: deletedFilename,
            mediaType: "text/plain",
            language: "en",
            normalizedByteLength: null,
            contentSha256: null,
            storageObjectKey: null,
            storageKeyId: null,
            embeddingModel: null,
            embeddingModelRevision: null,
            embeddingDimension: null,
            vectorCollection: null,
            chunkCount: null,
            failureCode: null,
            deletedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await transaction.companyDocument.update({
          where: { id: current.id },
          data: {
            title: deletedDocumentTitle,
            status: DOCUMENT_STATUSES.DELETED,
            activeVersionId: null,
            deletedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await appendAudit(
          transaction,
          systemAuditDescriptor({
            action: AUDIT_ACTIONS.DOCUMENT_DELETION_COMPLETED,
            outcome: AUDIT_OUTCOMES.SUCCESS,
            targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT,
            targetId: current.id,
            requestId: job.sourceRequestId,
            metadata: { deletedVersionCount: current.versions.length },
          }),
        );
        return { deletedVersions: current.versions.length };
      },
      { isolationLevel: "Serializable" },
    );
  } catch (rawError) {
    throw normalizeDocumentJobError(rawError);
  }
}

export function createDocumentJobHandler(database, config, dependencies = {}) {
  const context = Object.freeze({
    database,
    config,
    documentStore: dependencies.documentStore ?? null,
    aiClient: dependencies.aiClient ?? null,
    appendAudit: createAuditService(database, config).append,
    requestIdFactory: dependencies.requestIdFactory ?? randomUUID,
  });

  return Object.freeze({
    handles(type) {
      return documentJobTypes.has(type);
    },
    async execute(job) {
      if (job.type === JOB_TYPES.DOCUMENT_VERSION_INGEST) return processIngest(context, job);
      if (job.type === JOB_TYPES.DOCUMENT_VERSION_REINDEX) return processReindex(context, job);
      if (job.type === JOB_TYPES.DOCUMENT_VERSION_DELETE) return processDelete(context, job);
      throw jobError(JOB_ERROR_CODES.HANDLER_NOT_REGISTERED, true);
    },
  });
}
