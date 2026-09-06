import { createHash, randomUUID } from "node:crypto";
import { validateAndNormalizeDocumentContent } from "./document.content.js";
import {
  DOCUMENT_AUDIENCES,
  DOCUMENT_CONTEXT_MAX_BYTES,
  DOCUMENT_CONTEXT_MAX_CHUNKS,
  DOCUMENT_CONTEXT_MAX_ESTIMATED_TOKENS,
  DOCUMENT_RETRIEVAL_CANDIDATES,
  DOCUMENT_RETRIEVAL_MINIMUM_SCORE,
  DOCUMENT_STATUSES,
  DOCUMENT_VERSION_STATUSES,
} from "./document.constants.js";

export class DocumentRetrievalError extends Error {
  constructor(code = "DOCUMENT_CONTEXT_UNAVAILABLE") {
    super("The authorized document context could not be prepared");
    this.name = "DocumentRetrievalError";
    this.code = code;
  }
}

function retrievalError(code) {
  return new DocumentRetrievalError(code);
}

function allowedAudiences(assistant) {
  if (assistant === "CUSTOMER") return [DOCUMENT_AUDIENCES.CUSTOMER];
  if (assistant === "OWNER") {
    return [DOCUMENT_AUDIENCES.CUSTOMER, DOCUMENT_AUDIENCES.OWNER];
  }
  throw retrievalError("DOCUMENT_AUDIENCE_INVALID");
}

function audienceEligible(version, assistant) {
  const audiences = new Set(version.audiences.map((entry) => entry.audience));
  if (assistant === "CUSTOMER") return audiences.has(DOCUMENT_AUDIENCES.CUSTOMER);
  return (
    assistant === "OWNER" &&
    (audiences.has(DOCUMENT_AUDIENCES.CUSTOMER) || audiences.has(DOCUMENT_AUDIENCES.OWNER))
  );
}

function rowEligible(row, assistant) {
  const version = row.documentVersion;
  return (
    row.indexVersion === version.indexVersion &&
    version.status === DOCUMENT_VERSION_STATUSES.READY &&
    version.document.status === DOCUMENT_STATUSES.ACTIVE &&
    version.document.activeVersionId === version.id &&
    audienceEligible(version, assistant)
  );
}

const retrievalInclude = Object.freeze({
  documentVersion: {
    include: {
      audiences: { select: { audience: true }, orderBy: { audience: "asc" } },
      document: { select: { id: true, title: true, status: true, activeVersionId: true } },
    },
  },
});

async function loadCandidateRows(database, pointIds) {
  if (pointIds.length === 0) return [];
  return database.companyDocumentChunk.findMany({
    where: { pointId: { in: pointIds } },
    include: retrievalInclude,
  });
}

function selectAuthorizedRows(candidates, rows, assistant, minimumScore) {
  const byPointId = new Map(rows.map((row) => [row.pointId, row]));
  const selected = [];
  let selectedBytes = 0;
  let estimatedTokens = 0;
  for (const candidate of candidates) {
    if (candidate.score < minimumScore) continue;
    const row = byPointId.get(candidate.pointId);
    if (!row) continue;
    if (
      row.documentVersionId !== candidate.documentVersionId ||
      row.indexVersion !== candidate.indexVersion
    ) {
      throw retrievalError("DOCUMENT_CANDIDATE_INTEGRITY_INVALID");
    }
    if (!rowEligible(row, assistant)) continue;
    const byteLength = row.byteEnd - row.byteStart;
    const nextEstimatedTokens = Math.ceil(byteLength / 4);
    if (
      selected.length >= DOCUMENT_CONTEXT_MAX_CHUNKS ||
      selectedBytes + byteLength > DOCUMENT_CONTEXT_MAX_BYTES ||
      estimatedTokens + nextEstimatedTokens > DOCUMENT_CONTEXT_MAX_ESTIMATED_TOKENS
    ) {
      continue;
    }
    selected.push(row);
    selectedBytes += byteLength;
    estimatedTokens += nextEstimatedTokens;
  }
  return selected;
}

async function restoreVersion(documentStore, config, version) {
  if (
    !documentStore ||
    !version.storageObjectKey ||
    !version.storageKeyId ||
    !version.contentSha256 ||
    !version.normalizedByteLength
  ) {
    throw retrievalError();
  }
  let restored;
  try {
    restored = await documentStore.read({
      objectKey: version.storageObjectKey,
      documentVersionId: version.id,
      expectedSha256: version.contentSha256,
    });
  } catch {
    throw retrievalError("DOCUMENT_CONTENT_INTEGRITY_INVALID");
  }
  if (
    restored.keyId !== version.storageKeyId ||
    restored.plaintext.length !== version.normalizedByteLength
  ) {
    throw retrievalError("DOCUMENT_CONTENT_INTEGRITY_INVALID");
  }
  let normalized;
  try {
    normalized = validateAndNormalizeDocumentContent({
      filename: version.originalFilename,
      mediaType: version.mediaType,
      language: version.language,
      rawBytes: restored.plaintext,
      maximumBytes: config.documents.maximumUploadBytes,
    });
  } catch {
    throw retrievalError("DOCUMENT_CONTENT_INTEGRITY_INVALID");
  }
  if (
    normalized.sha256 !== version.contentSha256 ||
    normalized.byteLength !== version.normalizedByteLength ||
    !normalized.normalizedBytes.equals(restored.plaintext)
  ) {
    throw retrievalError("DOCUMENT_CONTENT_INTEGRITY_INVALID");
  }
  return normalized.normalizedBytes;
}

