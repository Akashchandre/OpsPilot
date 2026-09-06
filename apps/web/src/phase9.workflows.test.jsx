import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    active: false,
    on() {
      return this;
    },
    close: vi.fn(),
    io: { on: vi.fn() },
  })),
}));

import App from "./App.jsx";

function apiResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function emptyNotifications(url) {
  if (url.includes("/notifications/unread-count")) {
    return apiResponse(200, { success: true, data: { unreadCount: 0 } });
  }
  if (url.includes("/notifications?")) {
    return apiResponse(200, {
      success: true,
      data: { notifications: [] },
      meta: { nextCursor: "0", hasMore: false, truncatedBefore: false, limit: 100 },
    });
  }
  return null;
}

const owner = {
  id: "10000000-0000-4000-8000-000000000009",
  email: "workflow-owner@example.com",
  displayName: "Workflow Owner",
  status: "ACTIVE",
  roles: ["OWNER"],
  permissions: ["ai:workflows:business:use"],
};

const admin = {
  ...owner,
  id: "20000000-0000-4000-8000-000000000009",
  email: "workflow-admin@example.com",
  displayName: "Workflow Admin",
  roles: ["ADMIN"],
  permissions: [
    "support:tickets:read",
    "support:tickets:manage",
    "orders:read",
    "ai:workflows:support:use",
    "ai:workflows:support:approve",
  ],
};

const customer = {
  ...owner,
  id: "30000000-0000-4000-8000-000000000009",
  email: "workflow-customer@example.com",
  displayName: "Workflow Customer",
  roles: ["CUSTOMER"],
  permissions: [],
};

const workflowNotice = {
  version: "groq-zdr-workflows-v1",
  provider: "GROQ",
  providerName: "Groq",
  title: "Controlled AI workflow processing notice",
  dataSent: "Only the bounded workflow context is sent to Groq.",
  retention: "Zero Data Retention must be confirmed.",
  generatedOutput: "The generated output may be incorrect.",
  warning: "Review generated output before relying on it.",
};

function consent(scope, active = true) {
  return {
    provider: "GROQ",
    assistant: scope === "business" ? "OWNER" : "SUPPORT",
    notice: workflowNotice,
    active,
    consentedAt: active ? "2026-09-06T01:00:00.000Z" : null,
    revokedAt: null,
  };
}

const ticketId = "40000000-0000-4000-8000-000000000009";
const ticket = {
  id: ticketId,
  ticketNumber: "SP-400000000000400080",
  category: "ORDER",
  subject: "Delivery policy question",
  priority: "NORMAL",
  status: "OPEN",
  version: 1,
  requester: { id: customer.id, displayName: customer.displayName },
  assignee: null,
  linkedOrder: null,
  messageCount: 1,
  resolvedAt: null,
  closedAt: null,
  createdAt: "2026-09-06T01:00:00.000Z",
  updatedAt: "2026-09-06T01:00:00.000Z",
  messages: [
    {
      id: "41000000-0000-4000-8000-000000000009",
      visibility: "CUSTOMER_VISIBLE",
      body: "When will my order arrive?",
      author: { id: customer.id, displayName: customer.displayName },
      createdAt: "2026-09-06T01:00:00.000Z",
    },
  ],
  history: [],
};

