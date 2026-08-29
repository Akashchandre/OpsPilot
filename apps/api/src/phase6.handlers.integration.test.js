import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import { AUDIT_GENESIS_HASH } from "./modules/audit/audit.constants.js";
import { JOB_TYPES } from "./modules/jobs/jobs.constants.js";
import { createJobHandlers } from "./modules/jobs/jobs.handlers.js";
import { createNotificationMaterializer } from "./modules/notifications/notifications.materializer.js";
import { NOTIFICATION_TYPES } from "./modules/notifications/notifications.constants.js";

dotenv.config({ path: ".env.test", override: true, quiet: true });

const config = loadEnvironment();
const database = createDatabase(config.databaseUrl);

async function clearHandlerData() {
  await database.notification.deleteMany();
  await database.backgroundJobAttempt.deleteMany();
  await database.backgroundJob.deleteMany({ where: { replayedFromJobId: { not: null } } });
  await database.backgroundJob.deleteMany();
  await database.workerHeartbeat.deleteMany();
  await database.auditEvent.deleteMany();
  await database.auditChainHead.update({
    where: { id: 1 },
    data: { headSequence: 0n, headHash: AUDIT_GENESIS_HASH },
  });
  await database.supportTicketEvent.deleteMany();
  await database.supportTicketMessage.deleteMany();
  await database.supportTicket.deleteMany();
  await database.providerWebhookEvent.deleteMany();
  await database.refund.deleteMany();
  await database.paymentAttempt.deleteMany();
  await database.payment.deleteMany();
  await database.orderStatusEvent.deleteMany();
  await database.inventoryReservation.deleteMany();
  await database.orderItem.deleteMany();
  await database.order.deleteMany();
  await database.cartItem.deleteMany();
  await database.cart.deleteMany();
  await database.inventoryAdjustment.deleteMany();
  await database.inventoryBalance.deleteMany();
  await database.productCategory.deleteMany();
  await database.product.deleteMany();
  await database.category.deleteMany();
  await database.authSession.deleteMany();
  await database.userRole.deleteMany();
  await database.user.deleteMany();
}

async function createUser(email, roleCode) {
  return database.user.create({
    data: {
      email,
      displayName: email.split("@")[0],
      passwordHash: "not-used-by-this-test",
      roles: { create: { role: { connect: { code: roleCode } } } },
    },
  });
}

