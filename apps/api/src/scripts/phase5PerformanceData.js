import { createHash } from "node:crypto";
import dotenv from "dotenv";
import { loadEnvironment } from "../config/env.js";
import { createDatabase } from "../db/prisma.js";
import { computeAuditEventHash } from "../modules/audit/audit.chain.js";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_KINDS,
  AUDIT_CHAIN_HEAD_ID,
  AUDIT_GENESIS_HASH,
  AUDIT_OUTCOMES,
  AUDIT_TARGET_TYPES,
} from "../modules/audit/audit.constants.js";

dotenv.config({ path: ".env.test", override: true, quiet: true });

const confirmation = "replace-isolated-synthetic-data";
const rangeStart = new Date("2025-08-29T00:00:00.000Z");
const oneDayMs = 24 * 60 * 60 * 1000;
const counts = Object.freeze({
  users: 10_000,
  products: 1_000,
  orders: 100_000,
  payments: 50_000,
  paymentAttempts: 50_000,
  refunds: 50_000,
  supportTickets: 25_000,
  auditEvents: 25_000,
});
const requestHash = createHash("sha256").update("opspilot-phase-5-synthetic").digest("hex");

function output(event, fields = {}) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields }));
}

function deterministicUuid(namespace, index) {
  return `00000000-0000-4000-${namespace}-${index.toString(16).padStart(12, "0")}`;
}

function timestamp(index) {
  return new Date(rangeStart.getTime() + (index % 365) * oneDayMs + (index % 24) * 60 * 60 * 1000);
}

function money(index) {
  return `${100 + (index % 5_000)}.${String(index % 100).padStart(2, "0")}`;
}

