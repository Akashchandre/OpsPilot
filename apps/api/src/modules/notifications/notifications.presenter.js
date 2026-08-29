function supportPath(notification) {
  return notification.metadata.view === "MANAGEMENT"
    ? "/admin/support"
    : `/support/${notification.supportTicketId}`;
}

const presentation = Object.freeze({
  ORDER_PLACED: (notification) => ({
    title: "Order placed",
    message: `${notification.metadata.reference} has been placed.`,
    actionPath: `/orders/${notification.orderId}`,
  }),
  ORDER_STATUS_CHANGED: (notification) => ({
    title: "Order updated",
    message: `${notification.metadata.reference} is now ${notification.metadata.status}.`,
    actionPath: `/orders/${notification.orderId}`,
  }),
  PAYMENT_STATUS_CHANGED: (notification) => ({
    title: "Payment updated",
    message: `Payment for ${notification.metadata.reference} is ${notification.metadata.status}.`,
    actionPath: `/orders/${notification.orderId}`,
  }),
  REFUND_STATUS_CHANGED: (notification) => ({
    title: "Refund updated",
    message: `Refund for ${notification.metadata.reference} is ${notification.metadata.status}.`,
    actionPath: `/orders/${notification.orderId}`,
  }),
  SUPPORT_TICKET_CREATED: (notification) => ({
    title: "Support ticket created",
    message: `${notification.metadata.reference} entered the support queue.`,
    actionPath: supportPath(notification),
  }),
  SUPPORT_PUBLIC_REPLY_CREATED: (notification) => ({
    title: "New support reply",
    message: `${notification.metadata.reference} has a new public reply.`,
    actionPath: supportPath(notification),
  }),
  SUPPORT_ASSIGNMENT_CHANGED: (notification) => ({
    title: "Support assignment updated",
    message: `${notification.metadata.reference} assignment changed.`,
    actionPath: supportPath(notification),
  }),
  SUPPORT_STATUS_CHANGED: (notification) => ({
    title: "Support status updated",
    message: `${notification.metadata.reference} is now ${notification.metadata.status}.`,
    actionPath: supportPath(notification),
  }),
  INVENTORY_LOW: (notification) => ({
    title:
      notification.metadata.stockState === "OUT_OF_STOCK" ? "Product out of stock" : "Low stock",
    message: `${notification.metadata.reference} requires inventory attention.`,
    actionPath: "/admin/inventory",
  }),
});

export function presentNotification(notification) {
  const content = presentation[notification.type](notification);
  return {
    id: notification.id,
    cursor: notification.sequence.toString(),
    type: notification.type,
    ...content,
    metadata: notification.metadata,
    resources: {
      orderId: notification.orderId,
      paymentId: notification.paymentId,
      refundId: notification.refundId,
      supportTicketId: notification.supportTicketId,
      productId: notification.productId,
    },
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}
