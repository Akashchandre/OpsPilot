import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const admin = {
  id: "10d4fe71-cecc-4dc6-92c9-410b5301d7bf",
  email: "admin@example.com",
  displayName: "Administrator",
  status: "ACTIVE",
  roles: ["ADMIN"],
  permissions: ["reports:read"],
};

const customer = {
  ...admin,
  id: "1d7408ed-b33a-4cc2-bf87-8c7f2cf91af4",
  email: "customer@example.com",
  displayName: "Customer",
  roles: ["CUSTOMER"],
  permissions: [],
};

function overview(overrides = {}) {
  return {
    asOf: "2026-08-28T12:30:00.000Z",
    from: "2026-07-29T12:30:00.000Z",
    to: "2026-08-28T12:30:00.000Z",
    timeZone: "UTC",
    currency: "INR",
    orders: {
      createdCount: 2,
      currentStatusBreakdown: {
        PENDING_PAYMENT: 0,
        CONFIRMED: 1,
        PROCESSING: 0,
        SHIPPED: 0,
        DELIVERED: 0,
        CANCELLED: 1,
        EXPIRED: 0,
        PAYMENT_REVIEW: 0,
      },
    },
    paymentFlow: {
      capturedAmount: "30.30",
      processedRefundAmount: "5.05",
      netAmount: "25.25",
    },
    customers: { newAccountCount: 2 },
    inventory: { lowStockProductCount: 1, outOfStockProductCount: 1 },
    tickets: {
      createdCount: 3,
      currentOpenCount: 2,
      currentOpenStateBreakdown: {
        OPEN: 1,
        IN_PROGRESS: 0,
        WAITING_CUSTOMER: 0,
        RESOLVED: 1,
      },
      currentStatusBreakdown: {
        OPEN: 1,
        IN_PROGRESS: 0,
        WAITING_CUSTOMER: 0,
        RESOLVED: 1,
        CLOSED: 1,
      },
      currentPriorityBreakdown: { LOW: 1, NORMAL: 0, HIGH: 1, URGENT: 1 },
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("Phase 5 reports UI", () => {
  it("shows loading and then renders the exact operational overview", async () => {
    window.history.replaceState({}, "", "/admin/reports");
    let resolveReport;
    const reportResponse = new Promise((resolve) => {
      resolveReport = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url.endsWith("/auth/me")) {
          return apiResponse(200, { success: true, data: { user: admin } });
        }
        if (url.endsWith("/reports/overview")) return reportResponse;
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(<App />);
    expect(await screen.findByText("Loading operations report...")).toBeInTheDocument();
    await act(async () => {
      resolveReport(apiResponse(200, { success: true, data: { overview: overview() } }));
    });

    expect(await screen.findByRole("heading", { name: "Operations report" })).toBeInTheDocument();
    expect(screen.getByText("Orders created").nextElementSibling).toHaveTextContent("2");
    expect(screen.getByText("Captured payment flow").nextElementSibling).toHaveTextContent("30.30");
    expect(screen.getByText("Processed refunds").nextElementSibling).toHaveTextContent("5.05");
    expect(screen.getByText("Net payment flow").nextElementSibling).toHaveTextContent("25.25");
    expect(screen.getByText(/not recognized revenue/i)).toBeInTheDocument();
  });

  it("applies an explicit UTC range and renders a defined empty state", async () => {
    window.history.replaceState({}, "", "/admin/reports");
    const empty = overview({
      orders: {
        createdCount: 0,
        currentStatusBreakdown: Object.fromEntries(
          Object.keys(overview().orders.currentStatusBreakdown).map((key) => [key, 0]),
        ),
      },
      paymentFlow: {
        capturedAmount: "0.00",
        processedRefundAmount: "0.00",
        netAmount: "0.00",
      },
      customers: { newAccountCount: 0 },
      inventory: { lowStockProductCount: 0, outOfStockProductCount: 0 },
      tickets: {
        ...overview().tickets,
        createdCount: 0,
        currentOpenCount: 0,
        currentOpenStateBreakdown: Object.fromEntries(
          Object.keys(overview().tickets.currentOpenStateBreakdown).map((key) => [key, 0]),
        ),
        currentStatusBreakdown: Object.fromEntries(
          Object.keys(overview().tickets.currentStatusBreakdown).map((key) => [key, 0]),
        ),
        currentPriorityBreakdown: Object.fromEntries(
          Object.keys(overview().tickets.currentPriorityBreakdown).map((key) => [key, 0]),
        ),
      },
    });
    const fetchMock = vi.fn(async (url) => {
      if (url.endsWith("/auth/me")) {
        return apiResponse(200, { success: true, data: { user: admin } });
      }
      if (url.includes("/reports/overview")) {
        return apiResponse(200, { success: true, data: { overview: empty } });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "No activity in this range" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("From (UTC)"), {
      target: { value: "2026-08-01T00:00" },
    });
    fireEvent.change(screen.getByLabelText("To (UTC)"), {
      target: { value: "2026-08-02T00:00" },
    });
    await user.click(screen.getByRole("button", { name: "Apply range" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          url.includes("from=2026-08-01T00%3A00%3A00.000Z&to=2026-08-02T00%3A00%3A00.000Z"),
        ),
      ).toBe(true),
    );
  });

  it("shows validation and API failure states without discarding a loaded report", async () => {
    window.history.replaceState({}, "", "/admin/reports");
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url.endsWith("/auth/me")) {
          return apiResponse(200, { success: true, data: { user: admin } });
        }
        if (url.includes("/reports/overview")) {
          calls += 1;
          if (calls === 1) {
            return apiResponse(200, { success: true, data: { overview: overview() } });
          }
          return apiResponse(503, {
            success: false,
            error: { code: "REPORT_UNAVAILABLE", message: "Report is temporarily unavailable" },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Orders created");
    fireEvent.change(screen.getByLabelText("From (UTC)"), {
      target: { value: "2026-08-03T00:00" },
    });
    fireEvent.change(screen.getByLabelText("To (UTC)"), {
      target: { value: "2026-08-02T00:00" },
    });
    await user.click(screen.getByRole("button", { name: "Apply range" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("end time must be later");
    expect(screen.getByText("Orders created")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Report is temporarily unavailable");
  });

  it("shows an authorization state for users without reports permission", async () => {
    window.history.replaceState({}, "", "/admin/reports");
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
