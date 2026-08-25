import { webConfig } from "../config.js";

export async function getHealth({ signal } = {}) {
  const response = await fetch(`${webConfig.apiBaseUrl}/health`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error("The OpsPilot API is unavailable");
  }

  const payload = await response.json();

  if (payload?.success !== true || payload?.data?.status !== "ok") {
    throw new Error("The OpsPilot API returned an unexpected response");
  }

  return payload.data;
}
