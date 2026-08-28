import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import { AUDIT_GENESIS_HASH } from "./modules/audit/audit.constants.js";

dotenv.config({ path: ".env.test", override: true, quiet: true });

const config = loadEnvironment();
const database = createDatabase(config.databaseUrl);
const phase5Permissions = [
  "support:tickets:read",
  "support:tickets:manage",
  "reports:read",
  "audit:read",
];

async function clearFoundationData() {
  await database.auditEvent.deleteMany();
  await database.auditChainHead.update({
    where: { id: 1 },
    data: { headSequence: 0n, headHash: AUDIT_GENESIS_HASH },
  });
  await database.supportTicketEvent.deleteMany();
  await database.supportTicketMessage.deleteMany();
  await database.supportTicket.deleteMany();
  await database.securityEvent.deleteMany();
  await database.authSession.deleteMany();
  await database.userRole.deleteMany();
  await database.user.deleteMany();
}

beforeEach(clearFoundationData);

afterAll(async () => {
  await clearFoundationData();
  await database.$disconnect();
});

describe.sequential("Phase 5 persistence foundation", () => {
  it("seeds the approved role permissions and audit chain head", async () => {
    const roles = await database.role.findMany({
      where: { code: { in: ["OWNER", "ADMIN", "CUSTOMER"] } },
      include: {
        rolePermissions: {
          where: { permission: { code: { in: phase5Permissions } } },
          include: { permission: true },
        },
      },
    });
    const mapping = Object.fromEntries(
      roles.map((role) => [
        role.code,
        role.rolePermissions.map((entry) => entry.permission.code).sort(),
      ]),
    );

    expect(mapping.OWNER).toEqual([...phase5Permissions].sort());
    expect(mapping.ADMIN).toEqual(
      ["reports:read", "support:tickets:manage", "support:tickets:read"].sort(),
    );
    expect(mapping.CUSTOMER).toEqual([]);

    const chainHead = await database.auditChainHead.findUnique({ where: { id: 1 } });
    expect(chainHead).toMatchObject({
      id: 1,
      headSequence: 0n,
      headHash: "0".repeat(64),
    });
  });

  it("persists immutable support messages and enforces scoped idempotency", async () => {
    const requester = await database.user.create({
      data: {
        email: "phase5-foundation@example.com",
        displayName: "Phase 5 Requester",
        passwordHash: "not-used-by-this-foundation-test",
        roles: { create: { role: { connect: { code: "CUSTOMER" } } } },
      },
    });
    const ticketKey = randomUUID();
    const messageKey = randomUUID();

    const ticket = await database.$transaction(async (transaction) => {
      const created = await transaction.supportTicket.create({
        data: {
          ticketNumber: "TKT-FOUNDATION-0001",
          requesterId: requester.id,
          category: "GENERAL",
          subject: "Foundation persistence check",
          idempotencyKey: ticketKey,
          requestHash: "a".repeat(64),
        },
      });
      await transaction.supportTicketMessage.create({
        data: {
          ticketId: created.id,
          authorUserId: requester.id,
          body: "The first customer-visible support message.",
          idempotencyKey: messageKey,
          requestHash: "b".repeat(64),
        },
      });
      await transaction.supportTicketEvent.create({
        data: {
          ticketId: created.id,
          eventType: "CREATED",
          source: "CUSTOMER",
          toStatus: "OPEN",
          reasonCode: "TICKET_CREATED",
          actorUserId: requester.id,
          requestId: randomUUID(),
        },
      });
      return created;
    });

    const stored = await database.supportTicket.findUnique({
      where: { id: ticket.id },
      include: { messages: true, events: true },
    });
    expect(stored).toMatchObject({
      requesterId: requester.id,
      status: "OPEN",
      priority: "NORMAL",
      version: 0,
    });
    expect(stored.messages).toHaveLength(1);
    expect(stored.messages[0].visibility).toBe("CUSTOMER_VISIBLE");
    expect(stored.events).toHaveLength(1);

    await expect(
      database.supportTicketMessage.create({
        data: {
          ticketId: ticket.id,
          authorUserId: requester.id,
          body: "A duplicate retry must not create another logical message.",
          idempotencyKey: messageKey,
          requestHash: "c".repeat(64),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
