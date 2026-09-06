import { apiBinaryRequest, apiRequest } from "./client.js";

function queryString(values) {
  const parameters = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      parameters.set(key, String(value));
    }
  });
  const query = parameters.toString();
  return query ? `?${query}` : "";
}

function mutationKey() {
  return globalThis.crypto.randomUUID();
}

export async function listDocuments(filters = {}) {
  const { signal, ...query } = filters;
  const payload = await apiRequest(`/documents${queryString(query)}`, { signal });
  return { documents: payload.data.documents, meta: payload.meta };
}

export async function getDocument(documentId, { signal } = {}) {
  const payload = await apiRequest(`/documents/${documentId}`, { signal });
  return payload.data.document;
}

export async function getDocumentRecovery({ signal } = {}) {
  const payload = await apiRequest("/documents/recovery/orphans", { signal });
  return payload.data.recovery;
}

export async function createDocument(input, idempotencyKey = mutationKey()) {
  const payload = await apiRequest("/documents", {
    method: "POST",
    body: input,
    requiresCsrf: true,
    idempotencyKey,
  });
  return payload.data.document;
}

export async function createDocumentVersion(documentId, input, idempotencyKey = mutationKey()) {
  const payload = await apiRequest(`/documents/${documentId}/versions`, {
    method: "POST",
    body: input,
    requiresCsrf: true,
    idempotencyKey,
  });
  return payload.data.version;
}

export async function uploadDocumentContent(
  documentId,
  versionId,
  bytes,
  mediaType,
  idempotencyKey = mutationKey(),
) {
  const payload = await apiRequest(`/documents/${documentId}/versions/${versionId}/content`, {
    method: "PUT",
    body: bytes,
    rawBody: true,
    contentType: mediaType,
    requiresCsrf: true,
    idempotencyKey,
  });
  return payload.data;
}

export async function updateDocumentStatus(
  documentId,
  status,
  version,
  idempotencyKey = mutationKey(),
) {
  const payload = await apiRequest(`/documents/${documentId}/status`, {
    method: "PATCH",
    body: { status, version },
    requiresCsrf: true,
    idempotencyKey,
  });
  return payload.data.document;
}

export async function requestDocumentReindex(
  documentId,
  versionId,
  version,
  idempotencyKey = mutationKey(),
) {
  const payload = await apiRequest(`/documents/${documentId}/versions/${versionId}/reindex`, {
    method: "POST",
    body: { version },
    requiresCsrf: true,
    idempotencyKey,
  });
  return payload.data;
}

export async function requestDocumentDeletion(documentId, version, idempotencyKey = mutationKey()) {
  const payload = await apiRequest(`/documents/${documentId}`, {
    method: "DELETE",
    body: { version },
    requiresCsrf: true,
    idempotencyKey,
  });
  return payload.data;
}

export function downloadDocumentContent(documentId, versionId, options = {}) {
  return apiBinaryRequest(`/documents/${documentId}/versions/${versionId}/content`, options);
}
