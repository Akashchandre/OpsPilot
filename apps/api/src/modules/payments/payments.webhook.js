import { createHash } from "node:crypto";
import { AUDIT_ACTIONS, AUDIT_ACTOR_KINDS, AUDIT_TARGET_TYPES } from "../audit/audit.constants.js";
import { auditDescriptor } from "../audit/audit.descriptor.js";
import { createAuditService } from "../audit/audit.service.js";
import {
  PROVIDER_WEBHOOK_STATUSES,
  RAZORPAY_PROVIDER,
  RAZORPAY_WEBHOOK_EVENTS,
} from "../commerce/commerce.constants.js";
import { commerceError, isPrismaUniqueViolation } from "../commerce/commerce.errors.js";
import { applyProviderPayment, applyProviderRefund } from "./payments.state.js";
import { verifyWebhookSignature } from "./razorpay.signatures.js";

const providerEventIdPattern = /^[A-Za-z0-9_.:-]{1,100}$/;
const paymentEvents = new Set([
  "payment.authorized",
  "payment.captured",
  "payment.failed",
  "order.paid",
]);
const refundEvents = new Set(["refund.created", "refund.processed", "refund.failed"]);

function webhookError(statusCode, code, message) {
  return commerceError(statusCode, code, message);
}

function parsePayload(rawBody) {
  try {
    const payload = JSON.parse(rawBody.toString("utf8"));
    if (!payload || Array.isArray(payload) || typeof payload !== "object") throw new Error();
    return payload;
  } catch {
    throw webhookError(400, "WEBHOOK_PAYLOAD_INVALID", "The webhook payload is invalid");
  }
}

function providerTimestamp(value) {
  return Number.isSafeInteger(value) && value > 0 ? new Date(value * 1000) : null;
}

function sameEvent(existing, bodyDigest) {
  if (existing.bodyDigest !== bodyDigest) {
    throw webhookError(
      409,
      "WEBHOOK_EVENT_CONFLICT",
      "The provider event ID was reused with different content",
    );
  }
  return {
    accepted: true,
    duplicate: true,
    status: existing.status,
    safeCode: existing.safeCode,
  };
}

async function applyEvent(transaction, eventType, payload, requestId) {
  if (!RAZORPAY_WEBHOOK_EVENTS.includes(eventType)) {
    return {
      status: PROVIDER_WEBHOOK_STATUSES.IGNORED,
      safeCode: "EVENT_NOT_ALLOWLISTED",
      paymentId: null,
    };
  }

  if (paymentEvents.has(eventType)) {
    const entity = payload.payload?.payment?.entity;
    if (!entity || Array.isArray(entity) || typeof entity !== "object") {
      return {
        status: PROVIDER_WEBHOOK_STATUSES.REVIEW_REQUIRED,
        safeCode: "PAYMENT_ENTITY_INVALID",
        paymentId: null,
      };
    }

    let payment = null;
    if (typeof entity.order_id === "string") {
      payment = await transaction.payment.findUnique({
        where: { providerOrderId: entity.order_id },
      });
    }
    if (!payment && typeof entity.id === "string") {
      const attempt = await transaction.paymentAttempt.findUnique({
        where: { providerPaymentId: entity.id },
      });
      if (attempt)
        payment = await transaction.payment.findUnique({ where: { id: attempt.paymentId } });
    }
    if (!payment) {
      return {
        status: PROVIDER_WEBHOOK_STATUSES.IGNORED,
        safeCode: "PAYMENT_UNKNOWN",
        paymentId: null,
      };
    }

    const result = await applyProviderPayment(transaction, payment.id, entity, {
      eventType,
      requestId,
    });
    return { ...result, paymentId: payment.id };
  }

  if (refundEvents.has(eventType)) {
    const entity = payload.payload?.refund?.entity;
    if (!entity || Array.isArray(entity) || typeof entity !== "object") {
      return {
        status: PROVIDER_WEBHOOK_STATUSES.REVIEW_REQUIRED,
        safeCode: "REFUND_ENTITY_INVALID",
        paymentId: null,
      };
    }
    return applyProviderRefund(transaction, entity, { eventType, requestId });
  }

  return {
    status: PROVIDER_WEBHOOK_STATUSES.IGNORED,
    safeCode: "EVENT_NOT_ALLOWLISTED",
    paymentId: null,
  };
}

export function createRazorpayWebhookService(database, config) {
  const appendAudit = createAuditService(database, config).append;
  return {
    async handle({ rawBody, signature, providerEventId, requestId }) {
      if (!config.payments.razorpay.enabled) {
        throw webhookError(503, "PAYMENT_PROVIDER_NOT_CONFIGURED", "Webhooks are unavailable");
      }
      if (!Buffer.isBuffer(rawBody)) {
        throw webhookError(415, "WEBHOOK_CONTENT_TYPE_INVALID", "A JSON webhook body is required");
      }
      if (!providerEventIdPattern.test(providerEventId ?? "")) {
        throw webhookError(400, "WEBHOOK_EVENT_ID_INVALID", "The provider event ID is invalid");
      }
      if (
        !verifyWebhookSignature({
          rawBody,
          signature,
          secret: config.payments.razorpay.webhookSecret,
        })
      ) {
        throw webhookError(401, "WEBHOOK_SIGNATURE_INVALID", "The webhook signature is invalid");
      }

      const bodyDigest = createHash("sha256").update(rawBody).digest("hex");
      const prior = await database.providerWebhookEvent.findUnique({
        where: {
          provider_providerEventId: { provider: RAZORPAY_PROVIDER, providerEventId },
        },
      });
      if (prior) return sameEvent(prior, bodyDigest);

      const payload = parsePayload(rawBody);
      const eventType = typeof payload.event === "string" ? payload.event : "INVALID";
      try {
        return await database.$transaction(
          async (transaction) => {
            const existing = await transaction.providerWebhookEvent.findUnique({
              where: {
                provider_providerEventId: {
                  provider: RAZORPAY_PROVIDER,
                  providerEventId,
                },
              },
            });
            if (existing) return sameEvent(existing, bodyDigest);

            const result = await applyEvent(transaction, eventType, payload, requestId);
            await transaction.providerWebhookEvent.create({
              data: {
                provider: RAZORPAY_PROVIDER,
                providerEventId,
                eventType,
                bodyDigest,
                status: result.status,
                paymentId: result.paymentId,
                safeCode: result.safeCode,
                providerCreatedAt: providerTimestamp(payload.created_at),
                processedAt: new Date(),
              },
            });
            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.PAYMENT_WEBHOOK_PROCESSED,
                actorKind: AUDIT_ACTOR_KINDS.PROVIDER,
                targetType: AUDIT_TARGET_TYPES.PROVIDER_WEBHOOK_EVENT,
                targetId: providerEventId,
                requestId,
                metadata: {
                  eventType,
                  status: result.status,
                  safeCode: result.safeCode ?? null,
                  paymentMatched: Boolean(result.paymentId),
                },
              }),
            );
            return {
              accepted: true,
              duplicate: false,
              status: result.status,
              safeCode: result.safeCode,
            };
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        if (!isPrismaUniqueViolation(error)) throw error;
        const raced = await database.providerWebhookEvent.findUnique({
          where: {
            provider_providerEventId: { provider: RAZORPAY_PROVIDER, providerEventId },
          },
        });
        if (!raced) throw error;
        return sameEvent(raced, bodyDigest);
      }
    },
  };
}
