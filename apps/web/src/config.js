const defaultApiBaseUrl = "http://127.0.0.1:4000/api/v1";

function normalizeApiBaseUrl(value) {
  const apiBaseUrl = value || defaultApiBaseUrl;

  try {
    const url = new URL(apiBaseUrl);
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error("VITE_API_BASE_URL must be a valid URL");
  }
}

export const webConfig = Object.freeze({
  apiBaseUrl: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
});
