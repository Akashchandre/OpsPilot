import { AppError } from "../../errors/AppError.js";

export function aiDisabled() {
  return new AppError({
    statusCode: 503,
    code: "AI_DISABLED",
    message: "AI features are currently disabled",
  });
}

export function aiConsentRequired() {
  return new AppError({
    statusCode: 409,
    code: "AI_CONSENT_REQUIRED",
    message: "Accept the current AI processing notice before continuing",
  });
}

export function aiSubmissionConsumed() {
  return new AppError({
    statusCode: 409,
    code: "AI_SUBMISSION_KEY_CONSUMED",
    message: "This submission key has already been consumed; use a new key for a new request",
  });
}

export function aiRequestInFlight() {
  return new AppError({
    statusCode: 409,
    code: "AI_REQUEST_IN_FLIGHT",
    message: "Another AI request is already in progress for this account",
  });
}

export function aiDailyQuotaReached() {
  return new AppError({
    statusCode: 429,
    code: "AI_DAILY_QUOTA_REACHED",
    message: "The daily AI request limit has been reached",
  });
}

export function aiCostCeilingReached() {
  return new AppError({
    statusCode: 429,
    code: "AI_COST_CEILING_REACHED",
    message: "The daily AI cost ceiling has been reached",
  });
}

export function aiCostPolicyExceeded() {
  return new AppError({
    statusCode: 503,
    code: "AI_COST_POLICY_EXCEEDED",
    message: "The AI response exceeded the request cost policy and was not returned",
  });
}

export function aiAuthorizationChanged() {
  return new AppError({
    statusCode: 403,
    code: "AI_AUTHORIZATION_CHANGED",
    message: "Your access changed while the AI request was running",
  });
}

export function aiProviderUnavailable(internalCode) {
  const rateLimited = internalCode === "PROVIDER_RATE_LIMITED";
  const timedOut = ["PROVIDER_TIMEOUT", "AI_SERVICE_TIMEOUT"].includes(internalCode);
  return new AppError({
    statusCode: rateLimited ? 429 : 503,
    code: rateLimited
      ? "AI_PROVIDER_BUSY"
      : timedOut
        ? "AI_PROVIDER_TIMEOUT"
        : "AI_PROVIDER_UNAVAILABLE",
    message: rateLimited
      ? "The AI provider is busy; try a new request later"
      : timedOut
        ? "The AI request timed out; its submission key cannot be reused"
        : "The AI provider is temporarily unavailable",
  });
}

export function aiRecordingFailed() {
  return new AppError({
    statusCode: 503,
    code: "AI_RESULT_RECORDING_FAILED",
    message: "The AI result could not be recorded and cannot be returned",
  });
}

export function aiContextUnavailable() {
  return new AppError({
    statusCode: 503,
    code: "AI_CONTEXT_UNAVAILABLE",
    message: "The authoritative overview could not be prepared",
  });
}
