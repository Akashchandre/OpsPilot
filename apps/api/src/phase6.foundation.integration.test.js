import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import { JOB_STATUSES, JOB_TYPES } from "./modules/jobs/jobs.constants.js";

dotenv.config({ path: ".env.test", override: true, quiet: true });

const config = loadEnvironment();
const database = createDatabase(config.databaseUrl);

async function expectConstraintViolation(operation) {
  try {
    await operation;
    throw new Error("Expected MySQL to reject a check constraint violation");
  } catch (error) {
    expect(["P2004", "P2039"]).toContain(error.code);
  }
}

async function clearFoundationData() {
  await database.notification.deleteMany();
  await database.backgroundJobAttempt.deleteMany();
  await database.backgroundJob.deleteMany({ where: { replayedFromJobId: { not: null } } });
  await database.backgroundJob.deleteMany();
  await database.workerHeartbeat.deleteMany();
  await database.supportTicketEvent.deleteMany();
  await database.supportTicketMessage.deleteMany();
  await database.supportTicket.deleteMany();
  await database.authSession.deleteMany();
  await database.userRole.deleteMany();
  await database.user.deleteMany();
}

async function createNotificationResource() {
  const user = await database.user.create({
    data: {
      email: `phase6-foundation-${randomUUID()}@example.com`,
      displayName: "Phase 6 Foundation",
      passwordHash: "not-used-by-this-test",
    },
  });
  const ticket = await database.supportTicket.create({
    data: {
      ticketNumber: `SP-FND-${randomUUID().slice(0, 8)}`,
      requesterId: user.id,
      category: "GENERAL",
      subject: "Phase 6 constraint resource",
      idempotencyKey: randomUUID(),
      requestHash: "f".repeat(64),
    },
  });
  return { user, ticket };
}

beforeEach(clearFoundationData);

afterAll(async () => {
  await clearFoundationData();
  await database.$disconnect();
});

describe.sequential("Phase 6 persistence foundation", () => {
  it("installs the claim indexes, uniqueness boundaries, and restrictive durable relationships", async () => {
    const indexRows = await database.$queryRaw`
      SELECT DISTINCT INDEX_NAME AS indexName
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('background_jobs', 'notifications')
    `;
    const indexes = indexRows.map((row) => row.indexName);
    expect(indexes).toEqual(
      expect.arrayContaining([
        "background_jobs_dedupe_key_key",
        "background_jobs_status_available_at_created_at_idx",
        "background_jobs_status_lease_expires_at_idx",
        "background_jobs_replay_idempotency_key",
        "notifications_sequence_key",
        "notifications_dedupe_key_key",
        "notifications_recipient_id_sequence_idx",
        "notifications_recipient_id_read_at_sequence_idx",
      ]),
    );

    const relationshipRows = await database.$queryRaw`
      SELECT CONSTRAINT_NAME AS constraintName, DELETE_RULE AS deleteRule
      FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND CONSTRAINT_NAME IN (
          'background_jobs_replayed_from_job_id_fkey',
          'background_job_attempts_job_id_fkey',
          'background_job_attempts_worker_instance_id_fkey',
          'notifications_recipient_id_fkey',
          'notifications_support_ticket_id_fkey'
        )
    `;
    const deleteRules = Object.fromEntries(
      relationshipRows.map((row) => [row.constraintName, row.deleteRule]),
    );
    for (const constraintName of Object.keys(deleteRules)) {
      expect(["RESTRICT", "NO ACTION"]).toContain(deleteRules[constraintName]);
    }
    expect(Object.keys(deleteRules)).toHaveLength(5);
  });

  it("enforces state, payload, resource, and attempt constraints in MySQL", async () => {
    const { user, ticket } = await createNotificationResource();
    const notification = await database.notification.create({
      data: {
        recipientId: user.id,
        type: "SUPPORT_STATUS_CHANGED",
        dedupeKey: "foundation:notification:one",
        metadata: { reference: ticket.ticketNumber, status: "OPEN", view: "SELF" },
        supportTicketId: ticket.id,
      },
    });
    const secondNotification = await database.notification.create({
      data: {
        recipientId: user.id,
        type: "SUPPORT_STATUS_CHANGED",
        dedupeKey: "foundation:notification:two",
        metadata: { reference: ticket.ticketNumber, status: "OPEN", view: "SELF" },
        supportTicketId: ticket.id,
      },
    });
    expect(secondNotification.sequence).toBeGreaterThan(notification.sequence);

    await expect(
      database.notification.create({
        data: {
          recipientId: user.id,
          type: "SUPPORT_STATUS_CHANGED",
          dedupeKey: notification.dedupeKey,
          metadata: { reference: ticket.ticketNumber, status: "OPEN", view: "SELF" },
          supportTicketId: ticket.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expectConstraintViolation(
      database.notification.create({
        data: {
          recipientId: user.id,
          type: "SUPPORT_STATUS_CHANGED",
          dedupeKey: "foundation:notification:missing-resource",
          metadata: { reference: ticket.ticketNumber, status: "OPEN", view: "SELF" },
        },
      }),
    );
    await expectConstraintViolation(
      database.backgroundJob.create({
        data: {
          type: JOB_TYPES.AUDIT_CHAIN_VERIFY,
          dedupeKey: "foundation:invalid-attempt-count",
          payload: { bucket: "2026-08-28" },
          maxAttempts: 0,
        },
      }),
    );
    await expectConstraintViolation(
      database.workerHeartbeat.create({
        data: { id: randomUUID(), state: "STOPPED" },
      }),
    );

    const worker = await database.workerHeartbeat.create({ data: { id: randomUUID() } });
    const job = await database.backgroundJob.create({
      data: {
        type: JOB_TYPES.AUDIT_CHAIN_VERIFY,
        dedupeKey: "foundation:attempt-hash",
        payload: { bucket: "2026-08-28" },
        status: JOB_STATUSES.PENDING,
      },
    });
    await expectConstraintViolation(
      database.backgroundJobAttempt.create({
        data: {
          jobId: job.id,
          attemptNumber: 1,
          workerInstanceId: worker.id,
          leaseTokenHash: "not-a-sha256-hash",
        },
      }),
    );
    await expect(database.supportTicket.delete({ where: { id: ticket.id } })).rejects.toMatchObject(
      { code: "P2003" },
    );
  });
});
