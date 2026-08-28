import { AUDIT_ACTOR_KINDS, AUDIT_OUTCOMES } from "./audit.constants.js";

export function auditDescriptor({
  action,
  targetType,
  targetId,
  requestId,
  metadata,
  actorKind = AUDIT_ACTOR_KINDS.USER,
  actorUserId = null,
}) {
  return {
    action,
    outcome: AUDIT_OUTCOMES.SUCCESS,
    actorKind,
    actorUserId,
    targetType,
    targetId,
    requestId,
    metadata,
  };
}
