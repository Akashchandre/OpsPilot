export const DOCUMENT_STATUSES = Object.freeze({
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
  DELETING: "DELETING",
  DELETED: "DELETED",
});

export const DOCUMENT_VERSION_STATUSES = Object.freeze({
  AWAITING_UPLOAD: "AWAITING_UPLOAD",
  QUEUED: "QUEUED",
  PROCESSING: "PROCESSING",
  STAGED: "STAGED",
  READY: "READY",
  FAILED: "FAILED",
  SUPERSEDED: "SUPERSEDED",
  DELETING: "DELETING",
  DELETED: "DELETED",
});

export const DOCUMENT_AUDIENCES = Object.freeze({
  CUSTOMER: "CUSTOMER",
  OWNER: "OWNER",
});

export const DOCUMENT_INDEX_VERSION = 1;
export const DOCUMENT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2";
export const DOCUMENT_EMBEDDING_MODEL_REVISION = "5f1b8cd78bc4fb444dd171e59b18f3a3af89a079";
export const DOCUMENT_EMBEDDING_DIMENSION = 384;
export const DOCUMENT_VECTOR_COLLECTION = "opspilot_documents_v1";

// Calibrated against apps/ai/evaluation/rag-golden-set.json. The selected
// boundary is above the measured no-evidence ceiling (0.306362) and below the
// measured positive floor (0.405420); see the Phase 8 evaluation evidence.
export const DOCUMENT_RETRIEVAL_MINIMUM_SCORE = 0.36;
export const DOCUMENT_RETRIEVAL_CANDIDATES = 8;
export const DOCUMENT_CONTEXT_MAX_CHUNKS = 5;
export const DOCUMENT_CONTEXT_MAX_BYTES = 8000;
export const DOCUMENT_CONTEXT_MAX_ESTIMATED_TOKENS = 2000;
export const DOCUMENT_UPLOAD_DAILY_MAXIMUM = 10;