function assertSafeTarget(config, destructive) {
  const databaseName = new URL(config.databaseUrl).pathname.replace(/^\//, "");
  if (config.nodeEnv === "production" || !/(?:_test|_perf)$/.test(databaseName)) {
    throw new Error("Performance data is allowed only in an isolated _test or _perf database");
  }
  if (destructive && process.env.PERFORMANCE_DATA_CONFIRM !== confirmation) {
    throw new Error(`Set PERFORMANCE_DATA_CONFIRM=${confirmation} for destructive operations`);
  }
  return databaseName;
}

async function insertBatches({ label, total, size = 1_000, build, insert }) {
  for (let start = 1; start <= total; start += size) {
    const end = Math.min(total, start + size - 1);
    const data = [];
    for (let index = start; index <= end; index += 1) data.push(build(index));
    await insert(data);
    if (end === total || end % (size * 10) === 0)
      output("performance.seed_progress", { label, end, total });
  }
}

async function resetDatabase(database) {
  output("performance.reset_started");
  await database.auditEvent.deleteMany();
  await database.auditChainHead.upsert({
    where: { id: AUDIT_CHAIN_HEAD_ID },
    create: { id: AUDIT_CHAIN_HEAD_ID, headSequence: 0n, headHash: AUDIT_GENESIS_HASH },
    update: { headSequence: 0n, headHash: AUDIT_GENESIS_HASH },
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
  await database.securityEvent.deleteMany();
  await database.authSession.deleteMany();
  await database.userRole.deleteMany();
  await database.user.deleteMany();
  output("performance.reset_completed");
}

async function seedUsers(database, customerRoleId) {
  await insertBatches({
    label: "users",
    total: counts.users,
    build: (index) => ({
      id: deterministicUuid("a001", index),
      email: `perf-customer-${String(index).padStart(5, "0")}@example.invalid`,
      passwordHash: "synthetic-performance-data-not-for-authentication",
      displayName: `Synthetic Customer ${String(index).padStart(5, "0")}`,
      status: "ACTIVE",
      createdAt: timestamp(index),
      updatedAt: timestamp(index),
    }),
    insert: (data) => database.user.createMany({ data }),
  });
  await insertBatches({
    label: "customer-role-assignments",
    total: counts.users,
    build: (index) => ({
      userId: deterministicUuid("a001", index),
      roleId: customerRoleId,
      assignedAt: timestamp(index),
    }),
    insert: (data) => database.userRole.createMany({ data }),
  });
}

async function seedProducts(database) {
  await insertBatches({
    label: "products",
    total: counts.products,
    build: (index) => ({
      id: deterministicUuid("a002", index),
      sku: `PERF-SKU-${String(index).padStart(6, "0")}`,
      name: `Synthetic Product ${String(index).padStart(6, "0")}`,
      description: "Deterministic synthetic performance product",
      price: money(index),
      currency: "INR",
      status: "ACTIVE",
      createdAt: timestamp(index),
      updatedAt: timestamp(index),
    }),
    insert: (data) => database.product.createMany({ data }),
  });
  await insertBatches({
    label: "inventory-balances",
    total: counts.products,
    build: (index) => ({
      productId: deterministicUuid("a002", index),
      onHand: index % 21,
      lowStockThreshold: 5,
      createdAt: timestamp(index),
      updatedAt: timestamp(index),
    }),
    insert: (data) => database.inventoryBalance.createMany({ data }),
  });
}

async function seedOrders(database) {
  const statuses = [
    "PENDING_PAYMENT",
    "CONFIRMED",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
    "EXPIRED",
    "PAYMENT_REVIEW",
  ];
  await insertBatches({
    label: "orders",
    total: counts.orders,
    build: (index) => {
      const createdAt = timestamp(index);
      const amount = money(index);
      return {
        id: deterministicUuid("a003", index),
        orderNumber: `PERF-O-${String(index).padStart(10, "0")}`,
        userId: deterministicUuid("a001", ((index - 1) % counts.users) + 1),
        status: statuses[index % statuses.length],
        subtotal: amount,
        total: amount,
        currency: "INR",
        recipientName: "Synthetic Recipient",
        phone: "+910000000000",
        addressLine1: "Synthetic address only",
        city: "Synthetic City",
        state: "Synthetic State",
        postalCode: "000000",
        countryCode: "IN",
        reservationExpiresAt: new Date(createdAt.getTime() + 15 * 60 * 1000),
        idempotencyKey: deterministicUuid("b003", index),
        requestHash,
        createdAt,
        updatedAt: createdAt,
      };
    },
    insert: (data) => database.order.createMany({ data }),
  });
}

async function seedPayments(database) {
  await insertBatches({
    label: "payments",
    total: counts.payments,
    build: (index) => ({
      id: deterministicUuid("a004", index),
      orderId: deterministicUuid("a003", index),
      provider: "RAZORPAY",
      status: "REFUNDED",
      amount: money(index),
      currency: "INR",
      providerOrderId: `order_perf_${String(index).padStart(10, "0")}`,
      providerReceipt: `op_${deterministicUuid("c004", index)}`,
      providerOrderStatus: "paid",
      createdAt: timestamp(index),
      updatedAt: timestamp(index),
    }),
    insert: (data) => database.payment.createMany({ data }),
  });
  await insertBatches({
    label: "payment-attempts",
    total: counts.paymentAttempts,
    build: (index) => ({
      id: deterministicUuid("a005", index),
      paymentId: deterministicUuid("a004", index),
      providerPaymentId: `pay_perf_${String(index).padStart(10, "0")}`,
      status: "CAPTURED",
      amount: money(index),
      currency: "INR",
      providerCreatedAt: timestamp(index),
      createdAt: timestamp(index),
      updatedAt: timestamp(index),
    }),
    insert: (data) => database.paymentAttempt.createMany({ data }),
  });
  await insertBatches({
    label: "refunds",
    total: counts.refunds,
    build: (index) => ({
      id: deterministicUuid("a006", index),
      paymentId: deterministicUuid("a004", index),
      paymentAttemptId: deterministicUuid("a005", index),
      status: "PROCESSED",
      amount: money(index),
      currency: "INR",
      idempotencyKey: deterministicUuid("b006", index),
      requestHash,
      providerRefundId: `rfnd_perf_${String(index).padStart(10, "0")}`,
      actorUserId: deterministicUuid("a001", ((index - 1) % counts.users) + 1),
      providerCreatedAt: timestamp(index),
      createdAt: timestamp(index),
      updatedAt: timestamp(index),
    }),
    insert: (data) => database.refund.createMany({ data }),
  });
}

async function seedSupportTickets(database) {
  const categories = ["GENERAL", "ORDER", "PAYMENT", "PRODUCT", "ACCOUNT"];
  const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"];
  const statuses = ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"];
  await insertBatches({
    label: "support-tickets",
    total: counts.supportTickets,
    build: (index) => {
      const createdAt = timestamp(index);
      const status = statuses[index % statuses.length];
      return {
        id: deterministicUuid("a007", index),
        ticketNumber: `PERF-T-${String(index).padStart(10, "0")}`,
        requesterId: deterministicUuid("a001", ((index - 1) % counts.users) + 1),
        category: categories[index % categories.length],
        subject: `Synthetic support case ${String(index).padStart(10, "0")}`,
        priority: priorities[index % priorities.length],
        status,
        idempotencyKey: deterministicUuid("b007", index),
        requestHash,
        resolvedAt: ["RESOLVED", "CLOSED"].includes(status) ? createdAt : null,
        closedAt: status === "CLOSED" ? createdAt : null,
        createdAt,
        updatedAt: createdAt,
      };
    },
    insert: (data) => database.supportTicket.createMany({ data }),
  });
}

async function seedAuditEvents(database, config) {
  const integrityKey = Buffer.from(config.audit.integrityKey, "base64");
  let previousHash = AUDIT_GENESIS_HASH;
  let headSequence = 0n;

  await insertBatches({
    label: "audit-events",
    total: counts.auditEvents,
    build: (index) => {
      const event = {
        id: deterministicUuid("a008", index),
        sequence: BigInt(index),
        action: AUDIT_ACTIONS.AUDIT_EVENTS_READ,
        outcome: AUDIT_OUTCOMES.SUCCESS,
        actorKind: AUDIT_ACTOR_KINDS.SYSTEM,
        actorUserId: null,
        targetType: AUDIT_TARGET_TYPES.AUDIT_STREAM,
        targetId: null,
        requestId: deterministicUuid("b008", index),
        metadata: {
          filterNames: [],
          page: 1,
          limit: 100,
          returnedCount: 100,
          total: counts.auditEvents,
        },
        occurredAt: timestamp(index),
        previousHash,
        keyId: config.audit.integrityKeyId,
      };
      event.eventHash = computeAuditEventHash(event, integrityKey);
      previousHash = event.eventHash;
      headSequence = event.sequence;
      return event;
    },
    insert: (data) => database.auditEvent.createMany({ data }),
  });

  await database.auditChainHead.update({
    where: { id: AUDIT_CHAIN_HEAD_ID },
    data: { headSequence, headHash: previousHash },
  });
}

async function datasetCounts(database) {
  const [users, products, orders, payments, paymentAttempts, refunds, supportTickets, auditEvents] =
    await Promise.all([
      database.user.count(),
      database.product.count(),
      database.order.count(),
      database.payment.count(),
      database.paymentAttempt.count(),
      database.refund.count(),
      database.supportTicket.count(),
      database.auditEvent.count(),
    ]);
  return {
    users,
    products,
    orders,
    payments,
    paymentAttempts,
    refunds,
    supportTickets,
    auditEvents,
  };
}

async function seed(database, config) {
  await resetDatabase(database);
  const customerRole = await database.role.findUnique({ where: { code: "CUSTOMER" } });
  if (!customerRole) throw new Error("The CUSTOMER role is missing; deploy migrations first");

  await seedUsers(database, customerRole.id);
  await seedProducts(database);
  await seedOrders(database);
  await seedPayments(database);
  await seedSupportTickets(database);
  await seedAuditEvents(database, config);
  output("performance.seed_completed", { counts: await datasetCounts(database) });
}

const command = process.argv[2] ?? "status";
const config = loadEnvironment();
const destructive = command === "seed" || command === "clear";
const databaseName = assertSafeTarget(config, destructive);
const database = createDatabase(config.databaseUrl);

try {
  output("performance.target_verified", { command, databaseName, nodeEnv: config.nodeEnv });
  if (command === "seed") await seed(database, config);
  else if (command === "clear") await resetDatabase(database);
  else if (command === "status")
    output("performance.dataset_status", { counts: await datasetCounts(database) });
  else throw new Error("Use one of: seed, status, clear");
} finally {
  await database.$disconnect();
}
