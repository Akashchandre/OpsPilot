import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import { AUDIT_GENESIS_HASH } from "./modules/audit/audit.constants.js";

dotenv.config({ path: ".env.test", override: true, quiet: true });

const baseConfig = loadEnvironment();
const config = {
  ...baseConfig,
  auth: { ...baseConfig.auth, loginRateLimitMax: 100 },
};
const database = createDatabase(config.databaseUrl);
const app = createApp({ config, database });
const origin = config.corsOrigin;
const password = "Phase five support password!";

function cookieValue(response, name) {
  const cookie = response.headers["set-cookie"]?.find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`Response did not set ${name}`);
  return cookie.slice(name.length + 1).split(";", 1)[0];
}

async function registerAs(roleCode, label) {
  const agent = request.agent(app);
  const registration = await agent
    .post("/api/v1/auth/register")
    .set("Origin", origin)
    .send({
      displayName: `Support ${label}`,
      email: `support-${label}-${randomUUID()}@example.com`,
      password,
    });
  expect(registration.status).toBe(201);
  const userId = registration.body.data.user.id;
  if (roleCode !== "CUSTOMER") {
    await database.userRole.create({
      data: {
        user: { connect: { id: userId } },
        role: { connect: { code: roleCode } },
      },
    });
  }
  return {
    agent,
    userId,
    csrf: cookieValue(registration, config.auth.csrfCookieName),
  };
}

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
  await database.securityEvent.deleteMany();
  await database.authSession.deleteMany();
  await database.userRole.deleteMany();
  await database.user.deleteMany();
}

async function createOrder(userId) {
  const id = randomUUID();
  return database.order.create({
    data: {
      id,
      orderNumber: `OP-${id.replaceAll("-", "").slice(0, 18).toUpperCase()}`,
      userId,
      subtotal: "125.00",
      total: "125.00",
      currency: "INR",
      recipientName: "Support Fixture",
      phone: "9999999999",
      addressLine1: "Fixture address",
      city: "Pune",
      state: "Maharashtra",
      postalCode: "411001",
      reservationExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      idempotencyKey: randomUUID(),
      requestHash: "a".repeat(64),
    },
  });
}

function createTicket(actor, input, idempotencyKey = randomUUID()) {
  return actor.agent
    .post("/api/v1/support/tickets")
    .set("Origin", origin)
    .set("X-CSRF-Token", actor.csrf)
    .set("Idempotency-Key", idempotencyKey)
    .send(input);
}

function addMessage(actor, ticketId, input, idempotencyKey = randomUUID()) {
  return actor.agent
    .post(`/api/v1/support/tickets/${ticketId}/messages`)
    .set("Origin", origin)
    .set("X-CSRF-Token", actor.csrf)
    .set("Idempotency-Key", idempotencyKey)
    .send(input);
}

function updateTicket(actor, ticketId, input) {
  return actor.agent
    .patch(`/api/v1/support/tickets/${ticketId}`)
    .set("Origin", origin)
    .set("X-CSRF-Token", actor.csrf)
    .send(input);
}

beforeEach(clearData);

afterAll(async () => {
  await clearData();
  await database.$disconnect();
});

