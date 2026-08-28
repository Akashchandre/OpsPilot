import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import { AUDIT_GENESIS_HASH } from "./modules/audit/audit.constants.js";
import { createOverviewQuerySchema } from "./modules/reports/reports.schemas.js";

dotenv.config({ path: ".env.test", override: true, quiet: true });

const baseConfig = loadEnvironment();
const config = {
  ...baseConfig,
  auth: { ...baseConfig.auth, loginRateLimitMax: 100 },
};
const database = createDatabase(config.databaseUrl);
const app = createApp({ config, database });
const origin = config.corsOrigin;
const password = "Phase five reports password!";

async function clearData() {
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
  await database.productCategory.deleteMany();
  await database.inventoryAdjustment.deleteMany();
  await database.inventoryBalance.deleteMany();
  await database.product.deleteMany();
  await database.category.deleteMany();
  await database.securityEvent.deleteMany();
  await database.authSession.deleteMany();
  await database.userRole.deleteMany();
  await database.user.deleteMany();
}

async function registerAs(roleCode, label) {
  const agent = request.agent(app);
  const registration = await agent
    .post("/api/v1/auth/register")
    .set("Origin", origin)
    .send({
      displayName: `Reports ${label}`,
      email: `reports-${label}-${randomUUID()}@example.com`,
      password,
    });
  expect(registration.status).toBe(201);
  const userId = registration.body.data.user.id;
  if (roleCode !== "CUSTOMER") {
    const [customerRole, role] = await Promise.all([
      database.role.findUnique({ where: { code: "CUSTOMER" } }),
      database.role.findUnique({ where: { code: roleCode } }),
    ]);
    await database.userRole.create({ data: { userId, roleId: role.id } });
    await database.userRole.delete({
      where: { userId_roleId: { userId, roleId: customerRole.id } },
    });
  }
  return { agent, userId };
}

async function createCustomer(createdAt, label) {
  return database.user.create({
    data: {
      email: `metric-${label}-${randomUUID()}@example.com`,
      displayName: `Metric ${label}`,
      passwordHash: "not-used-for-report-fixture",
      createdAt,
      updatedAt: createdAt,
      roles: { create: { role: { connect: { code: "CUSTOMER" } } } },
    },
  });
}

async function createOrder(userId, { createdAt, status, total = "10.10" }) {
  const id = randomUUID();
  return database.order.create({
    data: {
      id,
      orderNumber: `OP-${id.replaceAll("-", "").slice(0, 18).toUpperCase()}`,
      userId,
      status,
      subtotal: total,
      total,
      currency: "INR",
      recipientName: "Report Fixture",
      phone: "9999999999",
      addressLine1: "Fixture address",
      city: "Pune",
      state: "Maharashtra",
      postalCode: "411001",
      reservationExpiresAt: new Date(createdAt.getTime() + 15 * 60 * 1000),
      idempotencyKey: randomUUID(),
      requestHash: "b".repeat(64),
      createdAt,
      updatedAt: createdAt,
    },
  });
}

async function createPayment(order, amount) {
  return database.payment.create({
    data: {
      orderId: order.id,
      status: "CAPTURED",
      amount,
      currency: "INR",
      providerReceipt: `op_${order.id}`,
      createdAt: order.createdAt,
      updatedAt: order.createdAt,
    },
  });
}

async function createAttempt(paymentId, { amount, createdAt, suffix, status = "CAPTURED" }) {
  return database.paymentAttempt.create({
    data: {
      paymentId,
      providerPaymentId: `pay_report_${suffix}_${randomUUID().replaceAll("-", "")}`,
      status,
      amount,
      currency: "INR",
      createdAt,
      updatedAt: createdAt,
    },
  });
}

