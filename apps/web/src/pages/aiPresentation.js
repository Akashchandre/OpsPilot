const knownMessages = Object.freeze({
  AI_CONSENT_REQUIRED: "Your AI consent is not active. Review and accept the current notice.",
  AI_DAILY_QUOTA_REACHED: "Your daily AI request limit has been reached.",
  AI_COST_CEILING_REACHED: "The shared daily AI cost limit has been reached.",
  AI_COST_POLICY_EXCEEDED:
    "The provider exceeded the per-request cost policy, so its answer was not shown.",
  AI_PROVIDER_TIMEOUT:
    "The provider timed out. That submission was consumed; try again only as a new request.",
  AI_PROVIDER_BUSY: "The provider is busy. Wait before making a new request.",
  AI_PROVIDER_UNAVAILABLE: "The AI provider is temporarily unavailable.",
  AI_DISABLED: "AI features are currently disabled.",
  AI_DOCUMENTS_DISABLED: "AI document answers are currently disabled.",
  AI_CONTEXT_UNAVAILABLE:
    "Authorized document evidence is temporarily unavailable. No answer was generated.",
  AI_DOCUMENT_CITATION_NOT_FOUND:
    "That citation is no longer available or you no longer have access to it.",
  AI_REQUEST_IN_FLIGHT: "Another AI request is already in progress for your account.",
  AI_SUBMISSION_KEY_CONSUMED: "That submission was already consumed. Submit a new request.",
  AI_AUTHORIZATION_CHANGED: "Your access or consent changed while the request was running.",
  AI_RESULT_RECORDING_FAILED: "The result could not be safely recorded, so it was not shown.",
});

export function presentAiError(error) {
  return knownMessages[error?.code] ?? error?.message ?? "The AI request could not be completed.";
}

export function newSubmissionKey() {
  return globalThis.crypto.randomUUID();
}
