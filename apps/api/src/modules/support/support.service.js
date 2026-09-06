import { randomUUID } from "node:crypto";
import { PERMISSIONS, USER_STATUSES } from "../auth/auth.constants.js";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_KINDS,
  AUDIT_OUTCOMES,
  AUDIT_TARGET_TYPES,
} from "../audit/audit.constants.js";
import { createAuditService } from "../audit/audit.service.js";
import { digestRequest } from "../commerce/commerce.money.js";
import { JOB_TYPES } from "../jobs/jobs.constants.js";
import { enqueueJob } from "../jobs/jobs.queue.js";
import {
  SUPPORT_EVENT_SOURCES,
  SUPPORT_EVENT_TYPES,
  SUPPORT_MESSAGE_VISIBILITIES,
  SUPPORT_STATUSES,
  SUPPORT_TRANSITIONS,
} from "./support.constants.js";
import {
  isPrismaUniqueViolation,
  isPrismaWriteConflict,
  supportError,
  supportIdempotencyConflict,
  supportNotFound,
  supportVersionConflict,
} from "./support.errors.js";
import {
  presentSupportTicket,
  presentSupportTicketSummary,
  supportTicketDetailInclude,
  supportTicketSummaryInclude,
} from "./support.presenter.js";

function ticketNumberFromId(ticketId) {
  return `SP-${ticketId.replaceAll("-", "").slice(0, 18).toUpperCase()}`;
}

function paginationMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

function mapWriteError(error) {
  if (error?.isOperational) throw error;
  if (isPrismaWriteConflict(error)) throw supportVersionConflict();
  throw error;
}

function ticketWhere(actorUserId, ticketId, management) {
  return { id: ticketId, ...(management ? {} : { requesterId: actorUserId }) };
}

async function loadTicket(database, { actorUserId, ticketId, management, detail = true }) {
  const ticket = await database.supportTicket.findFirst({
    where: ticketWhere(actorUserId, ticketId, management),
    include: detail ? supportTicketDetailInclude : supportTicketSummaryInclude,
  });
  if (!ticket) throw supportNotFound();
  return ticket;
}

function assertTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) return;
  if (!SUPPORT_TRANSITIONS[fromStatus].includes(toStatus)) {
    throw supportError(
      409,
      "SUPPORT_STATUS_TRANSITION_INVALID",
      `Support ticket cannot move from ${fromStatus} to ${toStatus}`,
    );
  }
}

function eligibleAssigneeWhere(userId) {
  return {
    id: userId,
    status: USER_STATUSES.ACTIVE,
    roles: {
      some: {
        role: {
          rolePermissions: {
            some: { permission: { code: PERMISSIONS.SUPPORT_TICKETS_MANAGE } },
          },
        },
      },
    },
  };
}

async function isEligibleAssignee(transaction, userId) {
  if (!userId) return false;
  return Boolean(
    await transaction.user.findFirst({
      where: eligibleAssigneeWhere(userId),
      select: { id: true },
    }),
  );
}

function auditDescriptor({ action, actorUserId, targetId, requestId, metadata }) {
  return {
    action,
    outcome: AUDIT_OUTCOMES.SUCCESS,
    actorKind: AUDIT_ACTOR_KINDS.USER,
    actorUserId,
    targetType: AUDIT_TARGET_TYPES.SUPPORT_TICKET,
    targetId,
    requestId,
    metadata,
  };
}

function listWhere(actorUserId, query, management) {
  const where = management ? {} : { requesterId: actorUserId };
  if (query.status !== "ALL") where.status = query.status;
  if (query.priority !== "ALL") where.priority = query.priority;
  if (query.category !== "ALL") where.category = query.category;
  if (management && query.requester) where.requesterId = query.requester;
  if (management && query.assignee) {
    where.assigneeId = query.assignee === "UNASSIGNED" ? null : query.assignee;
  }
  if (query.search) {
    where.OR = [
      { ticketNumber: { contains: query.search } },
      { subject: { contains: query.search } },
    ];
  }
  return where;
}

