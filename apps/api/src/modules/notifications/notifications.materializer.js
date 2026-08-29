import { PERMISSIONS, USER_STATUSES } from "../auth/auth.constants.js";
import { JOB_ERROR_CODES, JOB_TYPES } from "../jobs/jobs.constants.js";
import { validateJobPayload } from "../jobs/jobs.descriptors.js";
import { JobExecutionError } from "../jobs/jobs.errors.js";
import { NOTIFICATION_TYPES } from "./notifications.constants.js";
import {
  NotificationMetadataError,
  validateNotificationMetadata,
} from "./notifications.metadata.js";

function missingResource() {
  return new JobExecutionError(JOB_ERROR_CODES.RESOURCE_NOT_FOUND, { terminal: true });
}

async function recipientsWithPermission(transaction, permissionCode) {
  return transaction.user.findMany({
    where: {
      status: USER_STATUSES.ACTIVE,
      roles: {
        some: {
          role: {
            rolePermissions: { some: { permission: { code: permissionCode } } },
          },
        },
      },
    },
    select: { id: true },
  });
}

function uniqueRecipients(recipients) {
  return [...new Map(recipients.map((recipient) => [recipient.id, recipient])).values()];
}

async function insertNotifications(transaction, job, type, recipients, resource, metadataFor) {
  try {
    const rows = uniqueRecipients(recipients).map((recipient) => ({
      recipientId: recipient.id,
      type,
      dedupeKey: `notification:${type}:${job.payload.sourceEventId}:${recipient.id}`,
      metadata: validateNotificationMetadata(type, metadataFor(recipient)),
      ...resource,
    }));
    if (rows.length === 0) return 0;
    return (await transaction.notification.createMany({ data: rows, skipDuplicates: true })).count;
  } catch (error) {
    if (error instanceof NotificationMetadataError) {
      throw new JobExecutionError("NOTIFICATION_METADATA_INVALID", { terminal: true });
    }
    throw error;
  }
}

async function orderNotification(transaction, job, type) {
  const event = await transaction.orderStatusEvent.findUnique({
    where: { id: job.payload.sourceEventId },
    select: { orderId: true },
  });
  if (!event || event.orderId !== job.payload.orderId) throw missingResource();
  const order = await transaction.order.findUnique({
    where: { id: job.payload.orderId },
    select: { id: true, userId: true, orderNumber: true, status: true },
  });
  if (!order) throw missingResource();
  return insertNotifications(
    transaction,
    job,
    type,
    [{ id: order.userId }],
    { orderId: order.id },
    () => ({ reference: order.orderNumber, status: order.status }),
  );
}

async function paymentNotification(transaction, job) {
  const payment = await transaction.payment.findUnique({
    where: { id: job.payload.paymentId },
    select: {
      id: true,
      status: true,
      order: { select: { id: true, userId: true, orderNumber: true } },
    },
  });
  if (!payment) throw missingResource();
  const [auditEvent, orderEvent, webhookEvent] = await Promise.all([
    transaction.auditEvent.findUnique({
      where: { id: job.payload.sourceEventId },
      select: { targetId: true },
    }),
    transaction.orderStatusEvent.findUnique({
      where: { id: job.payload.sourceEventId },
      select: { orderId: true },
    }),
    transaction.providerWebhookEvent.findUnique({
      where: { id: job.payload.sourceEventId },
      select: { paymentId: true },
    }),
  ]);
  const auditRefund =
    auditEvent?.targetId && auditEvent.targetId !== payment.id
      ? await transaction.refund.findFirst({
          where: { id: auditEvent.targetId, paymentId: payment.id },
          select: { id: true },
        })
      : null;
  if (
    auditEvent?.targetId !== payment.id &&
    !auditRefund &&
    orderEvent?.orderId !== payment.order.id &&
    webhookEvent?.paymentId !== payment.id
  ) {
    throw missingResource();
  }
  return insertNotifications(
    transaction,
    job,
    NOTIFICATION_TYPES.PAYMENT_STATUS_CHANGED,
    [{ id: payment.order.userId }],
    { orderId: payment.order.id, paymentId: payment.id },
    () => ({ reference: payment.order.orderNumber, status: payment.status }),
  );
}

