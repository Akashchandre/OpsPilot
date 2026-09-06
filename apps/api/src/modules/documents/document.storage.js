import { constants as fileConstants, promises as filesystem } from "node:fs";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENVELOPE_MAGIC = Buffer.from("OPSDOC01", "ascii");
const ENVELOPE_VERSION = 1;
const HEADER_LENGTH_BYTES = 4;
const AUTH_TAG_BYTES = 16;
const NONCE_BYTES = 12;
const MAX_HEADER_BYTES = 2048;
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.opdoc$/i;

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY_ROOT = path.resolve(MODULE_DIRECTORY, "../../../../..");

export const DOCUMENT_STORAGE_ERROR_CODES = Object.freeze({
  INVALID_CONFIGURATION: "DOCUMENT_STORAGE_INVALID_CONFIGURATION",
  INVALID_REFERENCE: "DOCUMENT_STORAGE_INVALID_REFERENCE",
  WRITE_FAILED: "DOCUMENT_STORAGE_WRITE_FAILED",
  NOT_FOUND: "DOCUMENT_STORAGE_NOT_FOUND",
  INTEGRITY_FAILURE: "DOCUMENT_STORAGE_INTEGRITY_FAILURE",
  DELETE_FAILED: "DOCUMENT_STORAGE_DELETE_FAILED",
  INVENTORY_FAILED: "DOCUMENT_STORAGE_INVENTORY_FAILED",
});

export class DocumentStorageError extends Error {
  constructor(code) {
    super(code);
    this.name = "DocumentStorageError";
    this.code = code;
    this.isOperational = true;
  }
}

function storageError(code, cause) {
  const error = new DocumentStorageError(code);
  if (cause !== undefined) error.cause = cause;
  return error;
}

function isSamePath(left, right) {
  return path.normalize(left).toLowerCase() === path.normalize(right).toLowerCase();
}

function isInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function validateStorageRoot(root, repositoryRoot) {
  if (typeof root !== "string" || !path.isAbsolute(root)) {
    throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INVALID_CONFIGURATION);
  }

  const normalizedRoot = path.resolve(root);
  const normalizedRepositoryRoot = path.resolve(repositoryRoot);
  const filesystemRoot = path.parse(normalizedRoot).root;
  const webRoot = path.join(normalizedRepositoryRoot, "apps", "web");

  if (
    isSamePath(normalizedRoot, filesystemRoot) ||
    isSamePath(normalizedRoot, normalizedRepositoryRoot) ||
    isInside(normalizedRepositoryRoot, normalizedRoot) ||
    isInside(normalizedRoot, normalizedRepositoryRoot) ||
    isSamePath(normalizedRoot, webRoot) ||
    isInside(normalizedRoot, webRoot)
  ) {
    throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INVALID_CONFIGURATION);
  }

  return normalizedRoot;
}

function validateKeyId(keyId) {
  if (typeof keyId !== "string" || !KEY_ID_PATTERN.test(keyId)) {
    throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INVALID_CONFIGURATION);
  }
}

function decodeKey(value) {
  const decoded = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value ?? "", "base64");
  if (decoded.length !== 32) {
    throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INVALID_CONFIGURATION);
  }
  return decoded;
}

function normalizeKeys(keys) {
  if (!keys || typeof keys !== "object") {
    throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INVALID_CONFIGURATION);
  }

  const normalized = new Map();
  for (const [keyId, value] of Object.entries(keys)) {
    validateKeyId(keyId);
    normalized.set(keyId, decodeKey(value));
  }
  return normalized;
}

function validateDocumentVersionId(documentVersionId) {
  if (typeof documentVersionId !== "string" || !UUID_PATTERN.test(documentVersionId)) {
    throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INVALID_REFERENCE);
  }
}

function validateObjectKey(objectKey) {
  if (typeof objectKey !== "string" || !OBJECT_KEY_PATTERN.test(objectKey)) {
    throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INVALID_REFERENCE);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest();
}

function hashesMatch(actual, expectedHex) {
  if (typeof expectedHex !== "string" || !/^[0-9a-f]{64}$/i.test(expectedHex)) return false;
  return timingSafeEqual(actual, Buffer.from(expectedHex, "hex"));
}

