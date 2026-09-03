import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_KINDS,
  AUDIT_OUTCOMES,
  AUDIT_TARGET_TYPES,
} from "../audit/audit.constants.js";
import { createAuditService } from "../audit/audit.service.js";
import { AI_CONSENT_NOTICES, AI_NOTICE_VERSION, AI_PROVIDER } from "./ai.constants.js";

function compoundConsentKey(userId, assistant) {
  return {
    userId,
    provider: AI_PROVIDER,
    assistant,
    noticeVersion: AI_NOTICE_VERSION,
  };
}

function presentConsent(consent, assistant) {
  return {
    provider: AI_PROVIDER,
    assistant,
    notice: AI_CONSENT_NOTICES[assistant],
    active: Boolean(consent && !consent.revokedAt),
    consentedAt: consent?.consentedAt.toISOString() ?? null,
    revokedAt: consent?.revokedAt?.toISOString() ?? null,
  };
}

export function createAiConsentService(database, config, { now = () => new Date() } = {}) {
  const audit = createAuditService(database, config);

  async function find(transaction, userId, assistant) {
    return transaction.aiProviderConsent.findUnique({
      where: {
        userId_provider_assistant_noticeVersion: compoundConsentKey(userId, assistant),
      },
    });
  }

  async function lockUser(transaction, userId) {
    await transaction.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  }

  async function appendAudit(transaction, action, consent, userId, requestId) {
    await audit.append(transaction, {
      action,
      outcome: AUDIT_OUTCOMES.SUCCESS,
      actorKind: AUDIT_ACTOR_KINDS.USER,
      actorUserId: userId,
      targetType: AUDIT_TARGET_TYPES.AI_CONSENT,
      targetId: consent.id,
      requestId,
      metadata: {
        provider: AI_PROVIDER,
        assistant: consent.assistant,
        noticeVersion: consent.noticeVersion,
      },
    });
  }

  return Object.freeze({
    async get({ userId, assistant }) {
      const consent = await find(database, userId, assistant);
      return presentConsent(consent, assistant);
    },

    async accept({ userId, assistant, requestId }) {
      const result = await database.$transaction(
        async (transaction) => {
          await lockUser(transaction, userId);
          const existing = await find(transaction, userId, assistant);
          if (existing && !existing.revokedAt) return { consent: existing, changed: false };

          const timestamp = now();
          const consent = existing
            ? await transaction.aiProviderConsent.update({
                where: { id: existing.id },
                data: { consentedAt: timestamp, revokedAt: null },
              })
            : await transaction.aiProviderConsent.create({
                data: {
                  userId,
                  provider: AI_PROVIDER,
                  assistant,
                  noticeVersion: AI_NOTICE_VERSION,
                  consentedAt: timestamp,
                },
              });
          await appendAudit(
            transaction,
            AUDIT_ACTIONS.AI_CONSENT_ACCEPTED,
            consent,
            userId,
            requestId,
          );
          return { consent, changed: true };
        },
        { isolationLevel: "Serializable" },
      );
      return { consent: presentConsent(result.consent, assistant), changed: result.changed };
    },

    async revoke({ userId, assistant, requestId }) {
      const result = await database.$transaction(
        async (transaction) => {
          await lockUser(transaction, userId);
          const existing = await find(transaction, userId, assistant);
          if (!existing || existing.revokedAt) return { consent: existing, changed: false };

          const consent = await transaction.aiProviderConsent.update({
            where: { id: existing.id },
            data: { revokedAt: now() },
          });
          await appendAudit(
            transaction,
            AUDIT_ACTIONS.AI_CONSENT_REVOKED,
            consent,
            userId,
            requestId,
          );
          return { consent, changed: true };
        },
        { isolationLevel: "Serializable" },
      );
      return { consent: presentConsent(result.consent, assistant), changed: result.changed };
    },
  });
}
