import { createHash } from "node:crypto";
import { USER_STATUSES } from "../auth/auth.constants.js";
import { authorizationInclude } from "../auth/auth.presenter.js";
import { documentAuthorizationChanged, documentIdempotencyConflict } from "./document.errors.js";

export const DOCUMENT_MUTATION_OPERATIONS = Object.freeze({
  CREATE_DOCUMENT: "CREATE_DOCUMENT",
  CREATE_VERSION: "CREATE_VERSION",
  UPLOAD_CONTENT: "UPLOAD_CONTENT",
  UPDATE_STATUS: "UPDATE_STATUS",
  REQUEST_REINDEX: "REQUEST_REINDEX",
  REQUEST_DELETE: "REQUEST_DELETE",
});

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function documentMutationHash(operation, payload) {
  return createHash("sha256").update(canonicalJson({ operation, payload })).digest("hex");
}

function hasPermission(user, requiredPermission) {
  return user.roles.some((assignment) =>
    assignment.role.rolePermissions.some((entry) => entry.permission.code === requiredPermission),
  );
}

export async function lockDocumentActor(transaction, actorUserId, requiredPermission) {
  const rows = await transaction.$queryRaw`
    SELECT id
    FROM users
    WHERE id = ${actorUserId}
    FOR UPDATE
  `;
  if (!Array.isArray(rows) || rows.length !== 1) throw documentIdempotencyConflict();

  const actor = await transaction.user.findUnique({
    where: { id: actorUserId },
    include: authorizationInclude,
  });
  if (
    !actor ||
    actor.status !== USER_STATUSES.ACTIVE ||
    !hasPermission(actor, requiredPermission)
  ) {
    throw documentAuthorizationChanged();
  }
  return actor;
}

export async function findDocumentMutationReceipt(
  transaction,
  { actorUserId, idempotencyKey, operation, requestHash },
) {
  const receipt = await transaction.documentMutationReceipt.findUnique({
    where: {
      actorUserId_idempotencyKey: { actorUserId, idempotencyKey },
    },
  });
  if (!receipt) return null;
  if (receipt.operation !== operation || receipt.requestHash !== requestHash) {
    throw documentIdempotencyConflict();
  }
  return receipt;
}

export function createDocumentMutationReceipt(
  transaction,
  { actorUserId, idempotencyKey, operation, requestHash, ...references },
) {
  return transaction.documentMutationReceipt.create({
    data: {
      actorUserId,
      idempotencyKey,
      operation,
      requestHash,
      ...references,
    },
  });
}