beforeEach(() => {
  document.cookie = "opspilot_csrf=phase9-ui-csrf; path=/";
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  document.cookie = "opspilot_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Phase 9 workflow UI", () => {
  it("starts an owner brief and separates generated interpretation from authoritative sources", async () => {
    window.history.replaceState({}, "", "/admin/workflows");
    const workflowRunId = "50000000-0000-4000-8000-000000000009";
    const completedRun = {
      id: workflowRunId,
      workflowCode: "OWNER_BUSINESS_BRIEF_V1",
      graphVersion: "v1",
      status: "SUCCEEDED",
      ticketId: null,
      focus: "GENERAL",
      version: 2,
      range: {
        from: "2026-08-01T00:00:00.000Z",
        to: "2026-09-01T00:00:00.000Z",
      },
      result: {
        summary: "Review <script>alert('plain text')</script> inventory pressure.",
        findings: [{ text: "One item needs attention.", sourceLabels: ["INVENTORY"] }],
        nextSteps: ["Open the authoritative inventory snapshot."],
        uncertainties: ["No demand forecast was performed."],
      },
      sources: [
        {
          toolCode: "INVENTORY_ATTENTION_V1",
          output: { items: [{ name: "Synthetic low stock item", onHand: 1 }] },
        },
      ],
      safeErrorCode: null,
      createdAt: "2026-09-06T01:00:00.000Z",
      completedAt: "2026-09-06T01:00:01.000Z",
    };
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.endsWith("/auth/me")) {
        return apiResponse(200, { success: true, data: { user: owner } });
      }
      const notification = emptyNotifications(url);
      if (notification) return notification;
      if (url.endsWith("/ai/workflow-consents/business")) {
        return apiResponse(200, { success: true, data: { consent: consent("business") } });
      }
      if (url.includes("/ai/workflow-runs?workflowCode=OWNER_BUSINESS_BRIEF_V1")) {
        return apiResponse(200, {
          success: true,
          data: { runs: [] },
          meta: { nextCursor: null, hasMore: false, limit: 20 },
        });
      }
      if (url.endsWith("/ai/workflows/owner-business-brief/runs") && options.method === "POST") {
        expect(options.headers["X-CSRF-Token"]).toBe("phase9-ui-csrf");
        expect(options.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/i);
        expect(JSON.parse(options.body).focus).toBe("GENERAL");
        return apiResponse(202, { success: true, data: { run: completedRun } });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    const rendered = render(<App />);

    expect(await screen.findByRole("heading", { name: "Business brief workflow" })).toBeVisible();
    expect(screen.getByRole("link", { name: "AI workflows" })).toBeInTheDocument();
    await browser.click(await screen.findByRole("button", { name: "Generate business brief" }));
    expect(await screen.findByRole("heading", { name: "Business brief" })).toBeVisible();
    expect(screen.getByText(/Review <script>alert/)).toBeInTheDocument();
    expect(screen.getByText("Authoritative calculation basis")).toBeInTheDocument();
    expect(screen.getByText("Inventory attention")).toBeInTheDocument();
    expect(rendered.container.querySelector("script")).toBeNull();
  });

  it("requires owner workflow consent and keeps cancellation and revocation available", async () => {
    window.history.replaceState({}, "", "/admin/workflows");
    const workflowRunId = "51000000-0000-4000-8000-000000000009";
    let consentActive = false;
    let cancelled = false;
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.endsWith("/auth/me")) {
        return apiResponse(200, { success: true, data: { user: owner } });
      }
      const notification = emptyNotifications(url);
      if (notification) return notification;
      if (
        url.endsWith("/ai/workflow-consents/business") &&
        (!options.method || options.method === "GET")
      ) {
        return apiResponse(200, {
          success: true,
          data: { consent: consent("business", consentActive) },
        });
      }
      if (url.endsWith("/ai/workflow-consents/business") && options.method === "PUT") {
        expect(JSON.parse(options.body)).toEqual({ noticeVersion: "groq-zdr-workflows-v1" });
        consentActive = true;
        return apiResponse(201, {
          success: true,
          data: { consent: consent("business", true) },
        });
      }
      if (url.endsWith("/ai/workflow-consents/business") && options.method === "DELETE") {
        consentActive = false;
        return apiResponse(200, {
          success: true,
          data: { consent: consent("business", false) },
        });
      }
      if (url.includes("/ai/workflow-runs?workflowCode=OWNER_BUSINESS_BRIEF_V1")) {
        return apiResponse(200, {
          success: true,
          data: { runs: [] },
          meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
        });
      }
      if (url.endsWith("/ai/workflows/owner-business-brief/runs") && options.method === "POST") {
        return apiResponse(202, {
          success: true,
          data: {
            run: {
              id: workflowRunId,
              workflowCode: "OWNER_BUSINESS_BRIEF_V1",
              graphVersion: "v1",
              status: "QUEUED",
              version: 0,
              canCancel: true,
              safeErrorCode: null,
              createdAt: "2026-09-06T01:00:00.000Z",
            },
          },
        });
      }
      if (
        url.endsWith(`/ai/workflow-runs/${workflowRunId}/cancellation`) &&
        options.method === "POST"
      ) {
        expect(JSON.parse(options.body)).toEqual({ version: 0 });
        cancelled = true;
        return apiResponse(200, {
          success: true,
          data: {
            run: {
              id: workflowRunId,
              workflowCode: "OWNER_BUSINESS_BRIEF_V1",
              graphVersion: "v1",
              status: "CANCELLED",
              version: 1,
              canCancel: false,
              safeErrorCode: null,
              createdAt: "2026-09-06T01:00:00.000Z",
            },
          },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    render(<App />);

    expect(await screen.findByText("CONSENT REQUIRED")).toBeInTheDocument();
    await browser.click(screen.getByLabelText(/I understand what is sent to Groq/));
    await browser.click(screen.getByRole("button", { name: "Accept and continue" }));
    fireEvent.change(await screen.findByLabelText("From (UTC)"), {
      target: { value: "2026-08-01T00:00" },
    });
    fireEvent.change(screen.getByLabelText("To (UTC)"), {
      target: { value: "2026-09-01T00:00" },
    });
    await browser.selectOptions(screen.getByLabelText("Focus"), "INVENTORY");
    await browser.click(screen.getByRole("button", { name: "Refresh runs" }));
    await browser.click(await screen.findByRole("button", { name: "Generate business brief" }));
    await browser.click(await screen.findByRole("button", { name: "Cancel run" }));
    expect(await screen.findByRole("heading", { name: "CANCELLED" })).toBeVisible();
    expect(cancelled).toBe(true);
    await browser.click(screen.getByRole("button", { name: "Revoke AI consent" }));
    expect(await screen.findByText("CONSENT REQUIRED")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Generate business brief" }),
    ).not.toBeInTheDocument();
  });

  it("polls a support draft, requires exact-text review, and publishes an edited reply", async () => {
    window.history.replaceState({}, "", "/admin/support");
    const workflowRunId = "60000000-0000-4000-8000-000000000009";
    const baseRun = {
      id: workflowRunId,
      workflowCode: "SUPPORT_REPLY_DRAFT_V1",
      graphVersion: "v1",
      ticketId,
      focus: null,
      range: null,
      version: 1,
      approval: null,
      publishedMessageId: null,
      safeErrorCode: null,
      canCancel: true,
      createdAt: "2026-09-06T01:00:00.000Z",
    };
    const draftRun = {
      ...baseRun,
      status: "AWAITING_APPROVAL",
      version: 2,
      approval: {
        status: "PENDING",
        version: 0,
        draftDigest: "a".repeat(64),
        contextDigest: "b".repeat(64),
        expiresAt: "2026-09-06T01:30:00.000Z",
        decidedAt: null,
      },
      sourceFreshness: [
        {
          toolCode: "SUPPORT_TICKET_PUBLIC_CONTEXT_V1",
          asOf: "2026-09-06T01:00:00.000Z",
        },
        {
          toolCode: "DOCUMENTS_CUSTOMER_POLICY_CONTEXT_V1",
          asOf: "2026-09-06T01:00:01.000Z",
        },
      ],
      draft: {
        draft: "Draft <script>alert('plain text')</script> response.",
        reasons: ["Bounded policy context"],
        citations: ["S1"],
      },
    };
    let workflowState = "EMPTY";
    let detailReads = 0;
    let decisionCalls = 0;
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.endsWith("/auth/me")) {
        return apiResponse(200, { success: true, data: { user: admin } });
      }
      const notification = emptyNotifications(url);
      if (notification) return notification;
      if (url.includes("/support/tickets?view=management")) {
        return apiResponse(200, {
          success: true,
          data: { tickets: [ticket] },
          meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
        });
      }
      if (url.includes(`/support/tickets/${ticketId}?view=management`)) {
        return apiResponse(200, { success: true, data: { ticket } });
      }
      if (url.endsWith("/ai/workflow-consents/support")) {
        return apiResponse(200, { success: true, data: { consent: consent("support") } });
      }
      if (url.includes("/ai/workflow-runs?workflowCode=SUPPORT_REPLY_DRAFT_V1")) {
        return apiResponse(200, {
          success: true,
          data: { runs: workflowState === "EMPTY" ? [] : [baseRun] },
          meta: { nextCursor: null, hasMore: false, limit: 100 },
        });
      }
      if (url.endsWith("/ai/workflows/support-reply/runs") && options.method === "POST") {
        expect(JSON.parse(options.body)).toEqual({ ticketId });
        expect(options.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/i);
        workflowState = "QUEUED";
        return apiResponse(202, {
          success: true,
          data: { run: { ...baseRun, status: "QUEUED", version: 0 } },
        });
      }
      if (url.endsWith(`/ai/workflow-runs/${workflowRunId}`)) {
        detailReads += 1;
        if (workflowState === "APPROVED") {
          workflowState = "SUCCEEDED";
          return apiResponse(200, {
            success: true,
            data: {
              run: {
                ...baseRun,
                status: "SUCCEEDED",
                version: 4,
                publishedMessageId: "70000000-0000-4000-8000-000000000009",
                canCancel: false,
              },
            },
          });
        }
        workflowState = "AWAITING_APPROVAL";
        return apiResponse(200, { success: true, data: { run: draftRun } });
      }
      if (
        url.endsWith(`/ai/workflow-runs/${workflowRunId}/decisions`) &&
        options.method === "POST"
      ) {
        decisionCalls += 1;
        expect(options.headers["X-CSRF-Token"]).toBe("phase9-ui-csrf");
        expect(JSON.parse(options.body)).toEqual({
          decision: "EDIT_AND_APPROVE",
          version: 2,
          body: "Reviewed exact customer reply.",
        });
        workflowState = "APPROVED";
        return apiResponse(202, {
          success: true,
          data: { run: { ...draftRun, status: "APPROVED", version: 3, draft: null } },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    const rendered = render(<App />);

    expect(await screen.findByText(ticket.ticketNumber)).toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: /Delivery policy question/ }));
    expect(await screen.findByRole("heading", { name: "Reply draft workflow" })).toBeVisible();
    await browser.click(screen.getByRole("button", { name: "Generate AI reply draft" }));
    const editor = await screen.findByRole(
      "textbox",
      { name: "Customer-visible reply" },
      { timeout: 2500 },
    );
    expect(editor).toHaveValue("Draft <script>alert('plain text')</script> response.");
    expect(rendered.container.querySelector("script")).toBeNull();
    expect(screen.getByRole("button", { name: "Approve and publish" })).toBeDisabled();
    await browser.clear(editor);
    await browser.type(editor, "Reviewed exact customer reply.");
    await browser.click(
      screen.getByLabelText(/I reviewed the exact reply and authorize publishing it/),
    );
    await browser.click(screen.getByRole("button", { name: "Approve and publish" }));
    expect(
      await screen.findByText(
        "The approved reply was published exactly once.",
        {},
        { timeout: 2500 },
      ),
    ).toBeVisible();
    expect(decisionCalls).toBe(1);
    expect(detailReads).toBeGreaterThanOrEqual(2);
  }, 10_000);

  it("rejects a support draft without publishing and allows a clean restart", async () => {
    window.history.replaceState({}, "", "/admin/support");
    const workflowRunId = "61000000-0000-4000-8000-000000000009";
    const draftRun = {
      id: workflowRunId,
      workflowCode: "SUPPORT_REPLY_DRAFT_V1",
      graphVersion: "v1",
      status: "AWAITING_APPROVAL",
      ticketId,
      version: 2,
      canCancel: false,
      publishedMessageId: null,
      safeErrorCode: null,
      approval: {
        status: "PENDING",
        version: 0,
        draftDigest: "c".repeat(64),
        contextDigest: "d".repeat(64),
        expiresAt: "2026-09-06T01:30:00.000Z",
        decidedAt: null,
      },
      sourceFreshness: [],
      draft: {
        draft: "Synthetic draft for rejection.",
        reasons: [],
        citations: [],
      },
      createdAt: "2026-09-06T01:00:00.000Z",
    };
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.endsWith("/auth/me")) {
        return apiResponse(200, { success: true, data: { user: admin } });
      }
      const notification = emptyNotifications(url);
      if (notification) return notification;
      if (url.includes("/support/tickets?view=management")) {
        return apiResponse(200, {
          success: true,
          data: { tickets: [ticket] },
          meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
        });
      }
      if (url.includes(`/support/tickets/${ticketId}?view=management`)) {
        return apiResponse(200, { success: true, data: { ticket } });
      }
      if (url.endsWith("/ai/workflow-consents/support")) {
        return apiResponse(200, { success: true, data: { consent: consent("support") } });
      }
      if (url.includes("/ai/workflow-runs?workflowCode=SUPPORT_REPLY_DRAFT_V1")) {
        return apiResponse(200, {
          success: true,
          data: { runs: [draftRun] },
          meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
        });
      }
      if (url.endsWith(`/ai/workflow-runs/${workflowRunId}`)) {
        return apiResponse(200, { success: true, data: { run: draftRun } });
      }
      if (
        url.endsWith(`/ai/workflow-runs/${workflowRunId}/decisions`) &&
        options.method === "POST"
      ) {
        expect(JSON.parse(options.body)).toEqual({ decision: "REJECT", version: 2 });
        return apiResponse(200, {
          success: true,
          data: { run: { ...draftRun, status: "CANCELLED", version: 3, draft: null } },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    render(<App />);

    expect(await screen.findByText(ticket.ticketNumber)).toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: /Delivery policy question/ }));
    await browser.click(await screen.findByRole("button", { name: "Reject draft" }));
    expect(await screen.findByRole("button", { name: "Start a new draft" })).toBeVisible();
    expect(screen.queryByText("published exactly once")).not.toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Start a new draft" }));
    expect(await screen.findByRole("button", { name: "Generate AI reply draft" })).toBeVisible();
  });

  it("hides workflow entry points from users without workflow permissions", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.endsWith("/auth/me")) {
        return apiResponse(200, { success: true, data: { user: customer } });
      }
      const notification = emptyNotifications(url);
      if (notification) return notification;
      if (url.includes("/products?")) {
        return apiResponse(200, {
          success: true,
          data: { products: [] },
          meta: { page: 1, limit: 12, total: 0, totalPages: 0 },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    expect(await screen.findByText("Workflow Customer")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "AI workflows" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.includes("workflow-consents"))).toBe(false);
  });
});