async function seedHandlerResources() {
  const customer = await createUser("phase6-handler-customer@example.com", "CUSTOMER");
  const owner = await createUser("phase6-handler-owner@example.com", "OWNER");
  const admin = await createUser("phase6-handler-admin@example.com", "ADMIN");
  const product = await database.product.create({
    data: {
      sku: "PHASE6-HANDLER-SKU",
      name: "Phase 6 Handler Product",
      description: "Synthetic handler integration resource",
      price: "100.00",
      currency: "INR",
      status: "ACTIVE",
      inventoryBalance: { create: { onHand: 2, lowStockThreshold: 5 } },
    },
  });
  const adjustment = await database.inventoryAdjustment.create({
    data: {
      productId: product.id,
      delta: -1,
      quantityBefore: 3,
      quantityAfter: 2,
      reason: "CORRECTION",
    },
  });
  const order = await database.order.create({
    data: {
      orderNumber: "OP-PH6-HANDLER-0001",
      userId: customer.id,
      status: "SHIPPED",
      subtotal: "100.00",
      total: "100.00",
      currency: "INR",
      recipientName: "Phase 6 Customer",
      phone: "+919876543210",
      addressLine1: "Synthetic address",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      reservationExpiresAt: new Date(Date.now() + 60_000),
      idempotencyKey: randomUUID(),
      requestHash: "a".repeat(64),
    },
  });
  const placedEvent = await database.orderStatusEvent.create({
    data: {
      orderId: order.id,
      toStatus: "PENDING_PAYMENT",
      source: "CUSTOMER",
      reasonCode: "ORDER_PLACED",
    },
  });
  const statusEvent = await database.orderStatusEvent.create({
    data: {
      orderId: order.id,
      fromStatus: "PROCESSING",
      toStatus: "SHIPPED",
      source: "OPERATOR",
      reasonCode: "ORDER_SHIPPED",
    },
  });
  const payment = await database.payment.create({
    data: {
      orderId: order.id,
      status: "CAPTURED",
      amount: "100.00",
      currency: "INR",
      providerReceipt: `op_${randomUUID()}`,
      providerOrderId: `order_${randomUUID()}`,
    },
  });
  const paymentAttempt = await database.paymentAttempt.create({
    data: {
      paymentId: payment.id,
      providerPaymentId: `pay_${randomUUID()}`,
      status: "CAPTURED",
      amount: "100.00",
      currency: "INR",
    },
  });
  const refund = await database.refund.create({
    data: {
      paymentId: payment.id,
      paymentAttemptId: paymentAttempt.id,
      status: "PROCESSED",
      amount: "10.00",
      currency: "INR",
      idempotencyKey: randomUUID(),
      requestHash: "b".repeat(64),
      providerRefundId: `rfnd_${randomUUID()}`,
    },
  });
  const ticket = await database.supportTicket.create({
    data: {
      ticketNumber: "SP-PH6-HANDLER-001",
      requesterId: customer.id,
      assigneeId: admin.id,
      category: "GENERAL",
      subject: "Private synthetic support subject",
      status: "IN_PROGRESS",
      idempotencyKey: randomUUID(),
      requestHash: "c".repeat(64),
    },
  });
  const createdEvent = await database.supportTicketEvent.create({
    data: {
      ticketId: ticket.id,
      eventType: "CREATED",
      source: "CUSTOMER",
      toStatus: "OPEN",
      reasonCode: "CUSTOMER_TICKET_CREATED",
    },
  });
  const message = await database.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      authorUserId: admin.id,
      body: "Private synthetic public reply body",
      idempotencyKey: randomUUID(),
      requestHash: "d".repeat(64),
    },
  });
  const assignmentEvent = await database.supportTicketEvent.create({
    data: {
      ticketId: ticket.id,
      eventType: "ASSIGNEE_CHANGED",
      source: "OPERATOR",
      nextAssigneeId: admin.id,
      reasonCode: "ASSIGNEE_CHANGED",
    },
  });
  const supportStatusEvent = await database.supportTicketEvent.create({
    data: {
      ticketId: ticket.id,
      eventType: "STATUS_CHANGED",
      source: "OPERATOR",
      fromStatus: "OPEN",
      toStatus: "IN_PROGRESS",
      reasonCode: "STATUS_CHANGED",
    },
  });

  return {
    customer,
    owner,
    admin,
    product,
    order,
    payment,
    refund,
    ticket,
    jobs: [
      {
        type: JOB_TYPES.NOTIFICATION_ORDER_PLACED,
        schemaVersion: 1,
        payload: { sourceEventId: placedEvent.id, orderId: order.id },
      },
      {
        type: JOB_TYPES.NOTIFICATION_ORDER_STATUS_CHANGED,
        schemaVersion: 1,
        payload: { sourceEventId: statusEvent.id, orderId: order.id },
      },
      {
        type: JOB_TYPES.NOTIFICATION_PAYMENT_STATUS_CHANGED,
        schemaVersion: 1,
        payload: { sourceEventId: statusEvent.id, paymentId: payment.id },
      },
      {
        type: JOB_TYPES.NOTIFICATION_REFUND_STATUS_CHANGED,
        schemaVersion: 1,
        payload: { sourceEventId: refund.id, refundId: refund.id },
      },
      {
        type: JOB_TYPES.NOTIFICATION_SUPPORT_TICKET_CREATED,
        schemaVersion: 1,
        payload: { sourceEventId: createdEvent.id, supportTicketId: ticket.id },
      },
      {
        type: JOB_TYPES.NOTIFICATION_SUPPORT_PUBLIC_REPLY_CREATED,
        schemaVersion: 1,
        payload: {
          sourceEventId: message.id,
          supportTicketId: ticket.id,
          messageId: message.id,
        },
      },
      {
        type: JOB_TYPES.NOTIFICATION_SUPPORT_ASSIGNMENT_CHANGED,
        schemaVersion: 1,
        payload: { sourceEventId: assignmentEvent.id, supportTicketId: ticket.id },
      },
      {
        type: JOB_TYPES.NOTIFICATION_SUPPORT_STATUS_CHANGED,
        schemaVersion: 1,
        payload: { sourceEventId: supportStatusEvent.id, supportTicketId: ticket.id },
      },
      {
        type: JOB_TYPES.NOTIFICATION_INVENTORY_LOW,
        schemaVersion: 1,
        payload: { sourceEventId: adjustment.id, productId: product.id },
      },
    ],
  };
}

