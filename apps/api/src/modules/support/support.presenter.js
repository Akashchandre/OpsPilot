import { presentMoney } from "../commerce/commerce.money.js";
import { SUPPORT_MESSAGE_VISIBILITIES } from "./support.constants.js";

const person = (user) => (user ? { id: user.id, displayName: user.displayName } : null);

export const supportTicketSummaryInclude = Object.freeze({
  requester: { select: { id: true, displayName: true } },
  assignee: { select: { id: true, displayName: true } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      currency: true,
      createdAt: true,
    },
  },
  _count: { select: { messages: true } },
});

export const supportTicketDetailInclude = Object.freeze({
  ...supportTicketSummaryInclude,
  messages: {
    include: { author: { select: { id: true, displayName: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  events: {
    include: { actor: { select: { id: true, displayName: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
});

function presentLinkedOrder(order) {
  if (!order) return null;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    total: presentMoney(order.total),
    currency: order.currency,
    createdAt: order.createdAt,
  };
}

export function presentSupportTicketSummary(ticket, { management = false } = {}) {
  const result = {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    category: ticket.category,
    subject: ticket.subject,
    priority: ticket.priority,
    status: ticket.status,
    version: ticket.version,
    assignee: person(ticket.assignee),
    linkedOrder: presentLinkedOrder(ticket.order),
    messageCount: ticket._count?.messages ?? ticket.messages?.length ?? 0,
    resolvedAt: ticket.resolvedAt,
    closedAt: ticket.closedAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
  if (management) result.requester = person(ticket.requester);
  return result;
}

function presentMessage(message) {
  return {
    id: message.id,
    visibility: message.visibility,
    body: message.body,
    author: person(message.author),
    createdAt: message.createdAt,
  };
}

function presentEvent(event, management) {
  const result = {
    id: event.id,
    eventType: event.eventType,
    source: event.source,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    fromPriority: event.fromPriority,
    toPriority: event.toPriority,
    reasonCode: event.reasonCode,
    actor: person(event.actor),
    createdAt: event.createdAt,
  };
  if (management) {
    result.previousAssigneeId = event.previousAssigneeId;
    result.nextAssigneeId = event.nextAssigneeId;
  }
  return result;
}

export function presentSupportTicket(ticket, { management = false } = {}) {
  return {
    ...presentSupportTicketSummary(ticket, { management }),
    messages: ticket.messages
      .filter(
        (message) =>
          management || message.visibility === SUPPORT_MESSAGE_VISIBILITIES.CUSTOMER_VISIBLE,
      )
      .map(presentMessage),
    history: ticket.events.map((event) => presentEvent(event, management)),
  };
}
