import { apiRequest } from "./client.js";

export const AI_WORKFLOW_NOTICE_VERSION = "groq-zdr-workflows-v1";
export const BUSINESS_BRIEF_WORKFLOW = "OWNER_BUSINESS_BRIEF_V1";
export const SUPPORT_REPLY_WORKFLOW = "SUPPORT_REPLY_DRAFT_V1";

export async function getWorkflowConsent(scope, { signal } = {}) {
  const response = await apiRequest(`/ai/workflow-consents/${scope}`, { signal });
  return response.data.consent;
}

export async function acceptWorkflowConsent(scope) {
  const response = await apiRequest(`/ai/workflow-consents/${scope}`, {
    method: "PUT",
    body: { noticeVersion: AI_WORKFLOW_NOTICE_VERSION },
    requiresCsrf: true,
  });
  return response.data.consent;
}

export async function revokeWorkflowConsent(scope) {
  const response = await apiRequest(`/ai/workflow-consents/${scope}`, {
    method: "DELETE",
    requiresCsrf: true,
  });
  return response.data.consent;
}

export async function startBusinessBrief(input, idempotencyKey) {
  const response = await apiRequest("/ai/workflows/owner-business-brief/runs", {
    method: "POST",
    body: input,
    idempotencyKey,
    requiresCsrf: true,
  });
  return response.data.run;
}

export async function startSupportReply(ticketId, idempotencyKey) {
  const response = await apiRequest("/ai/workflows/support-reply/runs", {
    method: "POST",
    body: { ticketId },
    idempotencyKey,
    requiresCsrf: true,
  });
  return response.data.run;
}

export async function listWorkflowRuns(query = {}, { signal } = {}) {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") search.set(name, String(value));
  }
  const suffix = search.size > 0 ? `?${search}` : "";
  const response = await apiRequest(`/ai/workflow-runs${suffix}`, { signal });
  return { runs: response.data.runs, meta: response.meta };
}

export async function getWorkflowRun(workflowRunId, { signal } = {}) {
  const response = await apiRequest(`/ai/workflow-runs/${workflowRunId}`, { signal });
  return response.data.run;
}

export async function decideWorkflow(workflowRunId, input, idempotencyKey) {
  const response = await apiRequest(`/ai/workflow-runs/${workflowRunId}/decisions`, {
    method: "POST",
    body: input,
    idempotencyKey,
    requiresCsrf: true,
  });
  return response.data.run;
}

export async function cancelWorkflow(workflowRunId, version, idempotencyKey) {
  const response = await apiRequest(`/ai/workflow-runs/${workflowRunId}/cancellation`, {
    method: "POST",
    body: { version },
    idempotencyKey,
    requiresCsrf: true,
  });
  return response.data.run;
}
