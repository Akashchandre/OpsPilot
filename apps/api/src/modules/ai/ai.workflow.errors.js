import { AppError } from "../../errors/AppError.js";

export function workflowError(statusCode, code, message) {
  return new AppError({ statusCode, code, message });
}

export const workflowDisabled = () =>
  workflowError(503, "AI_WORKFLOWS_DISABLED", "AI workflows are currently disabled");
export const workflowNotFound = () =>
  workflowError(404, "AI_WORKFLOW_NOT_FOUND", "The workflow run was not found");
export const workflowConflict = (code = "AI_WORKFLOW_STATE_INVALID") =>
  workflowError(409, code, "The workflow run cannot perform that operation in its current state");
export const workflowConsentRequired = () =>
  workflowError(409, "AI_WORKFLOW_CONSENT_REQUIRED", "Current AI workflow consent is required");
export const workflowLimitReached = () =>
  workflowError(429, "AI_WORKFLOW_LIMIT_REACHED", "The AI workflow limit has been reached");
export const workflowCostCeilingReached = () =>
  workflowError(429, "AI_COST_CEILING_REACHED", "The AI daily cost ceiling has been reached");
export const workflowContextChanged = () =>
  workflowError(409, "AI_WORKFLOW_CONTEXT_CHANGED", "The support context changed; start a new run");
export const workflowArtifactUnavailable = () =>
  workflowError(503, "AI_WORKFLOW_ARTIFACT_UNAVAILABLE", "The workflow artifact is unavailable");
export const workflowIdempotencyConflict = () =>
  workflowError(409, "AI_WORKFLOW_IDEMPOTENCY_CONFLICT", "The idempotency key was reused");
