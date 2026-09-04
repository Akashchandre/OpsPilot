import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
import { presentAiError } from "./pages/aiPresentation.js";

function apiResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

const customer = {
  id: "10000000-0000-4000-8000-000000000001",
  email: "customer@example.com",
  displayName: "AI Customer",
  status: "ACTIVE",
  roles: ["CUSTOMER"],
  permissions: ["ai:customer:use"],
};

const owner = {
  ...customer,
  id: "10000000-0000-4000-8000-000000000002",
  email: "owner@example.com",
  displayName: "AI Owner",
  roles: ["OWNER"],
  permissions: ["ai:owner:use", "ai:usage:read", "reports:read"],
};

const notice = {
  version: "groq-zdr-v1",
  provider: "GROQ",
  providerName: "Groq",
  title: "AI processing notice",
  generatedOutput: "The response is AI-generated and may be incorrect.",
  retention:
    "OpsPilot requires Groq Zero Data Retention in Data Controls. Requests are blocked unless an operator confirms that setting.",
  warning: "Do not enter passwords, payment details, personal data, or other secrets.",
  dataSent:
    "Your question and a reviewed list of public OpsPilot customer features and navigation facts are sent to Groq.",
};

function consent(assistant, active) {
  return {
    provider: "GROQ",
    assistant: assistant.toUpperCase(),
    notice: {
      ...notice,
      assistant: assistant.toUpperCase(),
      ...(assistant === "owner"
        ? {
            dataSent:
              "Your question and the selected authoritative aggregate OpsPilot overview are sent to Groq. No row-level records are included.",
          }
        : {}),
    },
    active,
    consentedAt: active ? "2026-09-03T01:00:00.000Z" : null,
    revokedAt: null,
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

function overview() {
  return {
    asOf: "2026-09-03T05:00:00.000Z",
    from: "2026-08-01T00:00:00.000Z",
    to: "2026-08-02T00:00:00.000Z",
    timeZone: "UTC",
    currency: "INR",
    orders: { createdCount: 7 },
    paymentFlow: { capturedAmount: "150.00", processedRefundAmount: "20.00", netAmount: "130.00" },
    customers: { newAccountCount: 3 },
    inventory: { lowStockProductCount: 2, outOfStockProductCount: 1 },
    tickets: { currentOpenCount: 4 },
  };
}

function usage() {
  return {
    asOf: "2026-09-03T05:00:00.000Z",
    from: "2026-08-01T00:00:00.000Z",
    to: "2026-09-03T05:00:00.000Z",
    timeZone: "UTC",
    requests: {
      total: 4,
      statusBreakdown: { PENDING: 0, SUCCEEDED: 2, FAILED: 1, UNKNOWN: 1 },
      assistantBreakdown: { CUSTOMER: 2, OWNER: 2 },
    },
    tokens: { input: 100, output: 20, total: 120 },
    latency: { completedCount: 4, averageMs: 420.5, maximumMs: 900 },
    failures: { total: 2, safeErrorBreakdown: { PROVIDER_TIMEOUT: 1, PROVIDER_RATE_LIMITED: 1 } },
    cost: {
      currency: "USD",
      ticksPerUsd: "10000000000",
      confirmedInUsdTicks: "150000",
      confirmedUsd: "0.0000150000",
      reservedExposureInUsdTicks: "200000000",
      reservedExposureUsd: "0.0200000000",
    },
  };
}

beforeEach(() => {
  document.cookie = "opspilot_csrf=phase7-ui-csrf; path=/";
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

describe("Phase 7 AI UI", () => {
  it("requires explicit customer consent and renders even hostile answer text without markup", async () => {
    window.history.replaceState({}, "", "/assistant");
    let consentActive = false;
    let resolveProvider;
    const providerResponse = new Promise((resolve) => {
      resolveProvider = resolve;
    });
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.endsWith("/auth/me")) {
        return apiResponse(200, { success: true, data: { user: customer } });
      }
      const notification = emptyNotifications(url);
      if (notification) return notification;
      if (url.endsWith("/ai/consents/customer") && (!options.method || options.method === "GET")) {
        return apiResponse(200, {
          success: true,
          data: { consent: consent("customer", consentActive) },
        });
      }
      if (url.endsWith("/ai/consents/customer") && options.method === "PUT") {
        expect(options.headers["X-CSRF-Token"]).toBe("phase7-ui-csrf");
        expect(JSON.parse(options.body)).toEqual({ noticeVersion: "groq-zdr-v1" });
        consentActive = true;
        return apiResponse(201, {
          success: true,
          data: { consent: consent("customer", true) },
        });
      }
      if (url.endsWith("/ai/consents/customer") && options.method === "DELETE") {
        consentActive = false;
        return apiResponse(200, {
          success: true,
          data: { consent: { ...consent("customer", false), revokedAt: new Date().toISOString() } },
        });
      }
      if (url.endsWith("/ai/customer/responses") && options.method === "POST") {
        expect(options.headers["X-CSRF-Token"]).toBe("phase7-ui-csrf");
        expect(options.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/i);
        expect(JSON.parse(options.body)).toEqual({ question: "Where are my orders?" });
        return providerResponse;
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    const rendered = render(<App />);

    expect(await screen.findByRole("heading", { name: "OpsPilot assistant" })).toBeInTheDocument();
    expect(await screen.findByText("CONSENT REQUIRED")).toBeInTheDocument();
    expect(screen.queryByLabelText("Question")).not.toBeInTheDocument();
    const accept = screen.getByRole("button", { name: "Accept and continue" });
    expect(accept).toBeDisabled();
    await browser.click(
      screen.getByLabelText(
        /I understand what is sent to Groq and that its response may be incorrect/,
      ),
    );
    await browser.click(accept);

    const question = await screen.findByRole("textbox", { name: /Question/ });
    await browser.type(question, "Where are my orders?");
    await browser.click(screen.getByRole("button", { name: "Ask AI" }));
    expect(await screen.findByText("Generating one non-streaming response...")).toBeInTheDocument();
    await act(async () => {
      resolveProvider(
        apiResponse(200, {
          success: true,
          data: {
            response: {
              answer: "<img src=x onerror=alert(1)> is plain text",
              outcome: "ANSWER",
              notices: ["VERIFY_AUTHORITATIVE_DATA"],
            },
          },
        }),
      );
    });

    expect(
      await screen.findByText("<img src=x onerror=alert(1)> is plain text"),
    ).toBeInTheDocument();
    expect(rendered.container.querySelector("img")).toBeNull();
    expect(screen.getByText(/not stored as chat history/)).toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "Revoke AI consent" }));
    expect(await screen.findByText("CONSENT REQUIRED")).toBeInTheDocument();
    expect(
      screen.queryByText("<img src=x onerror=alert(1)> is plain text"),
    ).not.toBeInTheDocument();
  });

  it("shows timeout guidance and retries only with a fresh submission key", async () => {
    window.history.replaceState({}, "", "/assistant");
    const submissionKeys = [];
    let providerCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options = {}) => {
        if (url.endsWith("/auth/me")) {
          return apiResponse(200, { success: true, data: { user: customer } });
        }
        const notification = emptyNotifications(url);
        if (notification) return notification;
        if (url.endsWith("/ai/consents/customer")) {
          return apiResponse(200, {
            success: true,
            data: { consent: consent("customer", true) },
          });
        }
        if (url.endsWith("/ai/customer/responses")) {
          submissionKeys.push(options.headers["Idempotency-Key"]);
          providerCalls += 1;
          if (providerCalls === 1) {
            return apiResponse(503, {
              success: false,
              error: { code: "AI_PROVIDER_TIMEOUT", message: "Provider timed out" },
            });
          }
          return apiResponse(200, {
            success: true,
            data: {
              response: {
                answer: "I cannot answer account-specific questions.",
                outcome: "REFUSAL",
                notices: ["USE_STANDARD_SUPPORT"],
              },
            },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    const browser = userEvent.setup();
    render(<App />);

    const question = await screen.findByRole("textbox", { name: /Question/ });
    await browser.type(question, "Tell me private account details");
    await browser.click(screen.getByRole("button", { name: "Ask AI" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That submission was consumed; try again only as a new request",
    );
    await browser.click(screen.getByRole("button", { name: "Ask AI" }));
    expect(
      await screen.findByRole("heading", { name: "Request not answered" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/standard OpsPilot support/)).toBeInTheDocument();
    expect(submissionKeys).toHaveLength(2);
    expect(submissionKeys[0]).not.toBe(submissionKeys[1]);
  });

  it("keeps owner metrics separate, validates UTC range, shows escalation, and loads safe usage", async () => {
    window.history.replaceState({}, "", "/admin/assistant");
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.endsWith("/auth/me")) {
        return apiResponse(200, { success: true, data: { user: owner } });
      }
      const notification = emptyNotifications(url);
      if (notification) return notification;
      if (url.endsWith("/ai/consents/owner")) {
        return apiResponse(200, {
          success: true,
          data: { consent: consent("owner", true) },
        });
      }
      if (url.includes("/ai/usage")) {
        return apiResponse(200, { success: true, data: { usage: usage() } });
      }
      if (url.endsWith("/ai/owner/overview-responses") && options.method === "POST") {
        expect(options.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/i);
        expect(JSON.parse(options.body)).toMatchObject({
          question: "What changed?",
          range: {
            from: "2026-08-01T00:00:00.000Z",
            to: "2026-08-02T00:00:00.000Z",
          },
        });
        return apiResponse(200, {
          success: true,
          data: {
            overview: overview(),
            response: {
              answer: "Ask an operator to investigate the change.",
              outcome: "ESCALATE",
              notices: ["SNAPSHOT_MAY_BE_STALE"],
            },
          },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Operations assistant" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "AI usage" })).toBeInTheDocument();
    expect(screen.getByText("420.5 ms")).toBeInTheDocument();
    expect(screen.getByText("$0.0200000000")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("From (UTC)"), {
      target: { value: "2026-08-03T00:00" },
    });
    fireEvent.change(screen.getByLabelText("To (UTC)"), {
      target: { value: "2026-08-02T00:00" },
    });
    await browser.type(screen.getByRole("textbox", { name: /Question/ }), "What changed?");
    await browser.click(screen.getByRole("button", { name: "Explain overview with AI" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("end time must be later");
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/ai/owner/overview-responses"))).toBe(
      false,
    );

    fireEvent.change(screen.getByLabelText("From (UTC)"), {
      target: { value: "2026-08-01T00:00" },
    });
    await browser.click(screen.getByRole("button", { name: "Explain overview with AI" }));
    expect(
      await screen.findByRole("heading", { name: "Overview sent for explanation" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Orders created").nextElementSibling).toHaveTextContent("7");
    expect(
      await screen.findByRole("heading", { name: "Standard support recommended" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ask an operator to investigate the change.")).toBeInTheDocument();
  });

  it("keeps assistant routes hidden and denied without the exact permission combination", async () => {
    window.history.replaceState({}, "", "/admin/assistant");
    const limitedOwner = { ...owner, permissions: ["ai:owner:use", "ai:usage:read"] };
    const fetchMock = vi.fn(async (url) => {
      if (url.endsWith("/auth/me")) {
        return apiResponse(200, { success: true, data: { user: limitedOwner } });
      }
      const notification = emptyNotifications(url);
      if (notification) return notification;
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Access denied" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "AI overview" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/ai/consents"))).toBe(false);
  });

  it("defines distinct quota, provider, in-flight, and recording failure guidance", () => {
    expect(presentAiError({ code: "AI_DAILY_QUOTA_REACHED" })).toContain("daily");
    expect(presentAiError({ code: "AI_PROVIDER_UNAVAILABLE" })).toContain("unavailable");
    expect(presentAiError({ code: "AI_REQUEST_IN_FLIGHT" })).toContain("already in progress");
    expect(presentAiError({ code: "AI_RESULT_RECORDING_FAILED" })).toContain("not shown");
  });
});
