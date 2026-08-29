import {
  ORDER_EVENT_SOURCES,
  ORDER_STATUSES,
  PAYMENT_ATTEMPT_STATUSES,
  PAYMENT_STATUSES,
  REFUND_STATUSES,
} from "../commerce/commerce.constants.js";
import { AUDIT_ACTIONS, AUDIT_ACTOR_KINDS, AUDIT_TARGET_TYPES } from "../audit/audit.constants.js";
import { auditDescriptor } from "../audit/audit.descriptor.js";
import { createAuditService } from "../audit/audit.service.js";
import {
  commerceError,
  commerceNotFound,
  idempotencyConflict,
  isPrismaUniqueViolation,
  isPrismaWriteConflict,
} from "../commerce/commerce.errors.js";
import { digestRequest, moneyToSubunits } from "../commerce/commerce.money.js";
import { JOB_TYPES } from "../jobs/jobs.constants.js";
import { enqueueJob } from "../jobs/jobs.queue.js";
import { orderDetailInclude, presentOrder, presentPayment } from "../orders/orders.presenter.js";
import { applyProviderPayment, applyProviderRefund, markPaymentReview } from "./payments.state.js";
import { verifyCheckoutSignature } from "./razorpay.signatures.js";

const paymentDetailInclude = Object.freeze({
  order: { select: { id: true, orderNumber: true, status: true, userId: true } },
  attempts: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
  refunds: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
});

function providerCode(error) {
  return typeof error?.code === "string" && error.code.startsWith("PAYMENT_PROVIDER_")
    ? error.code
    : "PAYMENT_PROVIDER_UNAVAILABLE";
}

function presentPaymentDetail(payment) {
  return {
    ...presentPayment(payment),
    order: {
      id: payment.order.id,
      orderNumber: payment.order.orderNumber,
      status: payment.order.status,
    },
  };
}

function paymentEntityStatus(entity) {
  if (entity?.status === "captured") return "payment.captured";
  if (entity?.status === "authorized") return "payment.authorized";
  if (entity?.status === "failed") return "payment.failed";
  return null;
}

function refundEntityStatus(entity) {
  if (entity?.status === "processed") return "refund.processed";
  if (entity?.status === "failed") return "refund.failed";
  return "refund.created";
}

function providerOrderMatches(payment, providerOrder) {
  return (
    providerOrder &&
    providerOrder.id === payment.providerOrderId &&
    Number.isSafeInteger(providerOrder.amount) &&
    providerOrder.amount === moneyToSubunits(payment.amount) &&
    providerOrder.currency === payment.currency &&
    providerOrder.receipt === payment.providerReceipt &&
    ["created", "attempted", "paid"].includes(providerOrder.status)
  );
}

async function loadPayment(database, paymentId) {
  return database.payment.findUnique({
    where: { id: paymentId },
    include: paymentDetailInclude,
  });
}

