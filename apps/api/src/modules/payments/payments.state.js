import {
  ORDER_EVENT_SOURCES,
  ORDER_STATUSES,
  PAYMENT_ATTEMPT_PRIORITY,
  PAYMENT_ATTEMPT_STATUSES,
  PAYMENT_STATUSES,
  PROVIDER_WEBHOOK_STATUSES,
  REFUND_STATUSES,
} from "../commerce/commerce.constants.js";
import { commerceError, commerceVersionConflict } from "../commerce/commerce.errors.js";
import { moneyToSubunits, subunitsToMoney } from "../commerce/commerce.money.js";
import { consumeReservations, releaseReservations } from "../orders/reservation.service.js";

const providerPaymentIdPattern = /^pay_[A-Za-z0-9_]{1,60}$/;
const providerRefundIdPattern = /^rfnd_[A-Za-z0-9_]{1,59}$/;

function safeProviderTimestamp(value) {
  return Number.isSafeInteger(value) && value > 0 ? new Date(value * 1000) : null;
}

function safeFailureCode(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(value) ? value : null;
}

function paymentAttemptStatus(entity, eventType) {
  if (eventType === "payment.authorized") return PAYMENT_ATTEMPT_STATUSES.AUTHORIZED;
  if (eventType === "payment.captured" || eventType === "order.paid") {
    return PAYMENT_ATTEMPT_STATUSES.CAPTURED;
  }
  if (eventType === "payment.failed") return PAYMENT_ATTEMPT_STATUSES.FAILED;
  if (entity.status === "captured") return PAYMENT_ATTEMPT_STATUSES.CAPTURED;
  if (entity.status === "authorized") return PAYMENT_ATTEMPT_STATUSES.AUTHORIZED;
  if (entity.status === "failed") return PAYMENT_ATTEMPT_STATUSES.FAILED;
  return null;
}

function refundStatus(entity, eventType) {
  if (eventType === "refund.processed") return REFUND_STATUSES.PROCESSED;
  if (eventType === "refund.failed") return REFUND_STATUSES.FAILED;
  if (eventType === "refund.created") return REFUND_STATUSES.PENDING;
  if (entity.status === "processed") return REFUND_STATUSES.PROCESSED;
  if (entity.status === "failed") return REFUND_STATUSES.FAILED;
  if (entity.status === "pending") return REFUND_STATUSES.PENDING;
  return null;
}

async function appendOrderTransition(
  transaction,
  { order, toStatus, source, reasonCode, actorUserId = null, requestId = null, now },
) {
  if (order.status === toStatus) return order;
  const timestampFields = {
    [ORDER_STATUSES.CONFIRMED]: { confirmedAt: now },
    [ORDER_STATUSES.CANCELLED]: { cancelledAt: now },
  };
  const update = await transaction.order.updateMany({
    where: { id: order.id, version: order.version, status: order.status },
    data: {
      status: toStatus,
      ...(timestampFields[toStatus] ?? {}),
      version: { increment: 1 },
    },
  });
  if (update.count !== 1) throw commerceVersionConflict();
  await transaction.orderStatusEvent.create({
    data: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus,
      source,
      reasonCode,
      actorUserId,
      requestId,
    },
  });
  return { ...order, status: toStatus, version: order.version + 1 };
}

export async function markPaymentReview(
  transaction,
  payment,
  { source, reasonCode, requestId = null, now = new Date() },
) {
  if (payment.status !== PAYMENT_STATUSES.REVIEW_REQUIRED) {
    const paymentUpdate = await transaction.payment.updateMany({
      where: { id: payment.id, version: payment.version },
      data: { status: PAYMENT_STATUSES.REVIEW_REQUIRED, version: { increment: 1 } },
    });
    if (paymentUpdate.count !== 1) throw commerceVersionConflict();
    payment = {
      ...payment,
      status: PAYMENT_STATUSES.REVIEW_REQUIRED,
      version: payment.version + 1,
    };
  }

  if (
    [
      ORDER_STATUSES.PENDING_PAYMENT,
      ORDER_STATUSES.CONFIRMED,
      ORDER_STATUSES.CANCELLED,
      ORDER_STATUSES.EXPIRED,
    ].includes(payment.order.status)
  ) {
    payment.order = await appendOrderTransition(transaction, {
      order: payment.order,
      toStatus: ORDER_STATUSES.PAYMENT_REVIEW,
      source,
      reasonCode,
      requestId,
      now,
    });
  }
  return payment;
}

