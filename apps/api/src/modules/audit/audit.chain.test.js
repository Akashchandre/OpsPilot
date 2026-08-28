import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_KINDS,
  AUDIT_GENESIS_HASH,
  AUDIT_OUTCOMES,
  AUDIT_TARGET_TYPES,
} from "./audit.constants.js";
import {
  canonicalizeAuditEvent,
  computeAuditEventHash,
  verifyAuditSnapshot,
} from "./audit.chain.js";
import { AuditMetadataError, validateAuditDescriptor } from "./audit.metadata.js";
import { createAuditListQuerySchema } from "./audit.schemas.js";

const integrityKey = Buffer.alloc(32, 0x41);
const otherKey = Buffer.alloc(32, 0x42);

function event(sequence, previousHash, metadata = {}) {
  const value = {
    id: `00000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`,
    sequence: BigInt(sequence),
    action: AUDIT_ACTIONS.AUDIT_EVENTS_READ,
    outcome: AUDIT_OUTCOMES.SUCCESS,
    actorKind: AUDIT_ACTOR_KINDS.USER,
    actorUserId: "10000000-0000-4000-8000-000000000001",
    targetType: AUDIT_TARGET_TYPES.AUDIT_STREAM,
    targetId: null,
    requestId: `20000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`,
    metadata,
    occurredAt: new Date(`2026-08-28T00:00:0${sequence}.000Z`),
    previousHash,
    keyId: "audit-test-v1",
  };
  return { ...value, eventHash: computeAuditEventHash(value, integrityKey) };
}

function validSnapshot() {
  const first = event(1, AUDIT_GENESIS_HASH, { a: 1, b: 2 });
  const second = event(2, first.eventHash, { nested: { enabled: true } });
  return {
    events: [first, second],
    head: { headSequence: 2n, headHash: second.eventHash },
  };
}

describe("audit HMAC chain", () => {
  it("canonicalizes object keys deterministically", () => {
    const first = event(1, AUDIT_GENESIS_HASH, { first: 1, second: 2 });
    const reordered = { ...first, metadata: { second: 2, first: 1 } };

    expect(canonicalizeAuditEvent(reordered)).toBe(canonicalizeAuditEvent(first));
    expect(computeAuditEventHash(reordered, integrityKey)).toBe(first.eventHash);
  });

  it("verifies a valid snapshot and detects mutation, deletion, reordering, wrong keys, and head damage", () => {
    const snapshot = validSnapshot();
    const resolveKey = (keyId) => (keyId === "audit-test-v1" ? integrityKey : null);

    expect(verifyAuditSnapshot({ ...snapshot, resolveKey })).toEqual({
      valid: true,
      checkedEvents: 2,
      reason: null,
      firstInvalidSequence: null,
    });

    const mutated = structuredClone(snapshot);
    mutated.events[0].metadata.a = 99;
    expect(verifyAuditSnapshot({ ...mutated, resolveKey }).reason).toBe("EVENT_HASH_MISMATCH");

    const deleted = { events: [snapshot.events[1]], head: snapshot.head };
    expect(verifyAuditSnapshot({ ...deleted, resolveKey }).reason).toBe(
      "SEQUENCE_GAP_OR_REORDERING",
    );

    const reordered = { events: [...snapshot.events].reverse(), head: snapshot.head };
    expect(verifyAuditSnapshot({ ...reordered, resolveKey }).reason).toBe(
      "SEQUENCE_GAP_OR_REORDERING",
    );

    const wrongKey = () => otherKey;
    expect(verifyAuditSnapshot({ ...snapshot, resolveKey: wrongKey }).reason).toBe(
      "EVENT_HASH_MISMATCH",
    );

    const damagedHead = { ...snapshot.head, headHash: "f".repeat(64) };
    expect(
      verifyAuditSnapshot({ events: snapshot.events, head: damagedHead, resolveKey }).reason,
    ).toBe("CHAIN_HEAD_HASH_MISMATCH");
  });
});

describe("audit metadata and list validation", () => {
  it("accepts only the registered action metadata and normalizes filter names", () => {
    const descriptor = validateAuditDescriptor({
      action: AUDIT_ACTIONS.AUDIT_EVENTS_READ,
      outcome: AUDIT_OUTCOMES.SUCCESS,
      actorKind: AUDIT_ACTOR_KINDS.USER,
      actorUserId: "10000000-0000-4000-8000-000000000001",
      targetType: AUDIT_TARGET_TYPES.AUDIT_STREAM,
      requestId: "20000000-0000-4000-8000-000000000001",
      metadata: {
        filterNames: ["outcome", "action", "outcome"],
        page: 1,
        limit: 50,
        returnedCount: 2,
        total: 2,
      },
    });

    expect(descriptor.metadata.filterNames).toEqual(["action", "outcome"]);
    expect(() =>
      validateAuditDescriptor({
        ...descriptor,
        metadata: { ...descriptor.metadata, sessionToken: "canary-secret" },
      }),
    ).toThrow(AuditMetadataError);
    expect(() => validateAuditDescriptor({ ...descriptor, targetType: "USER" })).toThrow(
      AuditMetadataError,
    );
  });

  it("applies a 30-day default and rejects invalid or overlong UTC ranges", () => {
    const now = new Date("2026-08-28T12:00:00.000Z");
    const schema = createAuditListQuerySchema(() => now);
    const defaults = schema.parse({});

    expect(defaults.to).toEqual(now);
    expect(defaults.from).toEqual(new Date("2026-07-29T12:00:00.000Z"));
    expect(defaults.filterNames).toEqual([]);
    expect(schema.safeParse({ from: "2026-02-30T00:00:00Z" }).success).toBe(false);
    expect(
      schema.safeParse({ from: "2025-01-01T00:00:00Z", to: "2026-08-28T00:00:00Z" }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ from: "2026-08-28T00:00:00Z", to: "2026-08-27T00:00:00Z" }).success,
    ).toBe(false);
  });
});
