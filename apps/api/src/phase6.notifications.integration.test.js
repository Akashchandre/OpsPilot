import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import { AUDIT_GENESIS_HASH } from "./modules/audit/audit.constants.js";
import { createOpaqueToken, digestToken } from "./modules/auth/auth.tokens.js";
import { JOB_TYPES } from "./modules/jobs/jobs.constants.js";
import { createNotificationMaterializer } from "./modules/notifications/notifications.materializer.js";

dotenv.config({ path: ".env.test", override: true, quiet: true });

const config = loadEnvironment();
const database = createDatabase(config.databaseUrl);
const origin = config.corsOrigin;
const app = createApp({ config, database });

async function clearNotificationData() {
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

async function createSession(userId) {
  const sessionToken = createOpaqueToken();
  const csrfToken = createOpaqueToken();
  await database.authSession.create({
    data: {
      userId,
      tokenHash: digestToken(sessionToken),
      csrfTokenHash: digestToken(csrfToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return {
    csrfToken,
    cookie: `${config.auth.sessionCookieName}=${sessionToken}; ${config.auth.csrfCookieName}=${csrfToken}`,
  };
}

async function createTicket(requesterId, suffix) {
  const ticket = await database.supportTicket.create({
    data: {
      ticketNumber: `SP-PHASE6-${suffix}`,
      requesterId,
      category: "GENERAL",
      subject: `private subject ${suffix}`,
      idempotencyKey: randomUUID(),
      requestHash: "a".repeat(64),
    },
  });
  const event = await database.supportTicketEvent.create({
    data: {
      ticketId: ticket.id,
      eventType: "CREATED",
      source: "CUSTOMER",
      toStatus: "OPEN",
      reasonCode: "CUSTOMER_TICKET_CREATED",
      actorUserId: requesterId,
      requestId: randomUUID(),
    },
  });
  return { ticket, event };
}

beforeEach(clearNotificationData);

afterAll(async () => {
  await clearNotificationData();
  await database.$disconnect();
});

describe.sequential("Phase 6 persistent notifications", () => {
  it("materializes support recipients once without copying ticket content", async () => {
    const requester = await createUser("phase6-requester@example.com", "CUSTOMER");
    const owner = await createUser("phase6-notify-owner@example.com", "OWNER");
    const admin = await createUser("phase6-notify-admin@example.com", "ADMIN");
    const { ticket, event } = await createTicket(requester.id, "MAT");
    const job = {
      type: JOB_TYPES.NOTIFICATION_SUPPORT_TICKET_CREATED,
      schemaVersion: 1,
      payload: { sourceEventId: event.id, supportTicketId: ticket.id },
    };
    const materializer = createNotificationMaterializer(database);

    expect(await materializer.materialize(job)).toBe(2);
    expect(await materializer.materialize(job)).toBe(0);
    const rows = await database.notification.findMany({ orderBy: { recipientId: "asc" } });
    expect(rows.map((row) => row.recipientId).sort()).toEqual([admin.id, owner.id].sort());
    expect(JSON.stringify(rows.map((row) => row.metadata))).not.toContain("private subject");
  });

  it("resolves current active permissions when a delayed notification is materialized", async () => {
    const requester = await createUser("phase6-current-requester@example.com", "CUSTOMER");
    const owner = await createUser("phase6-current-owner@example.com", "OWNER");
    const admin = await createUser("phase6-current-admin@example.com", "ADMIN");
    const formerOwner = await createUser("phase6-former-owner@example.com", "OWNER");
    const disabledOwner = await createUser("phase6-disabled-owner@example.com", "OWNER");
    const customerRole = await database.role.findUnique({ where: { code: "CUSTOMER" } });
    await database.userRole.updateMany({
      where: { userId: formerOwner.id },
      data: { roleId: customerRole.id },
    });
    await database.user.update({
      where: { id: disabledOwner.id },
      data: { status: "DISABLED" },
    });
    const { ticket, event } = await createTicket(requester.id, "CURRENT");

    const materializer = createNotificationMaterializer(database);
    expect(
      await materializer.materialize({
        type: JOB_TYPES.NOTIFICATION_SUPPORT_TICKET_CREATED,
        schemaVersion: 1,
        payload: { sourceEventId: event.id, supportTicketId: ticket.id },
      }),
    ).toBe(2);
    expect(
      (
        await database.notification.findMany({
          where: { supportTicketId: ticket.id },
          select: { recipientId: true },
        })
      )
        .map((notification) => notification.recipientId)
        .sort(),
    ).toEqual([admin.id, owner.id].sort());
  });

  it("paginates by cursor and enforces recipient ownership on read mutations", async () => {
    const first = await createUser("phase6-first@example.com", "CUSTOMER");
    const second = await createUser("phase6-second@example.com", "CUSTOMER");
    const firstTicket = await createTicket(first.id, "ONE");
    const secondTicket = await createTicket(second.id, "TWO");
    const firstNotification = await database.notification.create({
      data: {
        recipientId: first.id,
        type: "SUPPORT_STATUS_CHANGED",
        dedupeKey: `test:first:${randomUUID()}`,
        metadata: { reference: firstTicket.ticket.ticketNumber, status: "OPEN", view: "SELF" },
        supportTicketId: firstTicket.ticket.id,
      },
    });
    const secondNotification = await database.notification.create({
      data: {
        recipientId: second.id,
        type: "SUPPORT_STATUS_CHANGED",
        dedupeKey: `test:second:${randomUUID()}`,
        metadata: { reference: secondTicket.ticket.ticketNumber, status: "OPEN", view: "SELF" },
        supportTicketId: secondTicket.ticket.id,
      },
    });
    const session = await createSession(first.id);

    const list = await request(app)
      .get("/api/v1/notifications?after=0&limit=10")
      .set("Cookie", session.cookie);
    expect(list.status).toBe(200);
    expect(list.body.data.notifications).toEqual([
      expect.objectContaining({
        id: firstNotification.id,
        cursor: firstNotification.sequence.toString(),
      }),
    ]);
    expect(JSON.stringify(list.body)).not.toContain("private subject");

    const crossUser = await request(app)
      .patch(`/api/v1/notifications/${secondNotification.id}/read`)
      .set("Cookie", session.cookie)
      .set("Origin", origin)
      .set("X-CSRF-Token", session.csrfToken);
    expect(crossUser.status).toBe(404);

    const marked = await request(app)
      .patch(`/api/v1/notifications/${firstNotification.id}/read`)
      .set("Cookie", session.cookie)
      .set("Origin", origin)
      .set("X-CSRF-Token", session.csrfToken);
    expect(marked.status).toBe(200);
    expect(marked.body.data.notification.readAt).toBeTypeOf("string");

    const readAll = await request(app)
      .post("/api/v1/notifications/read-all")
      .set("Cookie", session.cookie)
      .set("Origin", origin)
      .set("X-CSRF-Token", session.csrfToken)
      .send({ highWaterCursor: firstNotification.sequence.toString() });
    expect(readAll.status).toBe(200);
    expect(readAll.body.data).toEqual({
      updatedCount: 0,
      highWaterCursor: firstNotification.sequence.toString(),
    });
    expect(
      await database.notification.findUnique({ where: { id: secondNotification.id } }),
    ).toMatchObject({
      readAt: null,
    });
  });

  it("supports bounded catch-up, latest history, unread counts, and high-water reads", async () => {
    const user = await createUser("phase6-pagination@example.com", "CUSTOMER");
    const { ticket } = await createTicket(user.id, "PAGE");
    const notifications = [];
    for (let index = 0; index < 3; index += 1) {
      notifications.push(
        await database.notification.create({
          data: {
            recipientId: user.id,
            type: "SUPPORT_STATUS_CHANGED",
            dedupeKey: `test:page:${index}:${randomUUID()}`,
            metadata: { reference: ticket.ticketNumber, status: "OPEN", view: "SELF" },
            supportTicketId: ticket.id,
          },
        }),
      );
    }
    const session = await createSession(user.id);

    const latest = await request(app)
      .get("/api/v1/notifications?limit=2")
      .set("Cookie", session.cookie);
    expect(latest.status).toBe(200);
    expect(latest.body.data.notifications.map((notification) => notification.id)).toEqual([
      notifications[1].id,
      notifications[2].id,
    ]);
    expect(latest.body.meta.truncatedBefore).toBe(true);

    const firstPage = await request(app)
      .get("/api/v1/notifications?after=0&limit=2")
      .set("Cookie", session.cookie);
    expect(firstPage.body.meta).toMatchObject({
      nextCursor: notifications[1].sequence.toString(),
      hasMore: true,
    });
    const secondPage = await request(app)
      .get(`/api/v1/notifications?after=${firstPage.body.meta.nextCursor}&limit=2`)
      .set("Cookie", session.cookie);
    expect(secondPage.body.data.notifications.map((notification) => notification.id)).toEqual([
      notifications[2].id,
    ]);
    expect(secondPage.body.meta.hasMore).toBe(false);

    const unread = await request(app)
      .get("/api/v1/notifications/unread-count")
      .set("Cookie", session.cookie);
    expect(unread.body.data.unreadCount).toBe(3);
    const readThrough = await request(app)
      .post("/api/v1/notifications/read-all")
      .set("Cookie", session.cookie)
      .set("Origin", origin)
      .set("X-CSRF-Token", session.csrfToken)
      .send({ highWaterCursor: notifications[1].sequence.toString() });
    expect(readThrough.body.data.updatedCount).toBe(2);
    expect(
      await database.notification.count({ where: { recipientId: user.id, readAt: null } }),
    ).toBe(1);
  });

  it("rejects notification reads after the authenticated user is disabled", async () => {
    const user = await createUser("phase6-disabled-reader@example.com", "CUSTOMER");
    const session = await createSession(user.id);
    await database.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });

    const response = await request(app).get("/api/v1/notifications").set("Cookie", session.cookie);
    expect(response.status).toBe(401);
  });
});