async function upsertPaymentAttempt(transaction, payment, entity, status) {
  const existing = await transaction.paymentAttempt.findUnique({
    where: { providerPaymentId: entity.id },
  });
  if (existing && existing.paymentId !== payment.id) {
    return { conflict: true, attempt: existing };
  }

  const providerCreatedAt = safeProviderTimestamp(entity.created_at);
  const failureCode = safeFailureCode(entity.error_code ?? entity.error_reason);
  if (!existing) {
    const attempt = await transaction.paymentAttempt.create({
      data: {
        paymentId: payment.id,
        providerPaymentId: entity.id,
        status,
        amount: subunitsToMoney(entity.amount),
        currency: entity.currency,
        failureCode,
        providerCreatedAt,
      },
    });
    return { conflict: false, attempt };
  }

  if (PAYMENT_ATTEMPT_PRIORITY[status] > PAYMENT_ATTEMPT_PRIORITY[existing.status]) {
    const attempt = await transaction.paymentAttempt.update({
      where: { id: existing.id },
      data: {
        status,
        failureCode,
        providerCreatedAt: providerCreatedAt ?? existing.providerCreatedAt,
      },
    });
    return { conflict: false, attempt };
  }
  return { conflict: false, attempt: existing };
}

function exactPaymentMatch(payment, entity) {
  return (
    providerPaymentIdPattern.test(entity.id ?? "") &&
    entity.order_id === payment.providerOrderId &&
    Number.isSafeInteger(entity.amount) &&
    entity.amount === moneyToSubunits(payment.amount) &&
    entity.currency === payment.currency
  );
}

export async function applyProviderPayment(
  transaction,
  paymentId,
  entity,
  {
    eventType = null,
    source = ORDER_EVENT_SOURCES.PROVIDER,
    requestId = null,
    now = new Date(),
  } = {},
) {
  let payment = await transaction.payment.findUnique({
    where: { id: paymentId },
    include: { order: true },
  });
  if (!payment) throw commerceError(404, "PAYMENT_NOT_FOUND", "Payment was not found");

  const status = paymentAttemptStatus(entity, eventType);
  if (!status || !exactPaymentMatch(payment, entity)) {
    await markPaymentReview(transaction, payment, {
      source,
      reasonCode: "PROVIDER_PAYMENT_MISMATCH",
      requestId,
      now,
    });
    return {
      status: PROVIDER_WEBHOOK_STATUSES.REVIEW_REQUIRED,
      safeCode: "PROVIDER_PAYMENT_MISMATCH",
    };
  }

  const { conflict, attempt } = await upsertPaymentAttempt(transaction, payment, entity, status);
  if (conflict) {
    await markPaymentReview(transaction, payment, {
      source,
      reasonCode: "PROVIDER_PAYMENT_ID_CONFLICT",
      requestId,
      now,
    });
    return {
      status: PROVIDER_WEBHOOK_STATUSES.REVIEW_REQUIRED,
      safeCode: "PROVIDER_PAYMENT_ID_CONFLICT",
    };
  }

  const providerCreatedAt = safeProviderTimestamp(entity.created_at);
  if (
    providerCreatedAt &&
    (!payment.lastProviderEventAt || providerCreatedAt > payment.lastProviderEventAt)
  ) {
    const eventUpdate = await transaction.payment.updateMany({
      where: { id: payment.id, version: payment.version },
      data: { lastProviderEventAt: providerCreatedAt, version: { increment: 1 } },
    });
    if (eventUpdate.count !== 1) throw commerceVersionConflict();
    payment = { ...payment, version: payment.version + 1, lastProviderEventAt: providerCreatedAt };
  }

  if (status !== PAYMENT_ATTEMPT_STATUSES.CAPTURED) {
    return { status: PROVIDER_WEBHOOK_STATUSES.PROCESSED, safeCode: status };
  }

  const otherCaptured = await transaction.paymentAttempt.count({
    where: {
      paymentId: payment.id,
      status: PAYMENT_ATTEMPT_STATUSES.CAPTURED,
      id: { not: attempt.id },
    },
  });
  if (otherCaptured > 0) {
    await markPaymentReview(transaction, payment, {
      source,
      reasonCode: "MULTIPLE_CAPTURED_PAYMENTS",
      requestId,
      now,
    });
    return {
      status: PROVIDER_WEBHOOK_STATUSES.REVIEW_REQUIRED,
      safeCode: "MULTIPLE_CAPTURED_PAYMENTS",
    };
  }

  if (
    [
      PAYMENT_STATUSES.CAPTURED,
      PAYMENT_STATUSES.REFUND_PENDING,
      PAYMENT_STATUSES.REFUNDED,
    ].includes(payment.status)
  ) {
    return { status: PROVIDER_WEBHOOK_STATUSES.PROCESSED, safeCode: "CAPTURE_ALREADY_APPLIED" };
  }

  if (
    payment.order.status === ORDER_STATUSES.PENDING_PAYMENT &&
    payment.order.reservationExpiresAt > now
  ) {
    await consumeReservations(transaction, payment.order.id, now);
    const paymentUpdate = await transaction.payment.updateMany({
      where: { id: payment.id, version: payment.version },
      data: {
        status: PAYMENT_STATUSES.CAPTURED,
        providerOrderStatus: "paid",
        version: { increment: 1 },
      },
    });
    if (paymentUpdate.count !== 1) throw commerceVersionConflict();
    await appendOrderTransition(transaction, {
      order: payment.order,
      toStatus: ORDER_STATUSES.CONFIRMED,
      source,
      reasonCode: "PAYMENT_CAPTURED",
      requestId,
      now,
    });
    return { status: PROVIDER_WEBHOOK_STATUSES.PROCESSED, safeCode: "PAYMENT_CAPTURED" };
  }

  if (
    payment.order.status === ORDER_STATUSES.PENDING_PAYMENT &&
    payment.order.reservationExpiresAt <= now
  ) {
    await releaseReservations(transaction, payment.order, { requestId, now });
  }
  await markPaymentReview(transaction, payment, {
    source,
    reasonCode: "LATE_OR_INVALID_CAPTURE",
    requestId,
    now,
  });
  return {
    status: PROVIDER_WEBHOOK_STATUSES.REVIEW_REQUIRED,
    safeCode: "LATE_OR_INVALID_CAPTURE",
  };
}