function buildEnvelope({ plaintext, key, keyId, objectKey, documentVersionId }) {
  const nonce = randomBytes(NONCE_BYTES);
  const header = Buffer.from(
    JSON.stringify({
      version: ENVELOPE_VERSION,
      algorithm: "AES-256-GCM",
      keyId,
      objectKey,
      documentVersionId,
      nonce: nonce.toString("base64"),
    }),
    "utf8",
  );
  const headerLength = Buffer.alloc(HEADER_LENGTH_BYTES);
  headerLength.writeUInt32BE(header.length);
  const authenticatedHeader = Buffer.concat([ENVELOPE_MAGIC, headerLength, header]);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(authenticatedHeader);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return Buffer.concat([authenticatedHeader, ciphertext, cipher.getAuthTag()]);
}

function parseEnvelope(envelope, { keys, objectKey, documentVersionId }) {
  const minimumBytes = ENVELOPE_MAGIC.length + HEADER_LENGTH_BYTES + 1 + AUTH_TAG_BYTES;
  if (!Buffer.isBuffer(envelope) || envelope.length < minimumBytes) {
    throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INTEGRITY_FAILURE);
  }

  const magic = envelope.subarray(0, ENVELOPE_MAGIC.length);
  if (!timingSafeEqual(magic, ENVELOPE_MAGIC)) {
    throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INTEGRITY_FAILURE);
  }

  const headerLengthOffset = ENVELOPE_MAGIC.length;
  const headerLength = envelope.readUInt32BE(headerLengthOffset);
  const headerStart = headerLengthOffset + HEADER_LENGTH_BYTES;
  const headerEnd = headerStart + headerLength;
  if (
    headerLength < 1 ||
    headerLength > MAX_HEADER_BYTES ||
    headerEnd + AUTH_TAG_BYTES > envelope.length
  ) {
    throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INTEGRITY_FAILURE);
  }

  let header;
  try {
    header = JSON.parse(envelope.subarray(headerStart, headerEnd).toString("utf8"));
  } catch (error) {
    throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INTEGRITY_FAILURE, error);
  }

  if (
    !header ||
    header.version !== ENVELOPE_VERSION ||
    header.algorithm !== "AES-256-GCM" ||
    header.objectKey !== objectKey ||
    header.documentVersionId !== documentVersionId ||
    typeof header.keyId !== "string" ||
    typeof header.nonce !== "string"
  ) {
    throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INTEGRITY_FAILURE);
  }

  const key = keys.get(header.keyId);
  const nonce = Buffer.from(header.nonce, "base64");
  if (!key || nonce.length !== NONCE_BYTES) {
    throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INTEGRITY_FAILURE);
  }

  const authTagStart = envelope.length - AUTH_TAG_BYTES;
  const authenticatedHeader = envelope.subarray(0, headerEnd);
  const ciphertext = envelope.subarray(headerEnd, authTagStart);
  const authTag = envelope.subarray(authTagStart);

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(authenticatedHeader);
    decipher.setAuthTag(authTag);
    return {
      plaintext: Buffer.concat([decipher.update(ciphertext), decipher.final()]),
      keyId: header.keyId,
    };
  } catch (error) {
    throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INTEGRITY_FAILURE, error);
  }
}

export class EncryptedFilesystemDocumentStore {
  #activeKeyId;
  #keys;
  #repositoryRoot;
  #root;
  #ready = false;