async function refundNotification(transaction, job) {
  const refund = await transaction.refund.findUnique({
    where: { id: job.payload.refundId },
    select: {
      id: true,
      status: true,
      payment: {
        select: {
          id: true,
          order: { select: { id: true, userId: true, orderNumber: true } },
        },
      },
    },
  });
  if (!refund) throw missingResource();
  const [auditEvent, webhookEvent] = await Promise.all([
    transaction.auditEvent.findUnique({
      where: { id: job.payload.sourceEventId },
      select: { targetId: true },
    }),
    transaction.providerWebhookEvent.findUnique({
      where: { id: job.payload.sourceEventId },
      select: { paymentId: true },
    }),
  ]);
  if (
    job.payload.sourceEventId !== refund.id &&
    auditEvent?.targetId !== refund.id &&
    webhookEvent?.paymentId !== refund.payment.id
  ) {
    throw missingResource();
  }
  return insertNotifications(
    transaction,
    job,
    NOTIFICATION_TYPES.REFUND_STATUS_CHANGED,
    [{ id: refund.payment.order.userId }],
    {
      orderId: refund.payment.order.id,
      paymentId: refund.payment.id,
      refundId: refund.id,
    },
    () => ({ reference: refund.payment.order.orderNumber, status: refund.status }),
  );
}

function supportMetadata(ticket, recipient) {
  return {
    reference: ticket.ticketNumber,
    status: ticket.status,
    view: recipient.id === ticket.requesterId ? "SELF" : "MANAGEMENT",
  };
}

async function supportCreatedNotification(transaction, job) {
  const event = await transaction.supportTicketEvent.findUnique({
    where: { id: job.payload.sourceEventId },
    select: { ticketId: true },
  });
  if (!event || event.ticketId !== job.payload.supportTicketId) throw missingResource();
  const ticket = await transaction.supportTicket.findUnique({
    where: { id: job.payload.supportTicketId },
    select: { id: true, requesterId: true, ticketNumber: true, status: true },
  });
  if (!ticket) throw missingResource();
  const recipients = await recipientsWithPermission(transaction, PERMISSIONS.SUPPORT_TICKETS_READ);
  return insertNotifications(
    transaction,
    job,
    NOTIFICATION_TYPES.SUPPORT_TICKET_CREATED,
    recipients,
    { supportTicketId: ticket.id },
    (recipient) => supportMetadata(ticket, recipient),
  );
}

async function supportReplyNotification(transaction, job) {
  const message = await transaction.supportTicketMessage.findUnique({
    where: { id: job.payload.messageId },
    select: { ticketId: true, authorUserId: true, visibility: true },
  });
  if (
    !message ||
    message.ticketId !== job.payload.supportTicketId ||
    message.visibility !== "CUSTOMER_VISIBLE" ||
    job.payload.sourceEventId !== job.payload.messageId
  ) {
    throw missingResource();
  }
  const ticket = await transaction.supportTicket.findUnique({
    where: { id: job.payload.supportTicketId },
    select: { id: true, requesterId: true, assigneeId: true, ticketNumber: true, status: true },
  });
  if (!ticket) throw missingResource();
  let recipients;
  if (message.authorUserId === ticket.requesterId) {
    recipients = ticket.assigneeId
      ? [{ id: ticket.assigneeId }]
      : await recipientsWithPermission(transaction, PERMISSIONS.SUPPORT_TICKETS_READ);
  } else {
    recipients = [{ id: ticket.requesterId }];
  }
  recipients = recipients.filter((recipient) => recipient.id !== message.authorUserId);
  return insertNotifications(
    transaction,
    job,
    NOTIFICATION_TYPES.SUPPORT_PUBLIC_REPLY_CREATED,
    recipients,
    { supportTicketId: ticket.id },
    (recipient) => supportMetadata(ticket, recipient),
  );
}