async function createProduct({ name, status = "ACTIVE", onHand, threshold }) {
  return database.product.create({
    data: {
      sku: `REPORT-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
      name,
      description: "Report inventory fixture",
      price: "100.00",
      currency: "INR",
      status,
      inventoryBalance: { create: { onHand, lowStockThreshold: threshold } },
    },
  });
}

async function seedOverviewRange() {
  const from = new Date("2026-08-01T00:00:00.000Z");
  const inside = new Date("2026-08-15T12:00:00.000Z");
  const to = new Date("2026-09-01T00:00:00.000Z");
  const before = new Date("2026-07-31T23:59:59.999Z");
  const [firstCustomer, secondCustomer, boundaryCustomer] = await Promise.all([
    createCustomer(from, "from"),
    createCustomer(inside, "inside"),
    createCustomer(to, "to"),
  ]);

  const [firstOrder, secondOrder, boundaryOrder] = await Promise.all([
    createOrder(firstCustomer.id, { createdAt: from, status: "CONFIRMED", total: "30.30" }),
    createOrder(secondCustomer.id, { createdAt: inside, status: "CANCELLED", total: "5.05" }),
    createOrder(boundaryCustomer.id, { createdAt: to, status: "DELIVERED", total: "99.99" }),
  ]);
  const [firstPayment, secondPayment, boundaryPayment] = await Promise.all([
    createPayment(firstOrder, "30.30"),
    createPayment(secondOrder, "5.05"),
    createPayment(boundaryOrder, "99.99"),
  ]);
  const firstAttempt = await createAttempt(firstPayment.id, {
    amount: "10.10",
    createdAt: from,
    suffix: "from",
  });
  await createAttempt(firstPayment.id, { amount: "20.20", createdAt: inside, suffix: "inside" });
  const refundAttempt = await createAttempt(secondPayment.id, {
    amount: "5.05",
    createdAt: before,
    suffix: "refund",
  });
  await createAttempt(boundaryPayment.id, {
    amount: "99.99",
    createdAt: to,
    suffix: "to",
  });
  await database.refund.create({
    data: {
      paymentId: secondPayment.id,
      paymentAttemptId: refundAttempt.id,
      status: "PROCESSED",
      amount: "5.05",
      currency: "INR",
      idempotencyKey: randomUUID(),
      requestHash: "c".repeat(64),
      providerRefundId: `rfnd_report_${randomUUID().replaceAll("-", "")}`,
      createdAt: before,
      updatedAt: inside,
    },
  });

  await Promise.all([
    createProduct({ name: "Out of stock", onHand: 0, threshold: 5 }),
    createProduct({ name: "Low stock", onHand: 3, threshold: 5 }),
    createProduct({ name: "Healthy stock", onHand: 10, threshold: 5 }),
    createProduct({ name: "Archived stock", status: "ARCHIVED", onHand: 0, threshold: 5 }),
  ]);

  const ticketFixtures = [
    { requesterId: firstCustomer.id, createdAt: from, status: "OPEN", priority: "HIGH" },
    { requesterId: secondCustomer.id, createdAt: inside, status: "RESOLVED", priority: "LOW" },
    { requesterId: secondCustomer.id, createdAt: inside, status: "CLOSED", priority: "URGENT" },
    { requesterId: boundaryCustomer.id, createdAt: to, status: "OPEN", priority: "NORMAL" },
  ];
  for (const fixture of ticketFixtures) {
    const id = randomUUID();
    await database.supportTicket.create({
      data: {
        id,
        ticketNumber: `SP-${id.replaceAll("-", "").slice(0, 18).toUpperCase()}`,
        requesterId: fixture.requesterId,
        category: "GENERAL",
        subject: "Report support fixture",
        status: fixture.status,
        priority: fixture.priority,
        idempotencyKey: randomUUID(),
        requestHash: "d".repeat(64),
        createdAt: fixture.createdAt,
        updatedAt: fixture.createdAt,
        ...(fixture.status === "RESOLVED" ? { resolvedAt: fixture.createdAt } : {}),
        ...(fixture.status === "CLOSED" ? { closedAt: fixture.createdAt } : {}),
      },
    });
  }

  return { from, to, firstAttempt };
}

beforeEach(clearData);

afterAll(async () => {
  await clearData();
  await database.$disconnect();
});

describe.sequential("Phase 5 reports API", () => {
  it("returns explicit zero values for an empty half-open UTC range", async () => {
    const admin = await registerAs("ADMIN", "empty-admin");
    const response = await admin.agent.get("/api/v1/reports/overview").query({
      from: "2025-01-01T00:00:00Z",
      to: "2025-01-02T00:00:00Z",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.overview).toMatchObject({
      from: "2025-01-01T00:00:00.000Z",
      to: "2025-01-02T00:00:00.000Z",
      timeZone: "UTC",
      currency: "INR",
      orders: {
        createdCount: 0,
        currentStatusBreakdown: {
          PENDING_PAYMENT: 0,
          CONFIRMED: 0,
          PROCESSING: 0,
          SHIPPED: 0,
          DELIVERED: 0,
          CANCELLED: 0,
          EXPIRED: 0,
          PAYMENT_REVIEW: 0,
        },
      },
      paymentFlow: {
        capturedAmount: "0.00",
        processedRefundAmount: "0.00",
        netAmount: "0.00",
      },
      customers: { newAccountCount: 0 },
      inventory: { lowStockProductCount: 0, outOfStockProductCount: 0 },
      tickets: { createdCount: 0, currentOpenCount: 0 },
    });
    expect(new Date(response.body.data.overview.asOf).toISOString()).toBe(
      response.body.data.overview.asOf,
    );
  });

  it("computes exact boundary, refund, snapshot, and breakdown definitions", async () => {
    const admin = await registerAs("ADMIN", "metrics-admin");
    const { from, to } = await seedOverviewRange();
    const response = await admin.agent.get("/api/v1/reports/overview").query({
      from: from.toISOString(),
      to: to.toISOString(),
    });

    expect(response.status).toBe(200);
    expect(response.body.data.overview).toMatchObject({
      orders: {
        createdCount: 2,
        currentStatusBreakdown: { CONFIRMED: 1, CANCELLED: 1, DELIVERED: 0 },
      },
      paymentFlow: {
        capturedAmount: "30.30",
        processedRefundAmount: "5.05",
        netAmount: "25.25",
      },
      customers: { newAccountCount: 2 },
      inventory: { lowStockProductCount: 1, outOfStockProductCount: 1 },
      tickets: {
        createdCount: 3,
        currentOpenCount: 2,
        currentOpenStateBreakdown: {
          OPEN: 1,
          IN_PROGRESS: 0,
          WAITING_CUSTOMER: 0,
          RESOLVED: 1,
        },
        currentStatusBreakdown: { OPEN: 1, RESOLVED: 1, CLOSED: 1 },
        currentPriorityBreakdown: { LOW: 1, NORMAL: 0, HIGH: 1, URGENT: 1 },
      },
    });
  });

  it("enforces report permission and strict bounded UTC inputs", async () => {
    const admin = await registerAs("ADMIN", "validation-admin");
    const customer = await registerAs("CUSTOMER", "validation-customer");

    expect((await request(app).get("/api/v1/reports/overview")).status).toBe(401);
    expect((await customer.agent.get("/api/v1/reports/overview")).status).toBe(403);
    expect(
      (
        await admin.agent.get("/api/v1/reports/overview").query({
          from: "2026-08-01T00:00:00+05:30",
          to: "2026-08-02T00:00:00Z",
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await admin.agent.get("/api/v1/reports/overview").query({
          from: "2025-01-01T00:00:00Z",
          to: "2026-08-28T00:00:00Z",
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await admin.agent.get("/api/v1/reports/overview").query({
          from: "2026-08-28T00:00:00Z",
          to: "2026-08-28T00:00:00Z",
          extra: "not-allowed",
        })
      ).status,
    ).toBe(422);
  });

  it("applies an exact rolling 30-day default in the query schema", () => {
    const now = new Date("2026-08-28T12:30:00.000Z");
    const query = createOverviewQuerySchema(() => now).parse({});
    expect(query.to).toEqual(now);
    expect(query.from).toEqual(new Date("2026-07-29T12:30:00.000Z"));
  });
});
