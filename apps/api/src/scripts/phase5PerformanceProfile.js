import os from "node:os";
import { performance } from "node:perf_hooks";
import dotenv from "dotenv";
import request from "supertest";
import { createApp } from "../app.js";
import { loadEnvironment } from "../config/env.js";
import { createDatabase } from "../db/prisma.js";
import { createAuditService } from "../modules/audit/audit.service.js";
import { digestToken } from "../modules/auth/auth.tokens.js";
import { createReportsService } from "../modules/reports/reports.service.js";
import { createSupportService } from "../modules/support/support.service.js";

dotenv.config({ path: ".env.test", override: true, quiet: true });

const expectedCounts = Object.freeze({
  users: 10_000,
  products: 1_000,
  orders: 100_000,
  paymentAttempts: 50_000,
  refunds: 50_000,
  supportTickets: 25_000,
  auditEvents: 25_000,
});
const from = new Date("2025-08-29T00:00:00.000Z");
const to = new Date("2026-08-29T00:00:00.000Z");

function output(event, fields = {}) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields }));
}

function assertSafeTarget(config) {
  const databaseName = new URL(config.databaseUrl).pathname.replace(/^\//, "");
  if (config.nodeEnv === "production" || !/(?:_test|_perf)$/.test(databaseName)) {
    throw new Error("Performance profiling is allowed only in an isolated _test or _perf database");
  }
  return databaseName;
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)];
}

async function profile(name, operation, { warmups = 5, samples = 30, targetMs }) {
  for (let count = 0; count < warmups; count += 1) await operation();
  const durations = [];
  for (let count = 0; count < samples; count += 1) {
    const startedAt = performance.now();
    await operation();
    durations.push(performance.now() - startedAt);
  }

  const metrics = {
    name,
    warmups,
    samples,
    p50Ms: Number(percentile(durations, 0.5).toFixed(3)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(3)),
    maximumMs: Number(Math.max(...durations).toFixed(3)),
    targetMs,
  };
  output("performance.profile", { ...metrics, targetMet: metrics.p95Ms < targetMs });
  return metrics;
}

async function counts(database) {
  const result = {
    users: await database.user.count(),
    products: await database.product.count(),
    orders: await database.order.count(),
    paymentAttempts: await database.paymentAttempt.count(),
    refunds: await database.refund.count(),
    supportTickets: await database.supportTicket.count(),
    auditEvents: await database.auditEvent.count(),
  };
  for (const [name, expected] of Object.entries(expectedCounts)) {
    if (result[name] !== expected)
      throw new Error(`Expected ${expected} ${name}, found ${result[name]}`);
  }
  return result;
}

async function explain(database, name, sql) {
  const rows = await database.$queryRawUnsafe(`EXPLAIN ANALYZE ${sql}`);
  output("performance.query_plan", {
    name,
    plan: rows.map((row) => Object.values(row).join(" ")).join("\n"),
  });
}

async function prepareReportApiProfile(database, config) {
  const actorId = deterministicActorId();
  const adminRole = await database.role.findUnique({ where: { code: "ADMIN" } });
  if (!adminRole) throw new Error("The ADMIN role is missing; deploy migrations first");
  await database.userRole.upsert({
    where: { userId_roleId: { userId: actorId, roleId: adminRole.id } },
    create: { userId: actorId, roleId: adminRole.id },
    update: {},
  });

  const sessionToken = "phase5-synthetic-performance-session-token";
  const tokenHash = digestToken(sessionToken);
  await database.authSession.upsert({
    where: { tokenHash },
    create: {
      id: "00000000-0000-4000-a009-000000000001",
      userId: actorId,
      tokenHash,
      csrfTokenHash: digestToken("phase5-synthetic-performance-csrf-token"),
      expiresAt: new Date("2026-08-29T00:00:00.000Z"),
      lastSeenAt: new Date(),
    },
    update: { expiresAt: new Date("2026-08-29T00:00:00.000Z"), revokedAt: null },
  });

  const app = createApp({ config, database, logger: { log() {} } });
  return async () => {
    const response = await request(app)
      .get("/api/v1/reports/overview")
      .query({ from: from.toISOString(), to: to.toISOString() })
      .set("Cookie", `${config.auth.sessionCookieName}=${sessionToken}`);
    if (response.status !== 200) {
      throw new Error(`Report API profile returned ${response.status}`);
    }
  };
}