async function applyFetchedPayment(
  database,
  config,
  paymentId,
  entity,
  source,
  requestId,
  appendAudit,
  actorUserId = null,
) {
  const eventType = paymentEntityStatus(entity);
  return database.$transaction(
    async (transaction) => {
      const before = await transaction.payment.findUnique({
        where: { id: paymentId },
        include: { order: true },
      });
      const result = await applyProviderPayment(transaction, paymentId, entity, {
        eventType,
        source,
        requestId,
      });
      const payment = await transaction.payment.findUnique({
        where: { id: paymentId },
        include: { order: true },
      });
      const auditEvent = await appendAudit(
        transaction,
        auditDescriptor({
          action: AUDIT_ACTIONS.PAYMENT_PROVIDER_STATE_APPLIED,
          actorKind: actorUserId ? AUDIT_ACTOR_KINDS.USER : AUDIT_ACTOR_KINDS.PROVIDER,
          actorUserId,
          targetType: AUDIT_TARGET_TYPES.PAYMENT,
          targetId: paymentId,
          requestId,
          metadata: {
            source,
            paymentStatus: payment?.status ?? null,
            orderStatus: payment?.order?.status ?? null,
          },
        }),
      );
      if (before && payment && before.status !== payment.status) {
        await enqueueJob(transaction, config, {
          type: JOB_TYPES.NOTIFICATION_PAYMENT_STATUS_CHANGED,
          dedupeKey: `payment-status:${auditEvent.id}`,
          payload: { sourceEventId: auditEvent.id, paymentId },
          sourceRequestId: requestId,
          sourceActorUserId: actorUserId,
        });
      }
      if (before && payment && before.order.status !== payment.order.status) {
        const orderEvent = await transaction.orderStatusEvent.findFirst({
          where: { orderId: payment.order.id, requestId, toStatus: payment.order.status },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        if (orderEvent) {
          await enqueueJob(transaction, config, {
            type: JOB_TYPES.NOTIFICATION_ORDER_STATUS_CHANGED,
            dedupeKey: `order-status:${orderEvent.id}`,
            payload: { sourceEventId: orderEvent.id, orderId: payment.order.id },
            sourceRequestId: requestId,
            sourceActorUserId: actorUserId,
          });
        }
      }
      return result;
    },
    { isolationLevel: "Serializable" },
  );
}

async function applyFetchedRefund(
  database,
  config,
  entity,
  source,
  requestId,
  appendAudit,
  actorUserId = null,
) {
  return database.$transaction(
    async (transaction) => {
      const priorRefund =
        typeof entity?.id === "string"
          ? await transaction.refund.findUnique({ where: { providerRefundId: entity.id } })
          : null;
      const priorAttempt =
        typeof entity?.payment_id === "string"
          ? await transaction.paymentAttempt.findUnique({
              where: { providerPaymentId: entity.payment_id },
              include: { payment: { include: { order: true } } },
            })
          : null;
      const pendingRefund =
        priorRefund ??
        (priorAttempt
          ? await transaction.refund.findFirst({
              where: {
                paymentId: priorAttempt.paymentId,
                paymentAttemptId: priorAttempt.id,
                providerRefundId: null,
                status: REFUND_STATUSES.PENDING,
              },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            })
          : null);
      const result = await applyProviderRefund(transaction, entity, {
        eventType: refundEntityStatus(entity),
        source,
        requestId,
      });
      if (result.refund) {
        const auditEvent = await appendAudit(
          transaction,
          auditDescriptor({
            action: AUDIT_ACTIONS.REFUND_PROVIDER_STATE_APPLIED,
            actorKind: actorUserId ? AUDIT_ACTOR_KINDS.USER : AUDIT_ACTOR_KINDS.PROVIDER,
            actorUserId,
            targetType: AUDIT_TARGET_TYPES.REFUND,
            targetId: result.refund.id,
            requestId,
            metadata: { source, refundStatus: result.refund.status },
          }),
        );
        if (!pendingRefund || pendingRefund.status !== result.refund.status) {
          await enqueueJob(transaction, config, {
            type: JOB_TYPES.NOTIFICATION_REFUND_STATUS_CHANGED,
            dedupeKey: `refund-status:${auditEvent.id}`,
            payload: { sourceEventId: auditEvent.id, refundId: result.refund.id },
            sourceRequestId: requestId,
            sourceActorUserId: actorUserId,
          });
        }
        const currentPayment = await transaction.payment.findUnique({
          where: { id: result.refund.paymentId },
          include: { order: true },
        });
        if (
          priorAttempt?.payment &&
          currentPayment &&
          priorAttempt.payment.status !== currentPayment.status
        ) {
          await enqueueJob(transaction, config, {
            type: JOB_TYPES.NOTIFICATION_PAYMENT_STATUS_CHANGED,
            dedupeKey: `payment-status:${auditEvent.id}`,
            payload: { sourceEventId: auditEvent.id, paymentId: currentPayment.id },
            sourceRequestId: requestId,
            sourceActorUserId: actorUserId,
          });
        }
        if (
          priorAttempt?.payment?.order &&
          currentPayment &&
          priorAttempt.payment.order.status !== currentPayment.order.status
        ) {
          const orderEvent = await transaction.orderStatusEvent.findFirst({
            where: {
              orderId: currentPayment.order.id,
              requestId,
              toStatus: currentPayment.order.status,
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          });
          if (orderEvent) {
            await enqueueJob(transaction, config, {
              type: JOB_TYPES.NOTIFICATION_ORDER_STATUS_CHANGED,
              dedupeKey: `order-status:${orderEvent.id}`,
              payload: { sourceEventId: orderEvent.id, orderId: currentPayment.order.id },
              sourceRequestId: requestId,
              sourceActorUserId: actorUserId,
            });
          }
        }
      }
      return result;
    },
    { isolationLevel: "Serializable" },
  );
}

function mapWriteError(error) {
  if (error?.isOperational) throw error;
  if (isPrismaWriteConflict(error)) {
    throw commerceError(
      409,
      "PAYMENT_CONFLICT",
      "Payment state changed while the request was being processed. Refresh and try again.",
    );
  }
  throw error;
}

async function enqueuePaymentTransitions(
  transaction,
  config,
  { before, after, sourceEventId, requestId, actorUserId = null },
) {
  if (!before || !after) return;
  if (before.status !== after.status) {
    await enqueueJob(transaction, config, {
      type: JOB_TYPES.NOTIFICATION_PAYMENT_STATUS_CHANGED,
      dedupeKey: `payment-status:${sourceEventId}`,
      payload: { sourceEventId, paymentId: after.id },
      sourceRequestId: requestId,
      sourceActorUserId: actorUserId,
    });
  }
  if (before.order.status !== after.order.status) {
    const orderEvent = await transaction.orderStatusEvent.findFirst({
      where: { orderId: after.order.id, requestId, toStatus: after.order.status },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (orderEvent) {
      await enqueueJob(transaction, config, {
        type: JOB_TYPES.NOTIFICATION_ORDER_STATUS_CHANGED,
        dedupeKey: `order-status:${orderEvent.id}`,
        payload: { sourceEventId: orderEvent.id, orderId: after.order.id },
        sourceRequestId: requestId,
        sourceActorUserId: actorUserId,
      });
    }
  }
}

export function createPaymentsService(database, config, paymentProvider) {
  const appendAudit = createAuditService(database, config).append;
  return {
    async confirm({ userId, input, requestId }) {
      const payment = await database.payment.findFirst({
        where: { providerOrderId: input.providerOrderId, order: { userId } },
        include: { order: true },
      });
      if (!payment || payment.order.id !== input.orderId) throw commerceNotFound("PAYMENT");
      if (payment.status === PAYMENT_STATUSES.REFUNDED) {
        throw commerceError(409, "PAYMENT_NOT_CONFIRMABLE", "This payment cannot be confirmed");
      }

      const validSignature = verifyCheckoutSignature({
        providerOrderId: payment.providerOrderId,
        providerPaymentId: input.providerPaymentId,
        signature: input.signature,
        secret: config.payments.razorpay.keySecret,
      });
      if (!validSignature) {
        throw commerceError(
          422,
          "PAYMENT_CONFIRMATION_INVALID",
          "The payment confirmation could not be verified",
        );
      }

      let providerPayment;
      try {
        providerPayment = await paymentProvider.fetchPayment(input.providerPaymentId);
      } catch (error) {
        const order = await database.order.findUnique({
          where: { id: payment.orderId },
          include: orderDetailInclude,
        });
        return {
          order: presentOrder(order),
          confirmationPending: true,
          providerCode: providerCode(error),
        };
      }

      try {
        await applyFetchedPayment(
          database,
          config,
          payment.id,
          providerPayment,
          ORDER_EVENT_SOURCES.PROVIDER,
          requestId,
          appendAudit,
          userId,
        );
      } catch (error) {
        mapWriteError(error);
      }
      const order = await database.order.findUnique({
        where: { id: payment.orderId },
        include: orderDetailInclude,
      });
      return {
        order: presentOrder(order),
        confirmationPending: order.status === ORDER_STATUSES.PENDING_PAYMENT,
        providerCode: null,
      };
    },

    async get({ userId, paymentId, canReadAll }) {
      const payment = await loadPayment(database, paymentId);
      if (!payment || (!canReadAll && payment.order.userId !== userId)) {
        throw commerceNotFound("PAYMENT");
      }
      return presentPaymentDetail(payment);
    },

    async refund({ actorUserId, paymentId, idempotencyKey, requestId }) {
      const requestHash = digestRequest({ action: "FULL_REFUND", paymentId });
      let refund;
      try {
        refund = await database.$transaction(
          async (transaction) => {
            const payment = await transaction.payment.findUnique({
              where: { id: paymentId },
              include: {
                order: true,
                attempts: {
                  where: { status: PAYMENT_ATTEMPT_STATUSES.CAPTURED },
                  orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                },
                refunds: true,
              },
            });
            if (!payment) throw commerceNotFound("PAYMENT");

            const idempotent = payment.refunds.find(
              (candidate) => candidate.idempotencyKey === idempotencyKey,
            );
            if (idempotent) {
              if (idempotent.requestHash !== requestHash) throw idempotencyConflict();
              return idempotent;
            }
            if (payment.refunds.some((candidate) => candidate.status === REFUND_STATUSES.PENDING)) {
              throw commerceError(
                409,
                "REFUND_ALREADY_PENDING",
                "A refund is already pending for this payment",
              );
            }
            if (
              ![PAYMENT_STATUSES.REFUND_PENDING, PAYMENT_STATUSES.REVIEW_REQUIRED].includes(
                payment.status,
              ) ||
              ![ORDER_STATUSES.CANCELLED, ORDER_STATUSES.PAYMENT_REVIEW].includes(
                payment.order.status,
              )
            ) {
              throw commerceError(
                409,
                "REFUND_NOT_ALLOWED",
                "This payment is not eligible for a refund",
              );
            }
            if (payment.attempts.length !== 1) {
              throw commerceError(
                409,
                "REFUND_CAPTURE_STATE_INVALID",
                "A single captured payment is required for a refund",
              );
            }

            const created = await transaction.refund.create({
              data: {
                paymentId: payment.id,
                paymentAttemptId: payment.attempts[0].id,
                amount: payment.amount,
                currency: payment.currency,
                idempotencyKey,
                requestHash,
                actorUserId,
              },
            });
            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.REFUND_REQUESTED,
                actorUserId,
                targetType: AUDIT_TARGET_TYPES.REFUND,
                targetId: created.id,
                requestId,
                metadata: {
                  paymentStatus: payment.status,
                  orderStatus: payment.order.status,
                  currency: payment.currency,
                },
              }),
            );
            await enqueueJob(transaction, config, {
              type: JOB_TYPES.NOTIFICATION_REFUND_STATUS_CHANGED,
              dedupeKey: `refund-status:${created.id}`,
              payload: { sourceEventId: created.id, refundId: created.id },
              sourceRequestId: requestId,
              sourceActorUserId: actorUserId,
            });
            return created;
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        if (isPrismaUniqueViolation(error)) {
          const raced = await database.refund.findUnique({
            where: { paymentId_idempotencyKey: { paymentId, idempotencyKey } },
          });
          if (raced?.requestHash === requestHash) refund = raced;
          else if (raced) throw idempotencyConflict();
          else mapWriteError(error);
        } else {
          mapWriteError(error);
        }
      }

      const attempt = await database.paymentAttempt.findUnique({
        where: { id: refund.paymentAttemptId },
      });
      let providerRefund;
      let failureCode = null;
      try {
        providerRefund = refund.providerRefundId
          ? await paymentProvider.fetchRefund(refund.providerRefundId)
          : await paymentProvider.createRefund(attempt.providerPaymentId, {
              amountSubunits: moneyToSubunits(refund.amount),
              idempotencyKey,
            });
      } catch (error) {
        failureCode = providerCode(error);
        if (!error?.ambiguous) {
          await database.$transaction(
            async (transaction) => {
              const update = await transaction.refund.updateMany({
                where: { id: refund.id, status: REFUND_STATUSES.PENDING },
                data: { status: REFUND_STATUSES.FAILED, failureCode },
              });
              if (update.count === 1) {
                const auditEvent = await appendAudit(
                  transaction,
                  auditDescriptor({
                    action: AUDIT_ACTIONS.REFUND_PROVIDER_STATE_APPLIED,
                    actorKind: AUDIT_ACTOR_KINDS.PROVIDER,
                    targetType: AUDIT_TARGET_TYPES.REFUND,
                    targetId: refund.id,
                    requestId,
                    metadata: { source: "PROVIDER", refundStatus: REFUND_STATUSES.FAILED },
                  }),
                );
                await enqueueJob(transaction, config, {
                  type: JOB_TYPES.NOTIFICATION_REFUND_STATUS_CHANGED,
                  dedupeKey: `refund-status:${auditEvent.id}`,
                  payload: { sourceEventId: auditEvent.id, refundId: refund.id },
                  sourceRequestId: requestId,
                });
              }
            },
            { isolationLevel: "Serializable" },
          );
        }
      }

      if (providerRefund) {
        try {
          await applyFetchedRefund(
            database,
            config,
            providerRefund,
            ORDER_EVENT_SOURCES.PROVIDER,
            requestId,
            appendAudit,
          );
        } catch (error) {
          mapWriteError(error);
        }
      }

      const refreshed = await database.refund.findUnique({ where: { id: refund.id } });
      return {
        refund: {
          id: refreshed.id,
          status: refreshed.status,
          amount: String(refreshed.amount),
          currency: refreshed.currency,
          providerRefundId: refreshed.providerRefundId,
          failureCode: refreshed.failureCode,
          createdAt: refreshed.createdAt,
          updatedAt: refreshed.updatedAt,
        },
        providerCode: failureCode,
      };
    },

    async reconcile({ actorUserId, paymentId, requestId }) {
      const payment = await loadPayment(database, paymentId);
      if (!payment) throw commerceNotFound("PAYMENT");
      if (!payment.providerOrderId) {
        throw commerceError(
          409,
          "PAYMENT_PROVIDER_ORDER_MISSING",
          "This payment does not yet have a provider order",
        );
      }

      let providerOrder;
      let providerPayments;
      try {
        [providerOrder, providerPayments] = await Promise.all([
          paymentProvider.fetchOrder(payment.providerOrderId),
          paymentProvider.fetchPaymentsForOrder(payment.providerOrderId),
        ]);
      } catch (error) {
        throw commerceError(503, providerCode(error), "Payment reconciliation is unavailable");
      }

      if (!providerOrderMatches(payment, providerOrder)) {
        await database.$transaction(
          async (transaction) => {
            const current = await transaction.payment.findUnique({
              where: { id: payment.id },
              include: { order: true },
            });
            if (current) {
              await markPaymentReview(transaction, current, {
                source: ORDER_EVENT_SOURCES.RECONCILIATION,
                reasonCode: "PROVIDER_ORDER_MISMATCH",
                requestId,
              });
              const refreshed = await transaction.payment.findUnique({
                where: { id: payment.id },
                include: { order: true },
              });
              const auditEvent = await appendAudit(
                transaction,
                auditDescriptor({
                  action: AUDIT_ACTIONS.PAYMENT_RECONCILED,
                  actorUserId,
                  targetType: AUDIT_TARGET_TYPES.PAYMENT,
                  targetId: payment.id,
                  requestId,
                  metadata: {
                    paymentStatus: refreshed?.status ?? null,
                    orderStatus: refreshed?.order?.status ?? null,
                    observedPaymentCount: Array.isArray(providerPayments?.items)
                      ? providerPayments.items.length
                      : 0,
                    observedRefundCount: 0,
                  },
                }),
              );
              await enqueuePaymentTransitions(transaction, config, {
                before: current,
                after: refreshed,
                sourceEventId: auditEvent.id,
                requestId,
                actorUserId,
              });
            }
          },
          { isolationLevel: "Serializable" },
        );
      } else {
        const entities = Array.isArray(providerPayments?.items) ? providerPayments.items : [];
        for (const entity of entities) {
          await applyFetchedPayment(
            database,
            config,
            payment.id,
            entity,
            ORDER_EVENT_SOURCES.RECONCILIATION,
            requestId,
            appendAudit,
            actorUserId,
          );
        }

        if (providerOrder.status === "paid") {
          await database.$transaction(
            async (transaction) => {
              const current = await transaction.payment.findUnique({
                where: { id: payment.id },
                include: { order: true },
              });
              if (
                current &&
                [PAYMENT_STATUSES.CREATING, PAYMENT_STATUSES.OPEN].includes(current.status)
              ) {
                await markPaymentReview(transaction, current, {
                  source: ORDER_EVENT_SOURCES.RECONCILIATION,
                  reasonCode: "PAID_ORDER_WITHOUT_VERIFIED_CAPTURE",
                  requestId,
                });
                const refreshed = await transaction.payment.findUnique({
                  where: { id: payment.id },
                  include: { order: true },
                });
                const auditEvent = await appendAudit(
                  transaction,
                  auditDescriptor({
                    action: AUDIT_ACTIONS.PAYMENT_PROVIDER_STATE_APPLIED,
                    actorUserId,
                    targetType: AUDIT_TARGET_TYPES.PAYMENT,
                    targetId: payment.id,
                    requestId,
                    metadata: {
                      source: "RECONCILIATION",
                      paymentStatus: refreshed?.status ?? null,
                      orderStatus: refreshed?.order?.status ?? null,
                    },
                  }),
                );
                await enqueuePaymentTransitions(transaction, config, {
                  before: current,
                  after: refreshed,
                  sourceEventId: auditEvent.id,
                  requestId,
                  actorUserId,
                });
              }
            },
            { isolationLevel: "Serializable" },
          );
        }

        const knownRefunds = await database.refund.findMany({
          where: { paymentId: payment.id, providerRefundId: { not: null } },
          select: { providerRefundId: true },
        });
        for (const knownRefund of knownRefunds) {
          try {
            const entity = await paymentProvider.fetchRefund(knownRefund.providerRefundId);
            await applyFetchedRefund(
              database,
              config,
              entity,
              ORDER_EVENT_SOURCES.RECONCILIATION,
              requestId,
              appendAudit,
              actorUserId,
            );
          } catch (error) {
            throw commerceError(503, providerCode(error), "Payment reconciliation is incomplete");
          }
        }

        await database.$transaction(
          async (transaction) => {
            await transaction.payment.updateMany({
              where: { id: payment.id },
              data: { providerOrderStatus: providerOrder.status },
            });
            const refreshed = await transaction.payment.findUnique({
              where: { id: payment.id },
              include: { order: true },
            });
            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.PAYMENT_RECONCILED,
                actorUserId,
                targetType: AUDIT_TARGET_TYPES.PAYMENT,
                targetId: payment.id,
                requestId,
                metadata: {
                  paymentStatus: refreshed?.status ?? null,
                  orderStatus: refreshed?.order?.status ?? null,
                  observedPaymentCount: entities.length,
                  observedRefundCount: knownRefunds.length,
                },
              }),
            );
          },
          { isolationLevel: "Serializable" },
        );
      }

      return presentPaymentDetail(await loadPayment(database, payment.id));
    },
  };
}