describe.sequential("Phase 5 support API", () => {
  it("creates normalized plain-text tickets with owned-order and request idempotency controls", async () => {
    const customer = await registerAs("CUSTOMER", "creator");
    const other = await registerAs("CUSTOMER", "other-order-owner");
    const ownedOrder = await createOrder(customer.userId);
    const otherOrder = await createOrder(other.userId);
    const key = randomUUID();
    const input = {
      category: "ORDER",
      subject: "  Checkout   shows <img src=x onerror=alert(1)>  ",
      message: "<script>alert('stored text')</script>\r\nPlease help.",
      orderId: ownedOrder.id,
    };

    const created = await createTicket(customer, input, key);
    expect(created.status).toBe(201);
    expect(created.body.data.ticket).toMatchObject({
      category: "ORDER",
      subject: "Checkout shows <img src=x onerror=alert(1)>",
      status: "OPEN",
      priority: "NORMAL",
      linkedOrder: { id: ownedOrder.id, total: "125.00", currency: "INR" },
    });
    expect(created.body.data.ticket.messages[0].body).toBe(
      "<script>alert('stored text')</script>\nPlease help.",
    );

    const replay = await createTicket(customer, input, key);
    expect(replay.status).toBe(200);
    expect(replay.body.meta.idempotencyReplay).toBe(true);
    expect(replay.body.data.ticket.id).toBe(created.body.data.ticket.id);
    expect(await database.supportTicket.count()).toBe(1);
    expect(await database.auditEvent.count({ where: { action: "SUPPORT_TICKET_CREATED" } })).toBe(
      1,
    );

    const conflict = await createTicket(customer, { ...input, subject: "Changed subject" }, key);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");

    const crossOwner = await createTicket(customer, {
      ...input,
      subject: "Cannot link another order",
      orderId: otherOrder.id,
    });
    expect(crossOwner.status).toBe(422);
    expect(crossOwner.body.error.code).toBe("SUPPORT_ORDER_LINK_INVALID");
  });

  it("enforces ownership and keeps internal operator notes out of customer projections", async () => {
    const customer = await registerAs("CUSTOMER", "owner");
    const stranger = await registerAs("CUSTOMER", "stranger");
    const admin = await registerAs("ADMIN", "operator");
    const created = await createTicket(customer, {
      category: "ACCOUNT",
      subject: "Account access question",
      message: "I need assistance with my account.",
    });
    const ticketId = created.body.data.ticket.id;

    expect((await stranger.agent.get(`/api/v1/support/tickets/${ticketId}`)).status).toBe(404);
    expect((await stranger.agent.get("/api/v1/support/tickets")).body.data.tickets).toEqual([]);
    expect((await customer.agent.get("/api/v1/support/tickets?view=management")).status).toBe(403);

    const internal = await addMessage(admin, ticketId, {
      body: "Internal triage note: no customer content copied.",
      visibility: "INTERNAL",
    });
    expect(internal.status).toBe(201);
    expect(internal.body.data.ticket.messages.at(-1).visibility).toBe("INTERNAL");

    const customerDetail = await customer.agent.get(`/api/v1/support/tickets/${ticketId}`);
    expect(customerDetail.status).toBe(200);
    expect(customerDetail.body.data.ticket.messages).toHaveLength(1);
    expect(JSON.stringify(customerDetail.body)).not.toContain("Internal triage note");

    const managementDetail = await admin.agent.get(
      `/api/v1/support/tickets/${ticketId}?view=management`,
    );
    expect(managementDetail.status).toBe(200);
    expect(managementDetail.body.data.ticket.messages).toHaveLength(2);
    expect(managementDetail.body.data.ticket.requester.id).toBe(customer.userId);

    const forbiddenInternal = await addMessage(customer, ticketId, {
      body: "I should not be able to mark this internal.",
      visibility: "INTERNAL",
    });
    expect(forbiddenInternal.status).toBe(403);
    expect(forbiddenInternal.body.error.code).toBe("SUPPORT_INTERNAL_NOTE_FORBIDDEN");
  });

  it("applies transition, assignment eligibility, stale-assignee, and optimistic-version rules", async () => {
    const customer = await registerAs("CUSTOMER", "workflow-customer");
    const firstAdmin = await registerAs("ADMIN", "first-operator");
    const secondAdmin = await registerAs("ADMIN", "second-operator");
    const created = await createTicket(customer, {
      category: "PAYMENT",
      subject: "Payment workflow question",
      message: "Please review the payment state.",
    });
    const ticketId = created.body.data.ticket.id;

    const changed = await updateTicket(firstAdmin, ticketId, {
      version: 0,
      status: "WAITING_CUSTOMER",
      priority: "HIGH",
      assigneeId: firstAdmin.userId,
    });
    expect(changed.status).toBe(200);
    expect(changed.body.data.ticket).toMatchObject({
      status: "WAITING_CUSTOMER",
      priority: "HIGH",
      version: 1,
      assignee: { id: firstAdmin.userId },
    });
    expect(changed.body.data.ticket.history.map((event) => event.eventType)).toEqual([
      "CREATED",
      "STATUS_CHANGED",
      "PRIORITY_CHANGED",
      "ASSIGNEE_CHANGED",
    ]);

    const stale = await updateTicket(firstAdmin, ticketId, { version: 0, priority: "URGENT" });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("RESOURCE_VERSION_CONFLICT");

    const ineligible = await updateTicket(firstAdmin, ticketId, {
      version: 1,
      assigneeId: customer.userId,
    });
    expect(ineligible.status).toBe(422);
    expect(ineligible.body.error.code).toBe("SUPPORT_ASSIGNEE_INELIGIBLE");

    await database.user.update({
      where: { id: firstAdmin.userId },
      data: { status: "DISABLED" },
    });
    const staleAssignee = await updateTicket(secondAdmin, ticketId, {
      version: 1,
      priority: "URGENT",
    });
    expect(staleAssignee.status).toBe(409);
    expect(staleAssignee.body.error.code).toBe("SUPPORT_ASSIGNEE_STALE");

    const reassigned = await updateTicket(secondAdmin, ticketId, {
      version: 1,
      assigneeId: secondAdmin.userId,
    });
    expect(reassigned.status).toBe(200);
    expect(reassigned.body.data.ticket.assignee.id).toBe(secondAdmin.userId);

    const resolved = await updateTicket(secondAdmin, ticketId, {
      version: 2,
      status: "RESOLVED",
    });
    expect(resolved.status).toBe(200);
    const invalid = await updateTicket(secondAdmin, ticketId, {
      version: 3,
      status: "IN_PROGRESS",
    });
    expect(invalid.status).toBe(409);
    expect(invalid.body.error.code).toBe("SUPPORT_STATUS_TRANSITION_INVALID");
  });

  it("reopens customer replies atomically and makes closed tickets terminal", async () => {
    const customer = await registerAs("CUSTOMER", "reply-customer");
    const admin = await registerAs("ADMIN", "reply-operator");
    const created = await createTicket(customer, {
      category: "GENERAL",
      subject: "Reply and closure workflow",
      message: "This ticket will exercise reply behavior.",
    });
    const ticketId = created.body.data.ticket.id;
    expect(
      (
        await updateTicket(admin, ticketId, {
          version: 0,
          status: "WAITING_CUSTOMER",
        })
      ).status,
    ).toBe(200);

    const key = randomUUID();
    const reply = await addMessage(
      customer,
      ticketId,
      { body: "Here is the requested information." },
      key,
    );
    expect(reply.status).toBe(201);
    expect(reply.body.data.ticket).toMatchObject({ status: "OPEN", version: 2 });
    expect(reply.body.data.ticket.history.at(-1)).toMatchObject({
      fromStatus: "WAITING_CUSTOMER",
      toStatus: "OPEN",
      reasonCode: "CUSTOMER_REPLY_REOPENED",
    });
    const replay = await addMessage(
      customer,
      ticketId,
      { body: "Here is the requested information." },
      key,
    );
    expect(replay.status).toBe(200);
    expect(replay.body.data.ticket.messages).toHaveLength(2);

    const staleClose = await customer.agent
      .post(`/api/v1/support/tickets/${ticketId}/closure`)
      .set("Origin", origin)
      .set("X-CSRF-Token", customer.csrf)
      .send({ version: 1 });
    expect(staleClose.status).toBe(409);
    expect(staleClose.body.error.code).toBe("RESOURCE_VERSION_CONFLICT");

    const closed = await customer.agent
      .post(`/api/v1/support/tickets/${ticketId}/closure`)
      .set("Origin", origin)
      .set("X-CSRF-Token", customer.csrf)
      .send({ version: 2 });
    expect(closed.status).toBe(200);
    expect(closed.body.data.ticket).toMatchObject({ status: "CLOSED", version: 3 });
    expect((await addMessage(customer, ticketId, { body: "Too late." })).status).toBe(409);
    expect((await updateTicket(admin, ticketId, { version: 3, priority: "URGENT" })).status).toBe(
      409,
    );
  });

  it("validates management filters strictly and returns bounded deterministic pages", async () => {
    const customer = await registerAs("CUSTOMER", "list-customer");
    const admin = await registerAs("ADMIN", "list-operator");
    for (const subject of ["First searchable issue", "Second searchable issue"]) {
      expect(
        (
          await createTicket(customer, {
            category: "PRODUCT",
            subject,
            message: "A product support request.",
          })
        ).status,
      ).toBe(201);
    }

    const page = await admin.agent.get(
      "/api/v1/support/tickets?view=management&category=PRODUCT&search=searchable&sort=createdAt&direction=asc&limit=1&page=2",
    );
    expect(page.status).toBe(200);
    expect(page.body.data.tickets).toHaveLength(1);
    expect(page.body.meta).toEqual({ page: 2, limit: 1, total: 2, totalPages: 2 });

    expect(
      (await admin.agent.get("/api/v1/support/tickets?view=management&sort=unsafe")).status,
    ).toBe(422);
    expect(
      (await admin.agent.get("/api/v1/support/tickets?view=management&limit=101")).status,
    ).toBe(422);
    expect(
      (await customer.agent.get(`/api/v1/support/tickets?assignee=${admin.userId}`)).status,
    ).toBe(422);
  });
});