function extractExcerpt(content, row) {
  if (row.byteStart < 0 || row.byteEnd <= row.byteStart || row.byteEnd > content.length) {
    throw retrievalError("DOCUMENT_CHUNK_INTEGRITY_INVALID");
  }
  const bytes = content.subarray(row.byteStart, row.byteEnd);
  if (createHash("sha256").update(bytes).digest("hex") !== row.contentSha256) {
    throw retrievalError("DOCUMENT_CHUNK_INTEGRITY_INVALID");
  }
  let excerpt;
  try {
    excerpt = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw retrievalError("DOCUMENT_CHUNK_INTEGRITY_INVALID");
  }
  if (!excerpt.trim() || excerpt !== excerpt.trim() || excerpt.normalize("NFC") !== excerpt) {
    throw retrievalError("DOCUMENT_CHUNK_INTEGRITY_INVALID");
  }
  return excerpt;
}

async function materializeSources(documentStore, config, rows) {
  const contents = new Map();
  const sources = [];
  for (const [index, row] of rows.entries()) {
    let content = contents.get(row.documentVersionId);
    if (!content) {
      content = await restoreVersion(documentStore, config, row.documentVersion);
      contents.set(row.documentVersionId, content);
    }
    sources.push(
      Object.freeze({
        label: `S${index + 1}`,
        pointId: row.pointId,
        chunkId: row.id,
        documentId: row.documentVersion.document.id,
        documentVersionId: row.documentVersionId,
        versionNumber: row.documentVersion.versionNumber,
        indexVersion: row.indexVersion,
        byteStart: row.byteStart,
        byteEnd: row.byteEnd,
        contentSha256: row.contentSha256,
        title: row.documentVersion.document.title,
        excerpt: extractExcerpt(content, row),
      }),
    );
  }
  return sources;
}

function sourceMatchesRow(source, row, assistant) {
  return (
    rowEligible(row, assistant) &&
    source.pointId === row.pointId &&
    source.chunkId === row.id &&
    source.documentId === row.documentVersion.document.id &&
    source.documentVersionId === row.documentVersionId &&
    source.versionNumber === row.documentVersion.versionNumber &&
    source.indexVersion === row.indexVersion &&
    source.byteStart === row.byteStart &&
    source.byteEnd === row.byteEnd &&
    source.contentSha256 === row.contentSha256
  );
}

export function createDocumentRetrievalService(
  database,
  config,
  documentStore,
  aiClient,
  dependencies = {},
) {
  const minimumScore = dependencies.minimumScore ?? DOCUMENT_RETRIEVAL_MINIMUM_SCORE;
  const requestIdFactory = dependencies.requestIdFactory ?? randomUUID;
  if (!Number.isFinite(minimumScore) || minimumScore < -1 || minimumScore > 1) {
    throw retrievalError("DOCUMENT_SCORE_THRESHOLD_INVALID");
  }

  async function reauthorize(transaction, sources, assistant) {
    if (sources.length === 0) return [];
    const rows = await transaction.companyDocumentChunk.findMany({
      where: { id: { in: sources.map((source) => source.chunkId) } },
      include: retrievalInclude,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const authorized = [];
    for (const source of sources) {
      const row = byId.get(source.chunkId);
      if (!row || !sourceMatchesRow(source, row, assistant)) return null;
      authorized.push({
        ...source,
        title: row.documentVersion.document.title,
      });
    }
    return authorized;
  }

  return Object.freeze({
    async retrieve({ assistant, question }) {
      if (!config.documents?.enabled || !documentStore || !aiClient) throw retrievalError();
      const audiences = allowedAudiences(assistant);
      const result = await aiClient.documentCandidates(
        {
          contractVersion: 1,
          assistant,
          audiences,
          question,
          limit: DOCUMENT_RETRIEVAL_CANDIDATES,
        },
        requestIdFactory(),
      );
      const rows = await loadCandidateRows(
        database,
        result.candidates.map((candidate) => candidate.pointId),
      );
      const selected = selectAuthorizedRows(result.candidates, rows, assistant, minimumScore);
      const sources = await materializeSources(documentStore, config, selected);
      const authorized = await reauthorize(database, sources, assistant);
      if (!authorized) throw retrievalError("DOCUMENT_AUTHORIZATION_CHANGED");
      return Object.freeze({
        internalContext: {
          sources: sources.map((source) => ({ label: source.label, excerpt: source.excerpt })),
        },
        sources,
      });
    },

    reauthorize,

    async citationSource({ userId, citationId }) {
      const citation = await database.aiDocumentCitation.findUnique({
        where: { id: citationId },
        include: {
          usageEvent: {
            select: { userId: true, assistant: true, intent: true, status: true },
          },
        },
      });
      if (
        !citation ||
        citation.usageEvent.userId !== userId ||
        citation.usageEvent.status !== "SUCCEEDED" ||
        !["CUSTOMER_DOCUMENT_QA", "OWNER_DOCUMENT_QA"].includes(citation.usageEvent.intent)
      ) {
        return null;
      }
      const row = await database.companyDocumentChunk.findFirst({
        where: {
          id: citation.chunkId,
          documentVersionId: citation.documentVersionId,
        },
        include: retrievalInclude,
      });
      if (!row || !rowEligible(row, citation.usageEvent.assistant)) return null;
      const [source] = await materializeSources(documentStore, config, [row]);
      return {
        citationId: citation.id,
        assistant: citation.usageEvent.assistant,
        source: { ...source, label: citation.sourceLabel },
      };
    },
  });
}