  constructor({ root, activeKeyId, keys, repositoryRoot = DEFAULT_REPOSITORY_ROOT }) {
    validateKeyId(activeKeyId);
    this.#repositoryRoot = path.resolve(repositoryRoot);
    this.#root = validateStorageRoot(root, this.#repositoryRoot);
    this.#keys = normalizeKeys(keys);
    if (!this.#keys.has(activeKeyId)) {
      throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INVALID_CONFIGURATION);
    }
    this.#activeKeyId = activeKeyId;
  }

  get activeKeyId() {
    return this.#activeKeyId;
  }

  async initialize() {
    try {
      await filesystem.mkdir(this.#root, { recursive: true, mode: 0o700 });
      const stat = await filesystem.lstat(this.#root);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INVALID_CONFIGURATION);
      }
      const realRoot = await filesystem.realpath(this.#root);
      this.#root = validateStorageRoot(realRoot, this.#repositoryRoot);
      this.#ready = true;
    } catch (error) {
      if (error instanceof DocumentStorageError) throw error;
      throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INVALID_CONFIGURATION, error);
    }
    return this;
  }

  #requireReady() {
    if (!this.#ready) {
      throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INVALID_CONFIGURATION);
    }
  }

  #resolveObjectPath(objectKey) {
    validateObjectKey(objectKey);
    const resolved = path.resolve(this.#root, objectKey);
    if (!isInside(resolved, this.#root)) {
      throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INVALID_REFERENCE);
    }
    return resolved;
  }

  async write({ documentVersionId, plaintext }) {
    this.#requireReady();
    validateDocumentVersionId(documentVersionId);
    if (!Buffer.isBuffer(plaintext)) {
      throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INVALID_REFERENCE);
    }

    const objectKey = `${randomUUID()}.opdoc`;
    const destination = this.#resolveObjectPath(objectKey);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    const envelope = buildEnvelope({
      plaintext,
      key: this.#keys.get(this.#activeKeyId),
      keyId: this.#activeKeyId,
      objectKey,
      documentVersionId,
    });

    let handle;
    try {
      handle = await filesystem.open(
        temporary,
        fileConstants.O_CREAT | fileConstants.O_EXCL | fileConstants.O_WRONLY,
        0o600,
      );
      await handle.writeFile(envelope);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await filesystem.rename(temporary, destination);
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await filesystem.unlink(temporary).catch(() => undefined);
      throw storageError(DOCUMENT_STORAGE_ERROR_CODES.WRITE_FAILED, error);
    }

    return Object.freeze({
      objectKey,
      keyId: this.#activeKeyId,
      encryptedBytes: envelope.length,
    });
  }

  async read({ objectKey, documentVersionId, expectedSha256 }) {
    this.#requireReady();
    validateDocumentVersionId(documentVersionId);
    const objectPath = this.#resolveObjectPath(objectKey);

    let envelope;
    try {
      const stat = await filesystem.lstat(objectPath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INTEGRITY_FAILURE);
      }
      envelope = await filesystem.readFile(objectPath);
    } catch (error) {
      if (error instanceof DocumentStorageError) throw error;
      if (error?.code === "ENOENT") {
        throw storageError(DOCUMENT_STORAGE_ERROR_CODES.NOT_FOUND);
      }
      throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INTEGRITY_FAILURE, error);
    }

    const result = parseEnvelope(envelope, {
      keys: this.#keys,
      objectKey,
      documentVersionId,
    });
    if (expectedSha256 !== undefined && !hashesMatch(sha256(result.plaintext), expectedSha256)) {
      throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INTEGRITY_FAILURE);
    }
    return Object.freeze({ plaintext: result.plaintext, keyId: result.keyId });
  }

  async delete(objectKey) {
    this.#requireReady();
    const objectPath = this.#resolveObjectPath(objectKey);
    try {
      await filesystem.unlink(objectPath);
      return true;
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw storageError(DOCUMENT_STORAGE_ERROR_CODES.DELETE_FAILED, error);
    }
  }

  async health() {
    if (!this.#ready) return "unavailable";
    try {
      const stat = await filesystem.lstat(this.#root);
      return stat.isDirectory() && !stat.isSymbolicLink() ? "ready" : "unavailable";
    } catch {
      return "unavailable";
    }
  }

  async inventory() {
    this.#requireReady();
    try {
      const entries = await filesystem.readdir(this.#root, { withFileTypes: true });
      const objectKeys = [];
      let unexpectedEntryCount = 0;
      for (const entry of entries) {
        if (entry.isFile() && OBJECT_KEY_PATTERN.test(entry.name)) {
          objectKeys.push(entry.name);
        } else {
          unexpectedEntryCount += 1;
        }
      }
      objectKeys.sort();
      return Object.freeze({ objectKeys: Object.freeze(objectKeys), unexpectedEntryCount });
    } catch (error) {
      throw storageError(DOCUMENT_STORAGE_ERROR_CODES.INVENTORY_FAILED, error);
    }
  }
}

export function createEncryptedDocumentStore(configuration) {
  return new EncryptedFilesystemDocumentStore(configuration);
}
