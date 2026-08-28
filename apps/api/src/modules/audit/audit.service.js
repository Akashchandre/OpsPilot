import { randomUUID } from "node:crypto";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_KINDS,
  AUDIT_CHAIN_HEAD_ID,
  AUDIT_OUTCOMES,
  AUDIT_TARGET_TYPES,
} from "./audit.constants.js";
import { computeAuditEventHash, verifyAuditSnapshot } from "./audit.chain.js";
import { validateAuditDescriptor } from "./audit.metadata.js";
import { presentAuditEvent } from "./audit.presenter.js";

const auditEventSelection = Object.freeze({
  id: true,
  sequence: true,
  action: true,
  outcome: true,
  actorKind: true,
  actorUserId: true,
  targetType: true,
  targetId: true,
  requestId: true,
  metadata: true,
  occurredAt: true,
  previousHash: true,
  keyId: true,
  eventHash: true,
  actor: { select: { id: true, displayName: true } },
});

export class AuditIntegrityStateError extends Error {
  constructor(code) {
    super("The audit integrity state is unavailable");
    this.name = "AuditIntegrityStateError";
    this.code = code;
  }
}

function activeIntegrityKey(config) {
  const key = Buffer.from(config.audit.integrityKey, "base64");
  if (key.length < 32) throw new AuditIntegrityStateError("AUDIT_KEY_INVALID");
  return key;
}

async function lockChainHead(transaction) {
  const rows = await transaction.$queryRawUnsafe(
    "SELECT `id` FROM `audit_chain_heads` WHERE `id` = 1 FOR UPDATE",
  );
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new AuditIntegrityStateError("AUDIT_CHAIN_HEAD_MISSING");
  }

  const head = await transaction.auditChainHead.findUnique({
    where: { id: AUDIT_CHAIN_HEAD_ID },
  });
  if (!head) throw new AuditIntegrityStateError("AUDIT_CHAIN_HEAD_MISSING");
  return head;
}

function createAppender(config, { idFactory = randomUUID, now = () => new Date() } = {}) {
  const integrityKey = activeIntegrityKey(config);
  const keyId = config.audit.integrityKeyId;

  return async function append(transaction, input) {
    const descriptor = validateAuditDescriptor(input);
    const head = await lockChainHead(transaction);
    const sequence = head.headSequence + 1n;
    const event = {
      id: idFactory(),
      sequence,
      ...descriptor,
      occurredAt: now(),
      previousHash: head.headHash,
      keyId,
    };
    const eventHash = computeAuditEventHash(event, integrityKey);

    const created = await transaction.auditEvent.create({
      data: { ...event, eventHash },
      select: auditEventSelection,
    });
    await transaction.auditChainHead.update({
      where: { id: AUDIT_CHAIN_HEAD_ID },
      data: { headSequence: sequence, headHash: eventHash },
    });

    return created;
  };
}

function buildWhere(query) {
  return {
    occurredAt: { gte: query.from, lt: query.to },
    ...(query.action ? { action: query.action } : {}),
    ...(query.outcome ? { outcome: query.outcome } : {}),
    ...(query.actorKind ? { actorKind: query.actorKind } : {}),
    ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
    ...(query.targetType ? { targetType: query.targetType } : {}),
    ...(query.targetId ? { targetId: query.targetId } : {}),
  };
}

export function createAuditService(database, config, dependencies = {}) {
  const append = createAppender(config, dependencies);
  const integrityKey = activeIntegrityKey(config);
  const keyId = config.audit.integrityKeyId;

  async function appendStandalone(input) {
    return database.$transaction((transaction) => append(transaction, input), {
      isolationLevel: "Serializable",
    });
  }

  return Object.freeze({
    append,
    appendStandalone,

    async verifyChain() {
      const snapshot = await database.$transaction(
        async (transaction) => {
          const head = await transaction.auditChainHead.findUnique({
            where: { id: AUDIT_CHAIN_HEAD_ID },
          });
          const events = await transaction.auditEvent.findMany({ orderBy: { sequence: "asc" } });
          return { head, events };
        },
        { isolationLevel: "RepeatableRead" },
      );

      return verifyAuditSnapshot({
        ...snapshot,
        resolveKey: (eventKeyId) => (eventKeyId === keyId ? integrityKey : null),
      });
    },

    async list({ actor, query, requestId }) {
      const where = buildWhere(query);
      const [events, total] = await database.$transaction([
        database.auditEvent.findMany({
          where,
          select: auditEventSelection,
          orderBy: { sequence: "desc" },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        database.auditEvent.count({ where }),
      ]);

      await appendStandalone({
        action: AUDIT_ACTIONS.AUDIT_EVENTS_READ,
        outcome: AUDIT_OUTCOMES.SUCCESS,
        actorKind: AUDIT_ACTOR_KINDS.USER,
        actorUserId: actor.id,
        targetType: AUDIT_TARGET_TYPES.AUDIT_STREAM,
        requestId,
        metadata: {
          filterNames: query.filterNames,
          page: query.page,
          limit: query.limit,
          returnedCount: events.length,
          total,
        },
      });

      return {
        events: events.map(presentAuditEvent),
        meta: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
          range: { from: query.from.toISOString(), to: query.to.toISOString() },
        },
      };
    },
  });
}