const config = loadEnvironment();
const databaseName = assertSafeTarget(config);
const database = createDatabase(config.databaseUrl);

try {
  const versionRows = await database.$queryRawUnsafe("SELECT VERSION() AS version");
  const dataset = await counts(database);
  output("performance.context", {
    databaseName,
    node: process.version,
    mysql: versionRows[0]?.version,
    platform: `${process.platform}-${process.arch}`,
    cpuModel: os.cpus()[0]?.model,
    cpuCount: os.cpus().length,
    memoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
    dataset,
    range: { from: from.toISOString(), to: to.toISOString() },
  });

  const reports = createReportsService(database, config);
  const support = createSupportService(database, config);
  const audit = createAuditService(database, config);
  const managementQuery = {
    page: 1,
    limit: 20,
    view: "MANAGEMENT",
    status: "ALL",
    priority: "ALL",
    category: "ALL",
    sort: "updatedAt",
    direction: "desc",
  };
  const reportApiOperation = await prepareReportApiProfile(database, config);

  const results = [
    await profile("overview-report-api", reportApiOperation, { targetMs: 1_000 }),
    await profile("overview-report", () => reports.overview({ from, to }), { targetMs: 1_000 }),
    await profile(
      "support-management-list",
      () =>
        support.list({
          actorUserId: deterministicActorId(),
          query: managementQuery,
          management: true,
        }),
      { targetMs: 300 },
    ),
    await profile(
      "customer-order-list",
      () =>
        database.order.findMany({
          where: { userId: deterministicActorId() },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 20,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            currency: true,
            createdAt: true,
          },
        }),
      { targetMs: 300 },
    ),
    await profile(
      "audit-bounded-read",
      () =>
        database.$transaction([
          database.auditEvent.findMany({ orderBy: { sequence: "desc" }, take: 100 }),
          database.auditEvent.count(),
        ]),
      { targetMs: 300 },
    ),
  ];

  const verification = await audit.verifyChain();
  output("performance.audit_verification", verification);

  const start = "2025-08-29 00:00:00.000";
  const end = "2026-08-29 00:00:00.000";
  await explain(
    database,
    "orders-by-status",
    `SELECT status, COUNT(*) FROM orders WHERE created_at >= '${start}' AND created_at < '${end}' GROUP BY status`,
  );
  await explain(
    database,
    "captured-payment-attempts",
    `SELECT SUM(amount) FROM payment_attempts WHERE status = 'CAPTURED' AND currency = 'INR' AND created_at >= '${start}' AND created_at < '${end}'`,
  );
  await explain(
    database,
    "processed-refunds",
    `SELECT SUM(amount) FROM refunds FORCE INDEX (refunds_status_currency_updated_at_amount_idx) WHERE status = 'PROCESSED' AND currency = 'INR' AND updated_at >= '${start}' AND updated_at < '${end}'`,
  );
  await explain(
    database,
    "new-customers",
    `SELECT COUNT(*) FROM users u INNER JOIN user_roles ur ON ur.user_id = u.id INNER JOIN roles r ON r.id = ur.role_id WHERE r.code = 'CUSTOMER' AND u.created_at >= '${start}' AND u.created_at < '${end}'`,
  );
  await explain(
    database,
    "inventory-snapshot",
    "SELECT SUM(CASE WHEN ib.on_hand = 0 THEN 1 ELSE 0 END), SUM(CASE WHEN ib.on_hand > 0 AND ib.on_hand <= ib.low_stock_threshold THEN 1 ELSE 0 END) FROM inventory_balances ib INNER JOIN products p ON p.id = ib.product_id WHERE p.status = 'ACTIVE'",
  );
  await explain(
    database,
    "ticket-breakdown",
    `SELECT status, priority, COUNT(*) FROM support_tickets WHERE created_at >= '${start}' AND created_at < '${end}' GROUP BY status, priority`,
  );
  await explain(
    database,
    "support-management-list",
    "SELECT id, updated_at FROM support_tickets ORDER BY updated_at DESC, id ASC LIMIT 20",
  );
  await explain(
    database,
    "audit-bounded-read",
    "SELECT sequence, action, occurred_at FROM audit_events ORDER BY sequence DESC LIMIT 100",
  );

  if (results.some((result) => result.p95Ms >= result.targetMs) || !verification.valid) {
    process.exitCode = 1;
  }
} finally {
  await database.$disconnect();
}

function deterministicActorId() {
  return "00000000-0000-4000-a001-000000000001";
}
