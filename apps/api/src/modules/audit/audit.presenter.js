export function presentAuditEvent(event) {
  return {
    id: event.id,
    sequence: event.sequence.toString(),
    action: event.action,
    outcome: event.outcome,
    actorKind: event.actorKind,
    actorUserId: event.actorUserId,
    actor: event.actor
      ? {
          id: event.actor.id,
          displayName: event.actor.displayName,
        }
      : null,
    targetType: event.targetType,
    targetId: event.targetId,
    requestId: event.requestId,
    metadata: event.metadata ?? null,
    occurredAt: event.occurredAt.toISOString(),
    previousHash: event.previousHash,
    keyId: event.keyId,
    eventHash: event.eventHash,
  };
}