function updateAuditMetadata(ticket, input, changeKinds) {
  return {
    changeKinds,
    fromStatus: changeKinds.includes("STATUS") ? ticket.status : null,
    toStatus: changeKinds.includes("STATUS") ? input.status : null,
    fromPriority: changeKinds.includes("PRIORITY") ? ticket.priority : null,
    toPriority: changeKinds.includes("PRIORITY") ? input.priority : null,
    previousAssigneeSet: changeKinds.includes("ASSIGNEE") ? ticket.assigneeId !== null : null,
    nextAssigneeSet: changeKinds.includes("ASSIGNEE") ? input.assigneeId !== null : null,
  };
}

export function createSupportService(database, config) {
  const appendAudit = createAuditService(database, config).append;

  async function findIdempotentTicket(requesterId, idempotencyKey, requestHash) {
    const ticket = await database.supportTicket.findUnique({
      where: { requesterId_idempotencyKey: { requesterId, idempotencyKey } },
      include: supportTicketDetailInclude,
    });
    if (!ticket) return null;
    if (ticket.requestHash !== requestHash) throw supportIdempotencyConflict();
    return ticket;
  }

  return {
    async create({ actor, input, idempotencyKey, requestId }) {
      const requestHash = digestRequest(input);
      const existing = await findIdempotentTicket(actor.id, idempotencyKey, requestHash);
      if (existing) {
        return { ticket: presentSupportTicket(existing), replayed: true };
      }

      let created;
      try {
        created = await database.$transaction(
          async (transaction) => {
            const raced = await transaction.supportTicket.findUnique({
              where: {
                requesterId_idempotencyKey: { requesterId: actor.id, idempotencyKey },
              },
              include: supportTicketDetailInclude,
            });
            if (raced) {
              if (raced.requestHash !== requestHash) throw supportIdempotencyConflict();
              return { ticket: raced, replayed: true };
            }

            if (input.orderId) {
              const ownedOrder = await transaction.order.findFirst({
                where: { id: input.orderId, userId: actor.id },
                select: { id: true },
              });
              if (!ownedOrder) {
                throw supportError(
                  422,
                  "SUPPORT_ORDER_LINK_INVALID",
                  "The selected order cannot be linked to this ticket",
                );
              }
            }

            const ticketId = randomUUID();
            const ticketEventId = randomUUID();
            await transaction.supportTicket.create({
              data: {
                id: ticketId,
                ticketNumber: ticketNumberFromId(ticketId),
                requesterId: actor.id,
                orderId: input.orderId,
                category: input.category,
                subject: input.subject,
                idempotencyKey,
                requestHash,
                messages: {
                  create: {
                    authorUserId: actor.id,
                    visibility: SUPPORT_MESSAGE_VISIBILITIES.CUSTOMER_VISIBLE,
                    body: input.message,
                    idempotencyKey,
                    requestHash: digestRequest({
                      body: input.message,
                      visibility: SUPPORT_MESSAGE_VISIBILITIES.CUSTOMER_VISIBLE,
                    }),
                  },
                },
                events: {
                  create: {
                    id: ticketEventId,
                    eventType: SUPPORT_EVENT_TYPES.CREATED,
                    source: SUPPORT_EVENT_SOURCES.CUSTOMER,
                    toStatus: SUPPORT_STATUSES.OPEN,
                    reasonCode: "CUSTOMER_TICKET_CREATED",
                    actorUserId: actor.id,
                    requestId,
                  },
                },
              },
            });

            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.SUPPORT_TICKET_CREATED,
                actorUserId: actor.id,
                targetId: ticketId,
                requestId,
                metadata: { category: input.category, orderLinked: Boolean(input.orderId) },
              }),
            );
            await enqueueJob(transaction, config, {
              type: JOB_TYPES.NOTIFICATION_SUPPORT_TICKET_CREATED,
              dedupeKey: `support-created:${ticketEventId}`,
              payload: { sourceEventId: ticketEventId, supportTicketId: ticketId },
              sourceRequestId: requestId,
              sourceActorUserId: actor.id,
            });

            return {
              ticket: await loadTicket(transaction, {
                actorUserId: actor.id,
                ticketId,
                management: false,
              }),
              replayed: false,
            };
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        if (isPrismaUniqueViolation(error)) {
          const raced = await findIdempotentTicket(actor.id, idempotencyKey, requestHash);
          if (raced) return { ticket: presentSupportTicket(raced), replayed: true };
        }
        mapWriteError(error);
      }

      return {
        ticket: presentSupportTicket(created.ticket),
        replayed: created.replayed,
      };
    },

    async list({ actorUserId, query, management }) {
      const where = listWhere(actorUserId, query, management);
      const [tickets, total] = await database.$transaction([
        database.supportTicket.findMany({
          where,
          include: supportTicketSummaryInclude,
          orderBy: [{ [query.sort]: query.direction }, { id: "asc" }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        database.supportTicket.count({ where }),
      ]);
      return {
        tickets: tickets.map((ticket) => presentSupportTicketSummary(ticket, { management })),
        meta: paginationMeta(query.page, query.limit, total),
      };
    },

    async get({ actorUserId, ticketId, management }) {
      return presentSupportTicket(
        await loadTicket(database, { actorUserId, ticketId, management }),
        { management },
      );
    },

    async addMessage({
      actor,
      ticketId,
      input,
      idempotencyKey,
      requestId,
      management,
      origin = "HUMAN",
      workflowRunId = null,
    }) {
      if (!management && input.visibility !== SUPPORT_MESSAGE_VISIBILITIES.CUSTOMER_VISIBLE) {
        throw supportError(
          403,
          "SUPPORT_INTERNAL_NOTE_FORBIDDEN",
          "Only support operators may add internal notes",
        );
      }
      const requestHash =
        origin === "HUMAN" && workflowRunId === null
          ? digestRequest(input)
          : digestRequest({ input, origin, workflowRunId });

      let result;
      try {
        result = await database.$transaction(
          async (transaction) => {
            const ticket = await loadTicket(transaction, {
              actorUserId: actor.id,
              ticketId,
              management,
              detail: false,
            });
            const existing = await transaction.supportTicketMessage.findUnique({
              where: {
                ticketId_authorUserId_idempotencyKey: {
                  ticketId,
                  authorUserId: actor.id,
                  idempotencyKey,
                },
              },
            });
            if (existing) {
              if (existing.requestHash !== requestHash) throw supportIdempotencyConflict();
              return {
                ticket: await loadTicket(transaction, {
                  actorUserId: actor.id,
                  ticketId,
                  management,
                }),
                replayed: true,
              };
            }
            if (ticket.status === SUPPORT_STATUSES.CLOSED) {
              throw supportError(
                409,
                "SUPPORT_TICKET_CLOSED",
                "Messages cannot be added to a closed ticket",
              );
            }

            const automaticReopen =
              !management &&
              [SUPPORT_STATUSES.WAITING_CUSTOMER, SUPPORT_STATUSES.RESOLVED].includes(
                ticket.status,
              );
            const message = await transaction.supportTicketMessage.create({
              data: {
                ticketId,
                authorUserId: actor.id,
                visibility: management
                  ? input.visibility
                  : SUPPORT_MESSAGE_VISIBILITIES.CUSTOMER_VISIBLE,
                body: input.body,
                idempotencyKey,
                requestHash,
                origin,
                workflowRunId,
              },
            });

            if (automaticReopen) {
              await transaction.supportTicket.update({
                where: { id: ticketId },
                data: {
                  status: SUPPORT_STATUSES.OPEN,
                  resolvedAt: null,
                  version: { increment: 1 },
                },
              });
              const statusEvent = await transaction.supportTicketEvent.create({
                data: {
                  ticketId,
                  eventType: SUPPORT_EVENT_TYPES.STATUS_CHANGED,
                  source: SUPPORT_EVENT_SOURCES.CUSTOMER,
                  fromStatus: ticket.status,
                  toStatus: SUPPORT_STATUSES.OPEN,
                  reasonCode: "CUSTOMER_REPLY_REOPENED",
                  actorUserId: actor.id,
                  requestId,
                },
              });
              await appendAudit(
                transaction,
                auditDescriptor({
                  action: AUDIT_ACTIONS.SUPPORT_TICKET_UPDATED,
                  actorUserId: actor.id,
                  targetId: ticketId,
                  requestId,
                  metadata: {
                    changeKinds: ["STATUS"],
                    fromStatus: ticket.status,
                    toStatus: SUPPORT_STATUSES.OPEN,
                    fromPriority: null,
                    toPriority: null,
                    previousAssigneeSet: null,
                    nextAssigneeSet: null,
                  },
                }),
              );
              await enqueueJob(transaction, config, {
                type: JOB_TYPES.NOTIFICATION_SUPPORT_STATUS_CHANGED,
                dedupeKey: `support-status:${statusEvent.id}`,
                payload: { sourceEventId: statusEvent.id, supportTicketId: ticketId },
                sourceRequestId: requestId,
                sourceActorUserId: actor.id,
              });
            } else {
              await transaction.supportTicket.update({
                where: { id: ticketId },
                data: { updatedAt: new Date() },
              });
            }

            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.SUPPORT_MESSAGE_ADDED,
                actorUserId: actor.id,
                targetId: ticketId,
                requestId,
                metadata: {
                  visibility: management
                    ? input.visibility
                    : SUPPORT_MESSAGE_VISIBILITIES.CUSTOMER_VISIBLE,
                  automaticReopen,
                  origin,
                },
              }),
            );
            if (message.visibility === SUPPORT_MESSAGE_VISIBILITIES.CUSTOMER_VISIBLE) {
              await enqueueJob(transaction, config, {
                type: JOB_TYPES.NOTIFICATION_SUPPORT_PUBLIC_REPLY_CREATED,
                dedupeKey: `support-reply:${message.id}`,
                payload: {
                  sourceEventId: message.id,
                  supportTicketId: ticketId,
                  messageId: message.id,
                },
                sourceRequestId: requestId,
                sourceActorUserId: actor.id,
              });
            }

            return {
              ticket: await loadTicket(transaction, {
                actorUserId: actor.id,
                ticketId,
                management,
              }),
              replayed: false,
            };
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        if (isPrismaUniqueViolation(error)) {
          if (workflowRunId) {
            const published = await database.supportTicketMessage.findUnique({
              where: { workflowRunId },
            });
            if (published?.requestHash === requestHash) {
              return {
                ticket: presentSupportTicket(
                  await loadTicket(database, {
                    actorUserId: actor.id,
                    ticketId,
                    management,
                  }),
                  { management },
                ),
                replayed: true,
                messageId: published.id,
              };
            }
          }
          const existing = await database.supportTicketMessage.findUnique({
            where: {
              ticketId_authorUserId_idempotencyKey: {
                ticketId,
                authorUserId: actor.id,
                idempotencyKey,
              },
            },
          });
          if (existing?.requestHash === requestHash) {
            return {
              ticket: presentSupportTicket(
                await loadTicket(database, {
                  actorUserId: actor.id,
                  ticketId,
                  management,
                }),
                { management },
              ),
              replayed: true,
            };
          }
          if (existing) throw supportIdempotencyConflict();
        }
        mapWriteError(error);
      }

      return {
        ticket: presentSupportTicket(result.ticket, { management }),
        replayed: result.replayed,
        ...(workflowRunId
          ? {
              messageId: result.ticket.messages.find(
                (message) => message.workflowRunId === workflowRunId,
              )?.id,
            }
          : {}),
      };
    },

    async closeOwn({ actor, ticketId, input, requestId }) {
      try {
        const ticket = await database.$transaction(
          async (transaction) => {
            const current = await loadTicket(transaction, {
              actorUserId: actor.id,
              ticketId,
              management: false,
              detail: false,
            });
            if (current.version !== input.version) throw supportVersionConflict();
            if (current.status === SUPPORT_STATUSES.CLOSED) {
              throw supportError(409, "SUPPORT_TICKET_CLOSED", "The ticket is already closed");
            }

            const updated = await transaction.supportTicket.updateMany({
              where: { id: ticketId, requesterId: actor.id, version: input.version },
              data: {
                status: SUPPORT_STATUSES.CLOSED,
                closedAt: new Date(),
                version: { increment: 1 },
              },
            });
            if (updated.count !== 1) throw supportVersionConflict();
            const statusEvent = await transaction.supportTicketEvent.create({
              data: {
                ticketId,
                eventType: SUPPORT_EVENT_TYPES.STATUS_CHANGED,
                source: SUPPORT_EVENT_SOURCES.CUSTOMER,
                fromStatus: current.status,
                toStatus: SUPPORT_STATUSES.CLOSED,
                reasonCode: "CUSTOMER_CLOSED",
                actorUserId: actor.id,
                requestId,
              },
            });
            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.SUPPORT_TICKET_CLOSED,
                actorUserId: actor.id,
                targetId: ticketId,
                requestId,
                metadata: { fromStatus: current.status, toStatus: SUPPORT_STATUSES.CLOSED },
              }),
            );
            await enqueueJob(transaction, config, {
              type: JOB_TYPES.NOTIFICATION_SUPPORT_STATUS_CHANGED,
              dedupeKey: `support-status:${statusEvent.id}`,
              payload: { sourceEventId: statusEvent.id, supportTicketId: ticketId },
              sourceRequestId: requestId,
              sourceActorUserId: actor.id,
            });
            return loadTicket(transaction, {
              actorUserId: actor.id,
              ticketId,
              management: false,
            });
          },
          { isolationLevel: "Serializable" },
        );
        return presentSupportTicket(ticket);
      } catch (error) {
        mapWriteError(error);
      }
    },

    async update({ actor, ticketId, input, requestId }) {
      try {
        const ticket = await database.$transaction(
          async (transaction) => {
            const current = await loadTicket(transaction, {
              actorUserId: actor.id,
              ticketId,
              management: true,
              detail: false,
            });
            if (current.version !== input.version) throw supportVersionConflict();

            const changeKinds = [];
            if (input.status !== undefined && input.status !== current.status) {
              changeKinds.push("STATUS");
            }
            if (input.priority !== undefined && input.priority !== current.priority) {
              changeKinds.push("PRIORITY");
            }
            if (input.assigneeId !== undefined && input.assigneeId !== current.assigneeId) {
              changeKinds.push("ASSIGNEE");
            }
            if (changeKinds.length === 0) {
              return loadTicket(transaction, {
                actorUserId: actor.id,
                ticketId,
                management: true,
              });
            }
            if (current.status === SUPPORT_STATUSES.CLOSED) {
              throw supportError(409, "SUPPORT_TICKET_CLOSED", "Closed tickets cannot be changed");
            }

            if (
              current.assigneeId &&
              !(await isEligibleAssignee(transaction, current.assigneeId))
            ) {
              const validReassignment =
                changeKinds.includes("ASSIGNEE") &&
                input.assigneeId &&
                (await isEligibleAssignee(transaction, input.assigneeId));
              if (!validReassignment) {
                throw supportError(
                  409,
                  "SUPPORT_ASSIGNEE_STALE",
                  "Reassign this ticket to an eligible support operator before changing it",
                );
              }
            }
            if (
              changeKinds.includes("ASSIGNEE") &&
              input.assigneeId &&
              !(await isEligibleAssignee(transaction, input.assigneeId))
            ) {
              throw supportError(
                422,
                "SUPPORT_ASSIGNEE_INELIGIBLE",
                "The selected assignee is not an active support operator",
              );
            }
            if (changeKinds.includes("STATUS")) {
              assertTransition(current.status, input.status);
            }

            const now = new Date();
            const updated = await transaction.supportTicket.updateMany({
              where: { id: ticketId, version: input.version },
              data: {
                ...(changeKinds.includes("STATUS")
                  ? {
                      status: input.status,
                      resolvedAt: input.status === SUPPORT_STATUSES.RESOLVED ? now : null,
                      ...(input.status === SUPPORT_STATUSES.CLOSED ? { closedAt: now } : {}),
                    }
                  : {}),
                ...(changeKinds.includes("PRIORITY") ? { priority: input.priority } : {}),
                ...(changeKinds.includes("ASSIGNEE") ? { assigneeId: input.assigneeId } : {}),
                version: { increment: 1 },
              },
            });
            if (updated.count !== 1) throw supportVersionConflict();

            let statusEvent = null;
            let assigneeEvent = null;
            if (changeKinds.includes("STATUS")) {
              statusEvent = await transaction.supportTicketEvent.create({
                data: {
                  ticketId,
                  eventType: SUPPORT_EVENT_TYPES.STATUS_CHANGED,
                  source: SUPPORT_EVENT_SOURCES.OPERATOR,
                  fromStatus: current.status,
                  toStatus: input.status,
                  reasonCode: "OPERATOR_STATUS_CHANGED",
                  actorUserId: actor.id,
                  requestId,
                },
              });
            }
            if (changeKinds.includes("PRIORITY")) {
              await transaction.supportTicketEvent.create({
                data: {
                  ticketId,
                  eventType: SUPPORT_EVENT_TYPES.PRIORITY_CHANGED,
                  source: SUPPORT_EVENT_SOURCES.OPERATOR,
                  fromPriority: current.priority,
                  toPriority: input.priority,
                  reasonCode: "OPERATOR_PRIORITY_CHANGED",
                  actorUserId: actor.id,
                  requestId,
                },
              });
            }
            if (changeKinds.includes("ASSIGNEE")) {
              assigneeEvent = await transaction.supportTicketEvent.create({
                data: {
                  ticketId,
                  eventType: SUPPORT_EVENT_TYPES.ASSIGNEE_CHANGED,
                  source: SUPPORT_EVENT_SOURCES.OPERATOR,
                  previousAssigneeId: current.assigneeId,
                  nextAssigneeId: input.assigneeId,
                  reasonCode: "OPERATOR_ASSIGNEE_CHANGED",
                  actorUserId: actor.id,
                  requestId,
                },
              });
            }
            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.SUPPORT_TICKET_UPDATED,
                actorUserId: actor.id,
                targetId: ticketId,
                requestId,
                metadata: updateAuditMetadata(current, input, changeKinds),
              }),
            );
            if (statusEvent) {
              await enqueueJob(transaction, config, {
                type: JOB_TYPES.NOTIFICATION_SUPPORT_STATUS_CHANGED,
                dedupeKey: `support-status:${statusEvent.id}`,
                payload: { sourceEventId: statusEvent.id, supportTicketId: ticketId },
                sourceRequestId: requestId,
                sourceActorUserId: actor.id,
              });
            }
            if (assigneeEvent) {
              await enqueueJob(transaction, config, {
                type: JOB_TYPES.NOTIFICATION_SUPPORT_ASSIGNMENT_CHANGED,
                dedupeKey: `support-assignment:${assigneeEvent.id}`,
                payload: { sourceEventId: assigneeEvent.id, supportTicketId: ticketId },
                sourceRequestId: requestId,
                sourceActorUserId: actor.id,
              });
            }
            return loadTicket(transaction, {
              actorUserId: actor.id,
              ticketId,
              management: true,
            });
          },
          { isolationLevel: "Serializable" },
        );
        return presentSupportTicket(ticket, { management: true });
      } catch (error) {
        mapWriteError(error);
      }
    },
  };
}
