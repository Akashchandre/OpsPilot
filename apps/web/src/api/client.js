import { webConfig } from "../config.js";
import {
  isMutationMethod,
  notifyActionError,
  notifyActionSuccess,
} from "../feedback/actionFeedback.js";

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
  {
    method = "GET",
    body,
    rawBody = false,
    contentType,
    requiresCsrf = false,
    idempotencyKey,
    signal,
    feedback,
  } = {},
) {
  const normalizedMethod = method.toUpperCase();
  const shouldNotify = feedback !== false && isMutationMethod(normalizedMethod);
  const successMessage = typeof feedback === "object" ? feedback.success : undefined;
  const errorMessage = typeof feedback === "object" ? feedback.error : undefined;

  function fail(error) {
    if (shouldNotify) notifyActionError(path, normalizedMethod, error, errorMessage);
    throw error;
  }

  const headers = { Accept: "application/json" };
  if (body !== undefined) {
    headers["Content-Type"] = rawBody ? contentType : "application/json";
  }
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  if (requiresCsrf) {
    const csrfToken = readCookie(webConfig.csrfCookieName);
    if (!csrfToken) {
      fail(
        new ApiError({
          status: 403,
          code: "CSRF_TOKEN_MISSING",
          message: "Your security token is unavailable. Refresh the page and try again.",
        }),
      );
    }
    headers["X-CSRF-Token"] = csrfToken;
  }

  let response;
  try {
    response = await fetch(`${webConfig.apiBaseUrl}${path}`, {
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : rawBody ? body : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    fail(
      new ApiError({
        status: 0,
        code: "NETWORK_ERROR",
        message: "The OpsPilot API is unavailable.",
      }),
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    fail(
      new ApiError({
        status: response.status,
        code: "INVALID_API_RESPONSE",
        message: "The OpsPilot API returned an unexpected response.",
      }),
    );
  }

  if (!response.ok || payload?.success !== true) {
    fail(
      new ApiError({
        status: response.status,
        code: payload?.error?.code ?? "API_ERROR",
        message: payload?.error?.message ?? "The request could not be completed.",
        details: payload?.error?.details,
      }),
    );
  }

  if (shouldNotify && successMessage !== false) {
    notifyActionSuccess(path, normalizedMethod, successMessage);
  }
  return payload;
}

export async function apiBinaryRequest(path, { signal } = {}) {
  let response;
  try {
    response = await fetch(`${webConfig.apiBaseUrl}${path}`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "text/plain, text/markdown" },
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

  if (!response.ok) {
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    throw new ApiError({
      status: response.status,
      code: payload?.error?.code ?? "API_ERROR",
      message: payload?.error?.message ?? "The document could not be downloaded.",
      details: payload?.error?.details,
    });
  }

  return {
    blob: await response.blob(),
    contentDisposition: response.headers.get("content-disposition"),
  };
}
