import { randomUUID } from "node:crypto";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const socketMock = vi.hoisted(() => ({ handlers: new Map(), managerHandlers: new Map() }));

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    active: true,
    on(event, handler) {
      socketMock.handlers.set(event, handler);
      return this;
    },
    close: vi.fn(),
    io: {
      on(event, handler) {
        socketMock.managerHandlers.set(event, handler);
      },
    },
  })),
}));

import App from "./App.jsx";

const user = {
  id: "10000000-0000-4000-8000-000000000001",
  displayName: "Phase 6 Owner",
  email: "phase6-ui@example.com",
  status: "ACTIVE",
  roles: ["OWNER"],
  permissions: ["jobs:read", "jobs:replay"],
};
const notificationOne = {
  id: "20000000-0000-4000-8000-000000000001",
  cursor: "5",
  type: "SUPPORT_STATUS_CHANGED",
  title: "Support status updated",
  message: "SP-100 is now OPEN.",
  actionPath: "/",
  metadata: { reference: "SP-100", status: "OPEN", view: "SELF" },
  resources: { supportTicketId: "30000000-0000-4000-8000-000000000001" },
  readAt: null,
  createdAt: "2026-08-29T01:00:00.000Z",
};
const notificationTwo = {
  ...notificationOne,
  id: "20000000-0000-4000-8000-000000000002",
  cursor: "6",
  type: "ORDER_STATUS_CHANGED",
  title: "Order updated",
  message: "OP-100 is now SHIPPED.",
  actionPath: "/orders/40000000-0000-4000-8000-000000000001",
  createdAt: "2026-08-29T01:01:00.000Z",
};
const deadJob = {
  id: "50000000-0000-4000-8000-000000000001",
  type: "AUDIT_CHAIN_VERIFY",
  schemaVersion: 1,
  status: "DEAD_LETTER",
  dedupeKey: "schedule:audit-chain:2026-08-29",
  availableAt: "2026-08-29T00:00:00.000Z",
  attemptCount: 2,
  maxAttempts: 2,
  leaseOwnerId: null,
  leaseExpiresAt: null,
  lastErrorCode: "AUDIT_INTEGRITY_INVALID",
  sourceRequestId: null,
  replayedFromJobId: null,
  completedAt: null,
  deadLetteredAt: "2026-08-29T00:01:00.000Z",
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:01:00.000Z",
};
const replayedJob = {
  ...deadJob,
  id: "50000000-0000-4000-8000-000000000002",
  status: "PENDING",
  attemptCount: 0,
  lastErrorCode: null,
  replayedFromJobId: deadJob.id,
  deadLetteredAt: null,
};

function response(payload, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => payload });
}

function notificationRoutes(url, options = {}) {
  if (url.endsWith("/auth/me")) return response({ success: true, data: { user } });
  if (url.includes("/notifications/unread-count")) {
    return response({ success: true, data: { unreadCount: 2 } });
  }
  if (url.includes("/notifications?") && url.includes("after=5")) {
    return response({
      success: true,
      data: { notifications: [notificationTwo] },
      meta: { nextCursor: "6", hasMore: false, truncatedBefore: false, limit: 100 },
    });
  }
  if (url.includes("/notifications?")) {
    return response({
      success: true,
      data: { notifications: [notificationOne] },
      meta: { nextCursor: "5", hasMore: false, truncatedBefore: false, limit: 100 },
    });
  }
  if (url.endsWith("/notifications/read-all") && options.method === "POST") {
    return response({
      success: true,
      data: { updatedCount: 2, highWaterCursor: "6" },
    });
  }
  if (url.endsWith(`/notifications/${notificationOne.id}/read`) && options.method === "PATCH") {
    return response({
      success: true,
      data: { notification: { ...notificationOne, readAt: "2026-08-29T01:02:00.000Z" } },
    });
  }
  return null;
}

