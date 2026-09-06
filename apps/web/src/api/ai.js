import { apiRequest } from "./client.js";

export const AI_NOTICE_VERSION = "groq-zdr-v1";
export const AI_DOCUMENT_NOTICE_VERSION = "groq-zdr-documents-v1";

function rangeQuery(range = {}) {
  const query = new URLSearchParams();
  if (range.from) query.set("from", range.from);
  if (range.to) query.set("to", range.to);
  const value = query.toString();
  return value ? `?${value}` : "";
}

function consentPath(assistant, documents) {
  return `/ai/${documents ? "document-consents" : "consents"}/${assistant}`;
}

export async function getAiConsent(assistant, { signal, documents = false } = {}) {
  const response = await apiRequest(consentPath(assistant, documents), { signal });
  return response.data.consent;
}

export async function acceptAiConsent(assistant, { documents = false } = {}) {
  const response = await apiRequest(consentPath(assistant, documents), {
    method: "PUT",
    body: { noticeVersion: documents ? AI_DOCUMENT_NOTICE_VERSION : AI_NOTICE_VERSION },
    requiresCsrf: true,
  });
  return response.data.consent;
}

export async function revokeAiConsent(assistant, { documents = false } = {}) {
  const response = await apiRequest(consentPath(assistant, documents), {
    method: "DELETE",
    requiresCsrf: true,
  });
  return response.data.consent;
}

export async function requestCustomerAi(question, idempotencyKey) {
  const response = await apiRequest("/ai/customer/responses", {
    method: "POST",
    body: { question },
    idempotencyKey,
    requiresCsrf: true,
  });
  return response.data.response;
}

export async function requestDocumentAi(assistant, question, idempotencyKey) {
  const response = await apiRequest(`/ai/${assistant}/document-responses`, {
    method: "POST",
    body: { question },
    idempotencyKey,
    requiresCsrf: true,
  });
  return response.data.response;
}

export async function getAiDocumentCitation(citationId, { signal } = {}) {
  const response = await apiRequest(`/ai/document-citations/${citationId}`, { signal });
  return response.data.citation;
}

export async function requestOwnerOverviewAi({ question, range, idempotencyKey }) {
  const response = await apiRequest("/ai/owner/overview-responses", {
    method: "POST",
    body: { question, range },
    idempotencyKey,
    requiresCsrf: true,
  });
  return response.data;
}

export async function getAiUsage(range = {}, { signal } = {}) {
  const response = await apiRequest(`/ai/usage${rangeQuery(range)}`, { signal });
  return response.data.usage;
}
