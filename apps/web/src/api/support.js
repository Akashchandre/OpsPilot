import { apiRequest } from "./client.js";

function queryString(values) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  }
  return query.toString();
}

export async function listSupportTickets({
  view = "self",
  status = "ALL",
  priority = "ALL",
  category = "ALL",
  assignee,
  requester,
  search,
  sort = "updatedAt",
  direction = "desc",
  page = 1,
  limit = 20,
  signal,
} = {}) {
  const response = await apiRequest(
    `/support/tickets?${queryString({
      view,
      status,
      priority,
      category,
      assignee,
      requester,
      search,
      sort,
      direction,
      page,
      limit,
    })}`,
    { signal },
  );
  return { tickets: response.data.tickets, meta: response.meta };
}

export async function getSupportTicket(ticketId, { view = "self", signal } = {}) {
  const response = await apiRequest(`/support/tickets/${ticketId}?${queryString({ view })}`, {
    signal,
  });
  return response.data.ticket;
}

export async function createSupportTicket(input, idempotencyKey) {
  const response = await apiRequest("/support/tickets", {
    method: "POST",
    body: input,
    requiresCsrf: true,
    idempotencyKey,
  });
  return response.data.ticket;
}

export async function addSupportMessage(ticketId, input, idempotencyKey) {
  const response = await apiRequest(`/support/tickets/${ticketId}/messages`, {
    method: "POST",
    body: input,
    requiresCsrf: true,
    idempotencyKey,
  });
  return response.data.ticket;
}

export async function closeSupportTicket(ticketId, version) {
  const response = await apiRequest(`/support/tickets/${ticketId}/closure`, {
    method: "POST",
    body: { version },
    requiresCsrf: true,
  });
  return response.data.ticket;
}

export async function updateSupportTicket(ticketId, input) {
  const response = await apiRequest(`/support/tickets/${ticketId}`, {
    method: "PATCH",
    body: input,
    requiresCsrf: true,
  });
  return response.data.ticket;
}
