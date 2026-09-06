import { AppError } from "../../errors/AppError.js";
import { DOCUMENT_CONTENT_ERROR_CODES } from "./document.content.js";

export function documentError(statusCode, code, message) {
  return new AppError({ statusCode, code, message });
}

export function documentsDisabled() {
  return documentError(503, "DOCUMENTS_DISABLED", "Document features are currently disabled");
}

export function documentNotFound() {
  return documentError(404, "DOCUMENT_NOT_FOUND", "Document was not found");
}

export function documentVersionNotFound() {
  return documentError(404, "DOCUMENT_VERSION_NOT_FOUND", "Document version was not found");
}

export function documentStateConflict() {
  return documentError(
    409,
    "DOCUMENT_STATE_CONFLICT",
    "The document is not in a state that permits this operation",
  );
}

export function documentVersionConflict() {
  return documentError(
    409,
    "DOCUMENT_VERSION_CONFLICT",
    "This document changed after it was loaded. Refresh it and try again.",
  );
}

export function documentIdempotencyConflict() {
  return documentError(
    409,
    "DOCUMENT_IDEMPOTENCY_CONFLICT",
    "This idempotency key was already used for a different document operation",
  );
}

export function documentAuthorizationChanged() {
  return documentError(
    403,
    "DOCUMENT_AUTHORIZATION_CHANGED",
    "Your document access changed while the request was running",
  );
}

export function documentUploadInFlight() {
  return documentError(
    429,
    "DOCUMENT_UPLOAD_IN_FLIGHT",
    "Finish the current document ingestion before uploading another version",
  );
}

export function documentUploadDailyLimitReached() {
  return documentError(
    429,
    "DOCUMENT_UPLOAD_DAILY_LIMIT_REACHED",
    "The daily document upload limit has been reached",
  );
}

export function documentContentTypeMismatch() {
  return documentError(
    415,
    "DOCUMENT_CONTENT_TYPE_MISMATCH",
    "The upload content type does not match the approved document version",
  );
}

export function documentStorageUnavailable() {
  return documentError(
    503,
    "DOCUMENT_STORAGE_UNAVAILABLE",
    "Protected document storage is unavailable or failed an integrity check",
  );
}

export function documentRecoveryUnavailable() {
  return documentError(
    503,
    "DOCUMENT_RECOVERY_UNAVAILABLE",
    "Document recovery inventory is temporarily unavailable",
  );
}

export function mapDocumentContentError(error) {
  if (!Object.values(DOCUMENT_CONTENT_ERROR_CODES).includes(error?.code)) throw error;
  const statusCode =
    error.code === DOCUMENT_CONTENT_ERROR_CODES.CONTENT_TOO_LARGE
      ? 413
      : error.code === DOCUMENT_CONTENT_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE
        ? 415
        : 422;
  return documentError(statusCode, error.code, "The document content is invalid or unsupported");
}
