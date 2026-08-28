import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App.jsx";

function apiResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

const customer = {
  id: "1d7408ed-b33a-4cc2-bf87-8c7f2cf91af4",
  email: "customer@example.com",
  displayName: "Customer",
  status: "ACTIVE",
  roles: ["CUSTOMER"],
  permissions: [],
};

const admin = {
  id: "10d4fe71-cecc-4dc6-92c9-410b5301d7bf",
  email: "admin@example.com",
  displayName: "Administrator",
  status: "ACTIVE",
  roles: ["ADMIN"],
  permissions: ["support:tickets:read", "support:tickets:manage", "users:read", "reports:read"],
};

const ticketId = "2ec53982-b1d6-4cc5-a87d-f5480b714e49";
const orderId = "b5e7e41d-a553-450e-993a-443922921495";
const createdAt = "2026-08-28T08:00:00.000Z";

function summary(overrides = {}) {
  return {
    id: ticketId,
    ticketNumber: "SP-2EC53982B1D64CC5A8",
    category: "ORDER",
    subject: "Checkout status needs review",
    priority: "HIGH",
    status: "WAITING_CUSTOMER",
    version: 1,
    assignee: { id: admin.id, displayName: admin.displayName },
    linkedOrder: null,
    messageCount: 2,
    resolvedAt: null,
    closedAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function detail(overrides = {}) {
  return {
    ...summary(),
    requester: { id: customer.id, displayName: customer.displayName },
    messages: [
      {
        id: "87497509-7331-4c0b-9077-818bba98fe84",
        visibility: "CUSTOMER_VISIBLE",
        body: "<script>alert('plain text only')</script>",
        author: { id: customer.id, displayName: customer.displayName },
        createdAt,
      },
      {
        id: "a202ca62-2a3e-4bb8-947f-7c2b07d070f5",
        visibility: "INTERNAL",
        body: "Operator-only triage note.",
        author: { id: admin.id, displayName: admin.displayName },
        createdAt,
      },
    ],
    history: [
      {
        id: "54982df2-1402-4cbc-b31c-8d9809518c99",
        eventType: "CREATED",
        source: "CUSTOMER",
        fromStatus: null,
        toStatus: "OPEN",
        fromPriority: null,
        toPriority: null,
        reasonCode: "CUSTOMER_TICKET_CREATED",
        actor: { id: customer.id, displayName: customer.displayName },
        createdAt,
      },
    ],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
  document.cookie = "opspilot_csrf=; Max-Age=0; path=/";
});

describe("Phase 5 support UI", () => {
  it("lists and filters owned tickets, including the empty state", async () => {
    window.history.replaceState({}, "", "/support");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url.endsWith("/auth/me")) {
          return apiResponse(200, { success: true, data: { user: customer } });
        }
        if (url.includes("/support/tickets?view=self")) {
          const empty = url.includes("status=CLOSED");
          return apiResponse(200, {
            success: true,
            data: { tickets: empty ? [] : [summary()] },
            meta: { page: 1, limit: 20, total: empty ? 0 : 1, totalPages: empty ? 0 : 1 },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    const user = userEvent.setup();

    render(<App />);
    expect(await screen.findByText("SP-2EC53982B1D64CC5A8")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create ticket" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Status"), "CLOSED");
    expect(
      await screen.findByRole("heading", { name: "No support tickets found" }),
    ).toBeInTheDocument();
  });

  it("shows a safe failure state when the customer support list is unavailable", async () => {
    window.history.replaceState({}, "", "/support");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url.endsWith("/auth/me")) {
          return apiResponse(200, { success: true, data: { user: customer } });
        }
        if (url.includes("/support/tickets?view=self")) {
          return apiResponse(503, {
            success: false,
            error: { code: "SUPPORT_UNAVAILABLE", message: "Support is temporarily unavailable" },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Support is temporarily unavailable",
    );
  });

  it("creates a ticket with an owned order and renders stored markup as plain text", async () => {
    window.history.replaceState({}, "", "/support/new");
    document.cookie = "opspilot_csrf=support-create-token; path=/";
    const ticket = detail({
      linkedOrder: {
        id: orderId,
        orderNumber: "OP-B5E7E41DA553450E99",
        status: "CONFIRMED",
        total: "125.00",
        currency: "INR",
        createdAt,
      },
      messages: [detail().messages[0]],
    });
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.endsWith("/auth/me")) {
        return apiResponse(200, { success: true, data: { user: customer } });
      }
      if (url.includes("/orders?view=self")) {
        return apiResponse(200, {
          success: true,
          data: {
            orders: [
              {
                id: orderId,
                orderNumber: "OP-B5E7E41DA553450E99",
                status: "CONFIRMED",
              },
            ],
          },
          meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
        });
      }
      if (url.endsWith("/support/tickets") && options.method === "POST") {
        expect(options.headers["X-CSRF-Token"]).toBe("support-create-token");
        expect(options.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
        expect(JSON.parse(options.body)).toMatchObject({
          category: "ORDER",
          subject: "Checkout status needs review",
          orderId,
        });
        return apiResponse(201, { success: true, data: { ticket } });
      }
      if (url.includes(`/support/tickets/${ticketId}?view=self`)) {
        return apiResponse(200, { success: true, data: { ticket } });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);
    await screen.findByRole("heading", { name: "Create a support ticket" });
    await user.selectOptions(screen.getByLabelText("Category"), "ORDER");
    await user.type(screen.getByLabelText(/^Subject/), "Checkout status needs review");
    await user.type(screen.getByLabelText(/^Message/), "<script>alert('plain text only')</script>");
    await user.selectOptions(screen.getByLabelText("Related order (optional)"), orderId);
    await user.click(screen.getByRole("button", { name: "Create ticket" }));

    expect(await screen.findByText("Your support ticket was created.")).toBeInTheDocument();
    expect(screen.getByText("<script>alert('plain text only')</script>")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("shows reply reopen guidance, optimistic conflict errors, and a terminal close state", async () => {
    window.history.replaceState({}, "", `/support/${ticketId}`);
    document.cookie = "opspilot_csrf=support-detail-token; path=/";
    let ticket = detail({ messages: [detail().messages[0]] });
    let replyAttempted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options = {}) => {
        if (url.endsWith("/auth/me")) {
          return apiResponse(200, { success: true, data: { user: customer } });
        }
        if (url.includes(`/support/tickets/${ticketId}?view=self`)) {
          return apiResponse(200, { success: true, data: { ticket } });
        }
        if (url.endsWith(`/support/tickets/${ticketId}/messages`) && options.method === "POST") {
          replyAttempted = true;
          return apiResponse(409, {
            success: false,
            error: {
              code: "RESOURCE_VERSION_CONFLICT",
              message: "This ticket changed. Refresh it and try again.",
            },
          });
        }
        if (url.endsWith(`/support/tickets/${ticketId}/closure`) && options.method === "POST") {
          expect(options.headers["X-CSRF-Token"]).toBe("support-detail-token");
          ticket = { ...ticket, status: "CLOSED", version: 2, closedAt: createdAt };
          return apiResponse(200, { success: true, data: { ticket } });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    const user = userEvent.setup();

    render(<App />);
    expect(await screen.findByText("Your reply will reopen this ticket.")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Message/), "Requested information");
    await user.click(screen.getByRole("button", { name: "Send reply" }));
    expect(replyAttempted).toBe(true);
    expect(await screen.findByRole("alert")).toHaveTextContent("This ticket changed");
    await user.click(screen.getByRole("button", { name: "Close ticket" }));
    expect(
      await screen.findByRole("heading", { name: "This ticket is closed" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send reply" })).not.toBeInTheDocument();
  });

  it("shows internal notes distinctly and lets an operator update and reply", async () => {
    window.history.replaceState({}, "", "/admin/support");
    document.cookie = "opspilot_csrf=support-admin-token; path=/";
    let managedTicket = detail();
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.endsWith("/auth/me")) {
        return apiResponse(200, { success: true, data: { user: admin } });
      }
      if (url.startsWith("http://127.0.0.1:4000/api/v1/users?")) {
        return apiResponse(200, {
          success: true,
          data: { users: [admin] },
          meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
        });
      }
      if (url.includes("/support/tickets?view=management")) {
        return apiResponse(200, {
          success: true,
          data: { tickets: [{ ...summary(), requester: managedTicket.requester }] },
          meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
        });
      }
      if (url.includes(`/support/tickets/${ticketId}?view=management`)) {
        return apiResponse(200, { success: true, data: { ticket: managedTicket } });
      }
      if (url.endsWith(`/support/tickets/${ticketId}`) && options.method === "PATCH") {
        expect(options.headers["X-CSRF-Token"]).toBe("support-admin-token");
        const body = JSON.parse(options.body);
        managedTicket = { ...managedTicket, ...body, version: body.version + 1 };
        return apiResponse(200, { success: true, data: { ticket: managedTicket } });
      }
      if (url.endsWith(`/support/tickets/${ticketId}/messages`) && options.method === "POST") {
        const body = JSON.parse(options.body);
        expect(body.visibility).toBe("INTERNAL");
        managedTicket = {
          ...managedTicket,
          messages: [
            ...managedTicket.messages,
            {
              id: "d7927f85-06a5-414e-a6ce-770a264899a0",
              ...body,
              author: { id: admin.id, displayName: admin.displayName },
              createdAt,
            },
          ],
        };
        return apiResponse(201, { success: true, data: { ticket: managedTicket } });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);
    const card = await screen.findByRole("button", { name: /Checkout status needs review/ });
    await user.click(card);
    expect(await screen.findByText("Operator-only triage note.")).toBeInTheDocument();
    const existingInternal = screen.getByText("Operator-only triage note.").closest("article");
    expect(existingInternal).toHaveClass("support-message--internal");
    expect(within(existingInternal).getByText(/Internal note/)).toBeInTheDocument();

    const detailPanel = screen.getByText(/Requested by Customer/).closest("aside");
    await user.selectOptions(within(detailPanel).getByLabelText("Status"), "RESOLVED");
    await user.click(within(detailPanel).getByRole("button", { name: "Save ticket" }));
    await waitFor(() => expect(within(detailPanel).getByText(/Version 2/)).toBeInTheDocument());

    await user.selectOptions(within(detailPanel).getByLabelText("Visibility"), "INTERNAL");
    await user.type(within(detailPanel).getByLabelText("Message"), "Fresh private note");
    await user.click(within(detailPanel).getByRole("button", { name: "Add message" }));
    expect(await within(detailPanel).findByText("Fresh private note")).toBeInTheDocument();
  });

  it("renders an authorization state for a customer on the operator route", async () => {
    window.history.replaceState({}, "", "/admin/support");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url.endsWith("/auth/me")) {
          return apiResponse(200, { success: true, data: { user: customer } });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Access denied" })).toBeInTheDocument();
  });
});