beforeEach(() => {
  socketMock.handlers.clear();
  socketMock.managerHandlers.clear();
  document.cookie = "opspilot_csrf=phase6-ui-csrf; path=/";
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

describe("Phase 6 UI", () => {
  it("shows persistent notifications and catches up after a socket hint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((url, options) => {
      const matched = notificationRoutes(url, options);
      if (matched) return matched;
      throw new Error(`Unexpected request: ${url}`);
    });
    const browser = userEvent.setup();
    render(<App />);

    const trigger = await screen.findByRole("button", { name: /Notifications/ });
    await browser.click(trigger);
    expect(await screen.findByText("Support status updated")).toBeInTheDocument();

    await act(async () => socketMock.handlers.get("connect")?.());
    expect(screen.getByText("Live")).toBeInTheDocument();
    await act(async () => socketMock.handlers.get("connect_error")?.());
    expect(screen.getByText("Reconnecting")).toBeInTheDocument();
    await act(async () => socketMock.managerHandlers.get("reconnect_attempt")?.());
    await act(async () => socketMock.handlers.get("disconnect")?.());

    await act(async () => {
      socketMock.handlers.get("notification.changed")?.({ id: notificationTwo.id, cursor: "6" });
    });
    expect(await screen.findByText("Order updated")).toBeInTheDocument();

    await browser.click(screen.getByText("Support status updated"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`/notifications/${notificationOne.id}/read`),
        expect.objectContaining({
          method: "PATCH",
          headers: expect.objectContaining({ "X-CSRF-Token": "phase6-ui-csrf" }),
        }),
      ),
    );

    await browser.click(screen.getByRole("button", { name: /Notifications/ }));
    await browser.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/notifications/read-all"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "X-CSRF-Token": "phase6-ui-csrf" }),
        }),
      ),
    );
  });

  it("renders owner queue health, dead-letter evidence, and controlled replay", async () => {
    window.history.replaceState({}, "", "/admin/jobs");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((url, options = {}) => {
      const notification = notificationRoutes(url, options);
      if (notification) return notification;
      if (url.endsWith("/jobs/health")) {
        return response({
          success: true,
          data: {
            health: {
              checkedAt: "2026-08-29T01:00:00.000Z",
              counts: { PENDING: 0, PROCESSING: 0, SUCCEEDED: 2, DEAD_LETTER: 1 },
              staleProcessing: 0,
              oldestPendingAgeMs: null,
              workers: [],
            },
          },
        });
      }
      if (url.includes("/jobs?") && options.method !== "POST") {
        return response({ success: true, data: { jobs: [deadJob] }, meta: { total: 1 } });
      }
      if (url.endsWith(`/jobs/${deadJob.id}`)) {
        return response({
          success: true,
          data: {
            job: {
              ...deadJob,
              payload: { bucket: "2026-08-29" },
              attempts: [
                {
                  id: randomUUID(),
                  attemptNumber: 2,
                  outcome: "TERMINAL_FAILURE",
                  errorCode: "AUDIT_INTEGRITY_INVALID",
                  durationMs: 12,
                },
              ],
            },
          },
        });
      }
      if (url.endsWith(`/jobs/${deadJob.id}/replay`) && options.method === "POST") {
        expect(JSON.parse(options.body).idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
        return response(
          {
            success: true,
            data: { job: replayedJob, replayed: true },
          },
          201,
        );
      }
      if (url.endsWith(`/jobs/${replayedJob.id}`)) {
        return response({
          success: true,
          data: { job: { ...replayedJob, payload: { bucket: "2026-08-29" }, attempts: [] } },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const browser = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Background jobs" })).toBeInTheDocument();
    expect(await screen.findByText("AUDIT_CHAIN_VERIFY")).toBeInTheDocument();
    await browser.selectOptions(screen.getByLabelText("Status"), "DEAD_LETTER");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("status=DEAD_LETTER"),
        expect.anything(),
      ),
    );
    await browser.selectOptions(screen.getByLabelText("Type"), "AUDIT_CHAIN_VERIFY");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("type=AUDIT_CHAIN_VERIFY"),
        expect.anything(),
      ),
    );
    await browser.click(screen.getByRole("button", { name: "Refresh" }));
    await browser.click(screen.getByRole("button", { name: /AUDIT_CHAIN_VERIFY/ }));
    expect((await screen.findAllByText("AUDIT_INTEGRITY_INVALID")).length).toBeGreaterThan(0);
    await browser.click(screen.getByRole("button", { name: "Replay" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`/jobs/${deadJob.id}/replay`),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "X-CSRF-Token": "phase6-ui-csrf" }),
        }),
      ),
    );
    expect(await screen.findByText(/Replay job .* was queued/)).toBeInTheDocument();
  });
});
