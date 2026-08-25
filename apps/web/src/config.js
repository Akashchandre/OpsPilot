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

function normalizeCookieName(value) {
  const cookieName = value || "opspilot_csrf";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(cookieName)) {
    throw new Error("VITE_CSRF_COOKIE_NAME must be a valid cookie name");
  }
  return cookieName;
}

export const webConfig = Object.freeze({
  apiBaseUrl: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
  csrfCookieName: normalizeCookieName(import.meta.env.VITE_CSRF_COOKIE_NAME),
});