beforeEach(clearHandlerData);

afterAll(async () => {
  await clearHandlerData();
  await database.$disconnect();
});

describe.sequential("Phase 6 registered handlers", () => {
  it("materializes every notification type once from current authoritative state", async () => {
    const resources = await seedHandlerResources();
    const materializer = createNotificationMaterializer(database);
    const firstCounts = [];
    for (const job of resources.jobs) firstCounts.push(await materializer.materialize(job));
    const firstTotal = await database.notification.count();
    for (const job of resources.jobs) expect(await materializer.materialize(job)).toBe(0);

    expect(firstCounts.every((count) => count > 0)).toBe(true);
    expect(await database.notification.count()).toBe(firstTotal);
    const types = (
      await database.notification.groupBy({ by: ["type"], orderBy: { type: "asc" } })
    ).map((entry) => entry.type);
    expect(types.sort()).toEqual(Object.values(NOTIFICATION_TYPES).sort());
    const serialized = JSON.stringify(
      (await database.notification.findMany({ select: { metadata: true } })).map(
        (notification) => notification.metadata,
      ),
    );
    expect(serialized).toContain("SHIPPED");
    expect(serialized).toContain("CAPTURED");
    expect(serialized).toContain("PROCESSED");
    expect(serialized).toContain("IN_PROGRESS");
    expect(serialized).not.toContain("Private synthetic");
  });

  it("rejects every notification job whose source transaction did not commit", async () => {
    const resources = await seedHandlerResources();
    const materializer = createNotificationMaterializer(database);
    for (const job of resources.jobs) {
      const missingSource = {
        ...job,
        payload: { ...job.payload, sourceEventId: randomUUID() },
      };
      await expect(materializer.materialize(missingSource)).rejects.toMatchObject({
        code: "RESOURCE_NOT_FOUND",
        terminal: true,
      });
    }
    expect(await database.notification.count()).toBe(0);
  });

  it("runs both fixed scheduled handlers idempotently and rejects unknown work", async () => {
    const handlers = createJobHandlers(database, config);
    await expect(
      handlers.execute({
        type: JOB_TYPES.ORDER_RESERVATION_EXPIRY_SWEEP,
        schemaVersion: 1,
        payload: { bucket: "2026-08-28T12:00:00.000Z" },
      }),
    ).resolves.toEqual({ expiredOrders: 0 });
    await expect(
      handlers.execute({
        type: JOB_TYPES.ORDER_RESERVATION_EXPIRY_SWEEP,
        schemaVersion: 1,
        payload: { bucket: "2026-08-28T12:00:00.000Z" },
      }),
    ).resolves.toEqual({ expiredOrders: 0 });
    await expect(
      handlers.execute({
        type: JOB_TYPES.AUDIT_CHAIN_VERIFY,
        schemaVersion: 1,
        payload: { bucket: "2026-08-28" },
      }),
    ).resolves.toEqual({ checkedEvents: 0 });
    await expect(handlers.execute({ type: "UNKNOWN" })).rejects.toMatchObject({
      code: "JOB_HANDLER_NOT_REGISTERED",
      terminal: true,
    });
  });
});
