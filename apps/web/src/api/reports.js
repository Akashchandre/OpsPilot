import { apiRequest } from "./client.js";

function queryString(values) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) query.set(key, value);
  }
  return query.toString();
}

export async function getOverviewReport({ from, to, signal } = {}) {
  const query = queryString({ from, to });
  const response = await apiRequest(`/reports/overview${query ? `?${query}` : ""}`, { signal });
  return response.data.overview;
}
