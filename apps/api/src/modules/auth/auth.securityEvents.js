import { SECURITY_EVENT_OUTCOMES } from "./auth.constants.js";

export function recordSecurityEvent(
  database,
  {
    eventType,
    outcome = SECURITY_EVENT_OUTCOMES.SUCCESS,
    actorUserId,
    targetUserId,
    requestId,
    metadata,
  },
) {
  return database.securityEvent.create({
    data: {
      eventType,
      outcome,
      actorUserId: actorUserId ?? null,
      targetUserId: targetUserId ?? null,
      requestId: requestId ?? null,
      metadata: metadata ?? undefined,
    },
  });
}
