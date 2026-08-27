import { webConfig } from "../config.js";

export class ApiError extends Error {
  constructor({ status, code, message, details }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function readCookie(name) {
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : undefined;
}

export async function apiRequest(
  path,
  { method = "GET", body, requiresCsrf = false, idempotencyKey, signal } = {},
) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  if (requiresCsrf) {
    const csrfToken = readCookie(webConfig.csrfCookieName);
    if (!csrfToken) {
      throw new ApiError({
        status: 403,
        code: "CSRF_TOKEN_MISSING",
        message: "Your security token is unavailable. Refresh the page and try again.",
      });
    }
    headers["X-CSRF-Token"] = csrfToken;
  }

  let response;
  try {
    response = await fetch(`${webConfig.apiBaseUrl}${path}`, {
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError({
      status: 0,
      code: "NETWORK_ERROR",
      message: "The OpsPilot API is unavailable.",
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError({
      status: response.status,
      code: "INVALID_API_RESPONSE",
      message: "The OpsPilot API returned an unexpected response.",
    });
  }

  if (!response.ok || payload?.success !== true) {
    throw new ApiError({
      status: response.status,
      code: payload?.error?.code ?? "API_ERROR",
      message: payload?.error?.message ?? "The request could not be completed.",
      details: payload?.error?.details,
    });
  }

  return payload;
}
