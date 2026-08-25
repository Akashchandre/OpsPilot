import { apiRequest } from "./client.js";

export async function getHealth({ signal } = {}) {
  const payload = await apiRequest("/health", { signal });

  if (payload.data?.status !== "ok") {
    throw new Error("The OpsPilot API returned an unexpected response");
  }

  return payload.data;
}
