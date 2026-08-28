import { AppError } from "../../errors/AppError.js";

export function supportError(statusCode, code, message, details) {
  return new AppError({ statusCode, code, message, details });
}

export function supportNotFound() {
  return supportError(404, "SUPPORT_TICKET_NOT_FOUND", "Support ticket was not found");
}

export function supportVersionConflict() {
  return supportError(
    409,
    "RESOURCE_VERSION_CONFLICT",
    "This ticket changed after it was loaded. Refresh it and try again.",
  );
}

export function supportIdempotencyConflict() {
  return supportError(
    409,
    "IDEMPOTENCY_KEY_REUSED",
    "This idempotency key was already used with different input",
  );
}

export function isPrismaUniqueViolation(error) {
  return error?.code === "P2002";
}

export function isPrismaWriteConflict(error) {
  return error?.code === "P2034";
}