async function supportTransitionNotification(transaction, job, type) {
  const event = await transaction.supportTicketEvent.findUnique({
    where: { id: job.payload.sourceEventId },
    select: { ticketId: true },
  });
  if (!event || event.ticketId !== job.payload.supportTicketId) throw missingResource();
  const ticket = await transaction.supportTicket.findUnique({
    where: { id: job.payload.supportTicketId },
    select: { id: true, requesterId: true, assigneeId: true, ticketNumber: true, status: true },
  });
  if (!ticket) throw missingResource();
  const recipients = [{ id: ticket.requesterId }];
  if (ticket.assigneeId) recipients.push({ id: ticket.assigneeId });
  return insertNotifications(
    transaction,
    job,
    type,
    recipients,
    { supportTicketId: ticket.id },
    (recipient) => supportMetadata(ticket, recipient),
  );
}

async function inventoryNotification(transaction, job) {
  const adjustment = await transaction.inventoryAdjustment.findUnique({
    where: { id: job.payload.sourceEventId },
    select: { productId: true },
  });
  if (!adjustment || adjustment.productId !== job.payload.productId) throw missingResource();
  const product = await transaction.product.findUnique({
    where: { id: job.payload.productId },
    select: { id: true, sku: true, inventoryBalance: true },
  });
  if (!product?.inventoryBalance) throw missingResource();
  if (product.inventoryBalance.onHand > product.inventoryBalance.lowStockThreshold) return 0;
  const recipients = await recipientsWithPermission(transaction, PERMISSIONS.INVENTORY_READ);
  return insertNotifications(
    transaction,
    job,
    NOTIFICATION_TYPES.INVENTORY_LOW,
    recipients,
    { productId: product.id },
    () => ({
      reference: product.sku,
      stockState: product.inventoryBalance.onHand === 0 ? "OUT_OF_STOCK" : "LOW",
    }),
  );
}

export function createNotificationMaterializer(database) {
  return Object.freeze({
    async materialize(job) {
      validateJobPayload(job.type, job.schemaVersion, job.payload);
      return database.$transaction(async (transaction) => {
        switch (job.type) {
          case JOB_TYPES.NOTIFICATION_ORDER_PLACED:
            return orderNotification(transaction, job, NOTIFICATION_TYPES.ORDER_PLACED);
          case JOB_TYPES.NOTIFICATION_ORDER_STATUS_CHANGED:
            return orderNotification(transaction, job, NOTIFICATION_TYPES.ORDER_STATUS_CHANGED);
          case JOB_TYPES.NOTIFICATION_PAYMENT_STATUS_CHANGED:
            return paymentNotification(transaction, job);
          case JOB_TYPES.NOTIFICATION_REFUND_STATUS_CHANGED:
            return refundNotification(transaction, job);
          case JOB_TYPES.NOTIFICATION_SUPPORT_TICKET_CREATED:
            return supportCreatedNotification(transaction, job);
          case JOB_TYPES.NOTIFICATION_SUPPORT_PUBLIC_REPLY_CREATED:
            return supportReplyNotification(transaction, job);
          case JOB_TYPES.NOTIFICATION_SUPPORT_ASSIGNMENT_CHANGED:
            return supportTransitionNotification(
              transaction,
              job,
              NOTIFICATION_TYPES.SUPPORT_ASSIGNMENT_CHANGED,
            );
          case JOB_TYPES.NOTIFICATION_SUPPORT_STATUS_CHANGED:
            return supportTransitionNotification(
              transaction,
              job,
              NOTIFICATION_TYPES.SUPPORT_STATUS_CHANGED,
            );
          case JOB_TYPES.NOTIFICATION_INVENTORY_LOW:
            return inventoryNotification(transaction, job);
          default:
            throw new JobExecutionError(JOB_ERROR_CODES.HANDLER_NOT_REGISTERED, {
              terminal: true,
            });
        }
      });
    },
  });
}
