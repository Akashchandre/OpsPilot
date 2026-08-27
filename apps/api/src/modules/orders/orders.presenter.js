import { presentMoney } from "../commerce/commerce.money.js";

export const orderSummaryInclude = Object.freeze({
  user: { select: { id: true, displayName: true, email: true } },
  items: { select: { id: true, quantity: true } },
  payment: { select: { id: true, status: true } },
});

export const orderDetailInclude = Object.freeze({
  user: { select: { id: true, displayName: true, email: true } },
  items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
  statusEvents: {
    include: { actor: { select: { id: true, displayName: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  payment: {
    include: {
      attempts: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      refunds: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  },
});

export function presentPayment(payment) {
  if (!payment) return null;
  return {
    id: payment.id,
    provider: payment.provider,
    status: payment.status,
    amount: presentMoney(payment.amount),
    currency: payment.currency,
    providerOrderId: payment.providerOrderId,
    attempts: (payment.attempts ?? []).map((attempt) => ({
      id: attempt.id,
      providerPaymentId: attempt.providerPaymentId,
      status: attempt.status,
      amount: presentMoney(attempt.amount),
      currency: attempt.currency,
      failureCode: attempt.failureCode,
      providerCreatedAt: attempt.providerCreatedAt,
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt,
    })),
    refunds: (payment.refunds ?? []).map((refund) => ({
      id: refund.id,
      status: refund.status,
      amount: presentMoney(refund.amount),
      currency: refund.currency,
      providerRefundId: refund.providerRefundId,
      failureCode: refund.failureCode,
      providerCreatedAt: refund.providerCreatedAt,
      createdAt: refund.createdAt,
      updatedAt: refund.updatedAt,
    })),
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

export function presentOrderSummary(order, { management = false } = {}) {
  const summary = {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    total: presentMoney(order.total),
    currency: order.currency,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    payment: order.payment ? { id: order.payment.id, status: order.payment.status } : null,
    reservationExpiresAt: order.reservationExpiresAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
  if (management) summary.customer = order.user;
  return summary;
}

export function presentOrder(order, { management = false } = {}) {
  const presented = {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    version: order.version,
    totals: {
      subtotal: presentMoney(order.subtotal),
      tax: presentMoney(order.taxTotal),
      discount: presentMoney(order.discountTotal),
      shipping: presentMoney(order.shippingTotal),
      total: presentMoney(order.total),
      currency: order.currency,
    },
    shippingAddress: {
      recipientName: order.recipientName,
      phone: order.phone,
      addressLine1: order.addressLine1,
      addressLine2: order.addressLine2,
      city: order.city,
      state: order.state,
      postalCode: order.postalCode,
      countryCode: order.countryCode,
    },
    fulfillment: {
      carrierName: order.carrierName,
      trackingNumber: order.trackingNumber,
      confirmedAt: order.confirmedAt,
      processingAt: order.processingAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
      expiredAt: order.expiredAt,
    },
    reservationExpiresAt: order.reservationExpiresAt,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      sku: item.productSku,
      name: item.productName,
      unitPrice: presentMoney(item.unitPrice),
      quantity: item.quantity,
      lineTotal: presentMoney(item.lineTotal),
      currency: item.currency,
    })),
    statusHistory: order.statusEvents.map((event) => ({
      id: event.id,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      source: event.source,
      reasonCode: event.reasonCode,
      actor: event.actor,
      createdAt: event.createdAt,
    })),
    payment: presentPayment(order.payment),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
  if (management) presented.customer = order.user;
  return presented;
}
