import { apiRequest } from "./client.js";

export async function listJobs({ status, type, page = 1, limit = 50, signal } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status && status !== "ALL") query.set("status", status);
  if (type && type !== "ALL") query.set("type", type);
  const response = await apiRequest(`/jobs?${query}`, { signal });
  return { jobs: response.data.jobs, meta: response.meta };
}

export async function getJobHealth({ signal } = {}) {
  const response = await apiRequest("/jobs/health", { signal });
  return response.data.health;
}

export async function getJob(jobId, { signal } = {}) {
  const response = await apiRequest(`/jobs/${jobId}`, { signal });
  return response.data.job;
}

export async function replayJob(jobId, idempotencyKey = crypto.randomUUID()) {
  const response = await apiRequest(`/jobs/${jobId}/replay`, {
    method: "POST",
    requiresCsrf: true,
    body: { idempotencyKey },
  });
  return response.data;
}