const refundPriority = Object.freeze({ PENDING: 0, FAILED: 1, PROCESSED: 2 });

export async function applyProviderRefund(
  transaction,
  entity,
  {
    eventType = null,
    source = ORDER_EVENT_SOURCES.PROVIDER,
    requestId = null,
    now = new Date(),
  } = {},
) {
  const status = refundStatus(entity, eventType);
  if (
    !status ||
    !providerRefundIdPattern.test(entity.id ?? "") ||
    !providerPaymentIdPattern.test(entity.payment_id ?? "") ||
    !Number.isSafeInteger(entity.amount)
  ) {
    return {
      status: PROVIDER_WEBHOOK_STATUSES.REVIEW_REQUIRED,
      safeCode: "PROVIDER_REFUND_INVALID",
      paymentId: null,
    };
  }

  const attempt = await transaction.paymentAttempt.findUnique({
    where: { providerPaymentId: entity.payment_id },
    include: { payment: { include: { order: true } } },
  });
  if (!attempt) {
    return {
      status: PROVIDER_WEBHOOK_STATUSES.IGNORED,
      safeCode: "PROVIDER_PAYMENT_UNKNOWN",
      paymentId: null,
    };
  }

  let refund = await transaction.refund.findUnique({
    where: { providerRefundId: entity.id },
  });
  if (!refund) {
    refund = await transaction.refund.findFirst({
      where: {
        paymentId: attempt.paymentId,
        paymentAttemptId: attempt.id,
        providerRefundId: null,
        status: REFUND_STATUSES.PENDING,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  const exact =
    refund &&
    refund.paymentAttemptId === attempt.id &&
    entity.amount === moneyToSubunits(refund.amount) &&
    (!entity.currency || entity.currency === refund.currency);
  if (!exact) {
    await markPaymentReview(transaction, attempt.payment, {
      source,
      reasonCode: "PROVIDER_REFUND_MISMATCH",
      requestId,
      now,
    });
    return {
      status: PROVIDER_WEBHOOK_STATUSES.REVIEW_REQUIRED,
      safeCode: "PROVIDER_REFUND_MISMATCH",
      paymentId: attempt.paymentId,
    };
  }

  const nextStatus =
    refundPriority[status] > refundPriority[refund.status] ? status : refund.status;
  refund = await transaction.refund.update({
    where: { id: refund.id },
    data: {
      providerRefundId: entity.id,
      status: nextStatus,
      failureCode:
        nextStatus === REFUND_STATUSES.FAILED ? safeFailureCode(entity.error_code) : null,
      providerCreatedAt: safeProviderTimestamp(entity.created_at) ?? refund.providerCreatedAt,
    },
  });

  if (nextStatus === REFUND_STATUSES.PROCESSED) {
    const payment = attempt.payment;
    const paymentUpdate = await transaction.payment.updateMany({
      where: { id: payment.id, version: payment.version },
      data: { status: PAYMENT_STATUSES.REFUNDED, version: { increment: 1 } },
    });
    if (paymentUpdate.count !== 1 && payment.status !== PAYMENT_STATUSES.REFUNDED) {
      throw commerceVersionConflict();
    }

    if (payment.order.status === ORDER_STATUSES.PAYMENT_REVIEW) {
      await releaseReservations(transaction, payment.order, { requestId, now });
      await appendOrderTransition(transaction, {
        order: payment.order,
        toStatus: ORDER_STATUSES.CANCELLED,
        source,
        reasonCode: "REVIEW_PAYMENT_REFUNDED",
        requestId,
        now,
      });
    }
  }

  return {
    status: PROVIDER_WEBHOOK_STATUSES.PROCESSED,
    safeCode: `REFUND_${nextStatus}`,
    paymentId: attempt.paymentId,
    refund,
  };
}
