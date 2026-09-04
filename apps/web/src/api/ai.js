import { apiRequest } from "./client.js";

export const AI_NOTICE_VERSION = "groq-zdr-v1";

function rangeQuery(range = {}) {
  const query = new URLSearchParams();
  if (range.from) query.set("from", range.from);
  if (range.to) query.set("to", range.to);
  const value = query.toString();
  return value ? `?${value}` : "";
}

export async function getAiConsent(assistant, { signal } = {}) {
  const response = await apiRequest(`/ai/consents/${assistant}`, { signal });
  return response.data.consent;
}

export async function acceptAiConsent(assistant) {
  const response = await apiRequest(`/ai/consents/${assistant}`, {
    method: "PUT",
    body: { noticeVersion: AI_NOTICE_VERSION },
    requiresCsrf: true,
  });
  return response.data.consent;
}

export async function revokeAiConsent(assistant) {
  const response = await apiRequest(`/ai/consents/${assistant}`, {
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
