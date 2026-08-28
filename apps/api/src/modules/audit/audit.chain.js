import { createHmac, timingSafeEqual } from "node:crypto";
import { AUDIT_GENESIS_HASH, AUDIT_HASH_VERSION } from "./audit.constants.js";

const lowercaseSha256Pattern = /^[0-9a-f]{64}$/;

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("Audit values must be JSON-compatible");
}

function occurredAtIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("Audit occurrence time is invalid");
  return date.toISOString();
}

function canonicalEventPayload(event) {
  return {
    action: event.action,
    actorKind: event.actorKind,
    actorUserId: event.actorUserId ?? null,
    id: event.id,
    keyId: event.keyId,
    metadata: event.metadata ?? null,
    occurredAt: occurredAtIso(event.occurredAt),
    outcome: event.outcome,
    previousHash: event.previousHash,
    requestId: event.requestId ?? null,
    sequence: BigInt(event.sequence).toString(),
    targetId: event.targetId ?? null,
    targetType: event.targetType,
    version: AUDIT_HASH_VERSION,
  };
}

export function canonicalizeAuditEvent(event) {
  return canonicalJson(canonicalEventPayload(event));
}

export function computeAuditEventHash(event, integrityKey) {
  return createHmac("sha256", integrityKey)
    .update(canonicalizeAuditEvent(event), "utf8")
    .digest("hex");
}

function hashesMatch(left, right) {
  if (!lowercaseSha256Pattern.test(left) || !lowercaseSha256Pattern.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function invalid(reason, checkedEvents, sequence = null) {
  return Object.freeze({
    valid: false,
    checkedEvents,
    reason,
    firstInvalidSequence: sequence === null ? null : BigInt(sequence).toString(),
  });
}

export function verifyAuditSnapshot({ events, head, resolveKey }) {
  if (!head) return invalid("CHAIN_HEAD_MISSING", 0);

  let expectedSequence = 1n;
  let expectedPreviousHash = AUDIT_GENESIS_HASH;
  let checkedEvents = 0;

  for (const event of events) {
    let sequence;
    try {
      sequence = BigInt(event.sequence);
    } catch {
      return invalid("SEQUENCE_INVALID", checkedEvents);
    }

    if (sequence !== expectedSequence) {
      return invalid("SEQUENCE_GAP_OR_REORDERING", checkedEvents, sequence);
    }
    if (!hashesMatch(event.previousHash, expectedPreviousHash)) {
      return invalid("PREVIOUS_HASH_MISMATCH", checkedEvents, sequence);
    }

    const integrityKey = resolveKey(event.keyId);
    if (!integrityKey) return invalid("UNKNOWN_KEY_ID", checkedEvents, sequence);

    let expectedEventHash;
    try {
      expectedEventHash = computeAuditEventHash(event, integrityKey);
    } catch {
      return invalid("EVENT_PAYLOAD_INVALID", checkedEvents, sequence);
    }
    if (!hashesMatch(event.eventHash, expectedEventHash)) {
      return invalid("EVENT_HASH_MISMATCH", checkedEvents, sequence);
    }

    checkedEvents += 1;
    expectedSequence += 1n;
    expectedPreviousHash = event.eventHash;
  }

  if (BigInt(head.headSequence) !== expectedSequence - 1n) {
    return invalid("CHAIN_HEAD_SEQUENCE_MISMATCH", checkedEvents, head.headSequence);
  }
  if (!hashesMatch(head.headHash, expectedPreviousHash)) {
    return invalid("CHAIN_HEAD_HASH_MISMATCH", checkedEvents, head.headSequence);
  }

  return Object.freeze({
    valid: true,
    checkedEvents,
    reason: null,
    firstInvalidSequence: null,
  });
}
