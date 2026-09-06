import { createHash } from "node:crypto";
import path from "node:path";

export const MAX_DOCUMENT_CONTENT_BYTES = 256 * 1024;

const MEDIA_TYPE_BY_EXTENSION = Object.freeze({
  ".txt": "text/plain",
  ".md": "text/markdown",
});
const FORBIDDEN_CONTENT_CHARACTERS =
  // These explicit code-point ranges intentionally enforce the document-ingress security policy.
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
// This metadata boundary intentionally rejects every ASCII/C1 control character.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_METADATA_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;

export const DOCUMENT_CONTENT_ERROR_CODES = Object.freeze({
  INVALID_FILENAME: "DOCUMENT_INVALID_FILENAME",
  UNSUPPORTED_MEDIA_TYPE: "DOCUMENT_UNSUPPORTED_MEDIA_TYPE",
  UNSUPPORTED_LANGUAGE: "DOCUMENT_UNSUPPORTED_LANGUAGE",
  CONTENT_TOO_LARGE: "DOCUMENT_CONTENT_TOO_LARGE",
  INVALID_UTF8: "DOCUMENT_INVALID_UTF8",
  EMPTY_CONTENT: "DOCUMENT_EMPTY_CONTENT",
  UNSAFE_CONTENT: "DOCUMENT_UNSAFE_CONTENT",
});

export class DocumentContentError extends Error {
  constructor(code) {
    super(code);
    this.name = "DocumentContentError";
    this.code = code;
    this.isOperational = true;
  }
}

function contentError(code, cause) {
  const error = new DocumentContentError(code);
  if (cause !== undefined) error.cause = cause;
  return error;
}

function normalizeFilename(filename) {
  if (typeof filename !== "string") {
    throw contentError(DOCUMENT_CONTENT_ERROR_CODES.INVALID_FILENAME);
  }
  const normalized = filename.normalize("NFC").trim();
  if (
    normalized.length < 1 ||
    normalized.length > 255 ||
    normalized === "." ||
    normalized === ".." ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    FORBIDDEN_METADATA_CHARACTERS.test(normalized)
  ) {
    throw contentError(DOCUMENT_CONTENT_ERROR_CODES.INVALID_FILENAME);
  }
  return normalized;
}

function verifyDeclaredFormat(filename, mediaType) {
  const extension = path.extname(filename).toLowerCase();
  const expectedMediaType = MEDIA_TYPE_BY_EXTENSION[extension];
  if (expectedMediaType === undefined || mediaType !== expectedMediaType) {
    throw contentError(DOCUMENT_CONTENT_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE);
  }
  return extension;
}

function decodeStrictUtf8(rawBytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
  } catch (error) {
    throw contentError(DOCUMENT_CONTENT_ERROR_CODES.INVALID_UTF8, error);
  }
}

export function validateAndNormalizeDocumentContent({
  filename,
  mediaType,
  language,
  rawBytes,
  maximumBytes = MAX_DOCUMENT_CONTENT_BYTES,
}) {
  const normalizedFilename = normalizeFilename(filename);
  const extension = verifyDeclaredFormat(normalizedFilename, mediaType);
  if (language !== "en") {
    throw contentError(DOCUMENT_CONTENT_ERROR_CODES.UNSUPPORTED_LANGUAGE);
  }
  if (!Buffer.isBuffer(rawBytes)) {
    throw contentError(DOCUMENT_CONTENT_ERROR_CODES.INVALID_UTF8);
  }
  if (rawBytes.length > maximumBytes) {
    throw contentError(DOCUMENT_CONTENT_ERROR_CODES.CONTENT_TOO_LARGE);
  }

  let content = decodeStrictUtf8(rawBytes);
  if (content.startsWith("\uFEFF")) content = content.slice(1);
  content = content.replaceAll("\r\n", "\n").replaceAll("\r", "\n").normalize("NFC");

  if (FORBIDDEN_CONTENT_CHARACTERS.test(content)) {
    throw contentError(DOCUMENT_CONTENT_ERROR_CODES.UNSAFE_CONTENT);
  }
  if (!content.trim()) {
    throw contentError(DOCUMENT_CONTENT_ERROR_CODES.EMPTY_CONTENT);
  }

  const normalizedBytes = Buffer.from(content, "utf8");
  if (normalizedBytes.length > maximumBytes) {
    throw contentError(DOCUMENT_CONTENT_ERROR_CODES.CONTENT_TOO_LARGE);
  }

  return Object.freeze({
    filename: normalizedFilename,
    mediaType,
    language,
    extension,
    normalizedBytes,
    byteLength: normalizedBytes.length,
    sha256: createHash("sha256").update(normalizedBytes).digest("hex"),
  });
}
