import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_KINDS,
  AUDIT_GENESIS_HASH,
  AUDIT_OUTCOMES,
  AUDIT_TARGET_TYPES,
} from "./modules/audit/audit.constants.js";
import { AuditMetadataError } from "./modules/audit/audit.metadata.js";
import { createAuditService } from "./modules/audit/audit.service.js";

dotenv.config({ path: ".env.test", override: true, quiet: true });

const config = loadEnvironment();
const database = createDatabase(config.databaseUrl);
const app = createApp({ config, database });
const origin = config.corsOrigin;
const password = "phase-five-audit-password";

async function clearAuditData() {
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

async function createActor(roleCode = "OWNER") {
  return database.user.create({
    data: {
      email: `${roleCode.toLowerCase()}-${randomUUID()}@example.com`,
      displayName: `${roleCode} Audit Actor`,
      passwordHash: "not-used-by-direct-audit-tests",
      roles: { create: { role: { connect: { code: roleCode } } } },
    },
  });
}

function auditReadDescriptor(actorId, metadata = {}) {
  return {
    action: AUDIT_ACTIONS.AUDIT_EVENTS_READ,
    outcome: AUDIT_OUTCOMES.SUCCESS,
    actorKind: AUDIT_ACTOR_KINDS.USER,
    actorUserId: actorId,
    targetType: AUDIT_TARGET_TYPES.AUDIT_STREAM,
    requestId: randomUUID(),
    metadata: {
      filterNames: [],
      page: 1,
      limit: 50,
      returnedCount: 0,
      total: 0,
      ...metadata,
    },
  };
}

async function registerAs(roleCode, label) {
  const agent = request.agent(app);
  const email = `audit-${label}-${randomUUID()}@example.com`;
  const registration = await agent
    .post("/api/v1/auth/register")
    .set("Origin", origin)
    .send({ displayName: `Audit ${label}`, email, password });
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
  return { agent, userId };
}

beforeEach(clearAuditData);

afterAll(async () => {
  await clearAuditData();
  await database.$disconnect();
});

describe.sequential("Phase 5 audit integrity", () => {
  it("serializes concurrent appends and verifies the stored chain", async () => {
    const actor = await createActor();
    const service = createAuditService(database, config);

    await Promise.all([
      service.appendStandalone(auditReadDescriptor(actor.id, { page: 1 })),
      service.appendStandalone(auditReadDescriptor(actor.id, { page: 2 })),
    ]);

    const events = await database.auditEvent.findMany({ orderBy: { sequence: "asc" } });
    expect(events.map((event) => event.sequence)).toEqual([1n, 2n]);
    expect(events[0].previousHash).toBe(AUDIT_GENESIS_HASH);
    expect(events[1].previousHash).toBe(events[0].eventHash);
    expect(await service.verifyChain()).toEqual({
      valid: true,
      checkedEvents: 2,
      reason: null,
      firstInvalidSequence: null,
    });
  });

  it("fails closed and rolls back a local mutation when audit metadata is rejected", async () => {
    const actor = await createActor();
    const service = createAuditService(database, config);

    await expect(
      database.$transaction(async (transaction) => {
        await transaction.user.update({
          where: { id: actor.id },
          data: { status: "DISABLED" },
        });
        await service.append(transaction, {
          ...auditReadDescriptor(actor.id),
          metadata: { sessionToken: "canary-secret" },
        });
      }),
    ).rejects.toBeInstanceOf(AuditMetadataError);

    expect((await database.user.findUnique({ where: { id: actor.id } })).status).toBe("ACTIVE");
    expect(await database.auditEvent.count()).toBe(0);
  });

  it("detects stored event mutation and an incorrect verification key", async () => {
    const actor = await createActor();
    const service = createAuditService(database, config);
    const stored = await service.appendStandalone(auditReadDescriptor(actor.id));

    await database.auditEvent.update({
      where: { id: stored.id },
      data: { metadata: { filterNames: [], page: 1, limit: 50, returnedCount: 99, total: 99 } },
    });
    expect((await service.verifyChain()).reason).toBe("EVENT_HASH_MISMATCH");

    await database.auditEvent.update({
      where: { id: stored.id },
      data: { metadata: stored.metadata },
    });
    const wrongKeyService = createAuditService(database, {
      ...config,
      audit: { ...config.audit, integrityKey: Buffer.alloc(32, 0x44).toString("base64") },
    });
    expect((await wrongKeyService.verifyChain()).reason).toBe("EVENT_HASH_MISMATCH");
  });

  it("preserves hashed actor identifiers by restricting actor deletion", async () => {
    const actor = await createActor();
    const service = createAuditService(database, config);
    await service.appendStandalone(auditReadDescriptor(actor.id));

    await expect(database.user.delete({ where: { id: actor.id } })).rejects.toMatchObject({
      code: "P2003",
    });
    expect((await service.verifyChain()).valid).toBe(true);
  });

  it("enforces owner-only bounded reads and audits each successful read once", async () => {
    const owner = await registerAs("OWNER", "owner");
    const admin = await registerAs("ADMIN", "admin");
    const customer = await registerAs("CUSTOMER", "customer");
    const service = createAuditService(database, config);
    await service.appendStandalone(auditReadDescriptor(owner.userId));

    expect((await request(app).get("/api/v1/audit-events")).status).toBe(401);
    expect((await admin.agent.get("/api/v1/audit-events")).status).toBe(403);
    expect((await customer.agent.get("/api/v1/audit-events")).status).toBe(403);
    expect(await database.auditEvent.count()).toBe(1);

    const firstRead = await owner.agent.get("/api/v1/audit-events?limit=10");
    expect(firstRead.status).toBe(200);
    expect(firstRead.body.data.auditEvents).toHaveLength(1);
    expect(firstRead.body.data.auditEvents[0]).toMatchObject({
      sequence: "1",
      action: AUDIT_ACTIONS.AUDIT_EVENTS_READ,
      actorUserId: owner.userId,
    });
    expect(firstRead.body.meta).toMatchObject({ page: 1, limit: 10, total: 1, totalPages: 1 });
    expect(await database.auditEvent.count()).toBe(2);

    const secondRead = await owner.agent.get("/api/v1/audit-events?limit=10");
    expect(secondRead.status).toBe(200);
    expect(secondRead.body.data.auditEvents).toHaveLength(2);
    expect(await database.auditEvent.count()).toBe(3);

    const newest = await database.auditEvent.findFirst({ orderBy: { sequence: "desc" } });
    expect(newest).toMatchObject({
      action: AUDIT_ACTIONS.AUDIT_EVENTS_READ,
      actorUserId: owner.userId,
      metadata: {
        filterNames: [],
        page: 1,
        limit: 10,
        returnedCount: 2,
        total: 2,
      },
    });

    const invalidRange = await owner.agent.get(
      "/api/v1/audit-events?from=2025-01-01T00%3A00%3A00Z&to=2026-08-28T00%3A00%3A00Z",
    );
    expect(invalidRange.status).toBe(422);
    expect(await database.auditEvent.count()).toBe(3);

    await database.user.update({ where: { id: owner.userId }, data: { status: "DISABLED" } });
    expect((await owner.agent.get("/api/v1/audit-events")).status).toBe(401);
    expect(await database.auditEvent.count()).toBe(3);
  });

  it("exposes no audit mutation route", async () => {
    const owner = await registerAs("OWNER", "mutation-owner");
    const response = await owner.agent
      .post("/api/v1/audit-events")
      .set("Origin", origin)
      .send({ action: "FORGED" });

    expect(response.status).toBe(404);
    expect(await database.auditEvent.count()).toBe(0);
  });
});
