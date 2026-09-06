import { cleanup, render, screen } from "@testing-library/react";
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
  displayName: "Document Customer",
  status: "ACTIVE",
  roles: ["CUSTOMER"],
  permissions: ["ai:customer:use"],
};

const owner = {
  ...customer,
  id: "10000000-0000-4000-8000-000000000002",
  email: "owner@example.com",
  displayName: "Document Owner",
  roles: ["OWNER"],
  permissions: ["ai:owner:use"],
};

const admin = {
  ...customer,
  id: "10000000-0000-4000-8000-000000000003",
  email: "admin@example.com",
  displayName: "Document Admin",
  roles: ["ADMIN"],
  permissions: ["documents:read", "documents:manage"],
};

const recoveryOwner = {
  ...owner,
  permissions: ["documents:read", "documents:manage", "documents:delete"],
};

function documentConsent(assistant, active) {
  return {
    provider: "GROQ",
    assistant: assistant.toUpperCase(),
    notice: {
      version: "groq-zdr-documents-v1",
      provider: "GROQ",
      providerName: "Groq",
      assistant: assistant.toUpperCase(),
      title: "AI document processing notice",
      generatedOutput: "The response is AI-generated and may be incorrect.",
      retention: "Zero Data Retention must be confirmed.",
      warning: "Do not include secrets.",
      dataSent: "Your question and bounded authorized document passages are sent to Groq.",
    },
    active,
    consentedAt: active ? "2026-09-05T01:00:00.000Z" : null,
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

beforeEach(() => {
  document.cookie = "opspilot_csrf=phase8-ui-csrf; path=/";
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

describe("Phase 8 RAG UI", () => {
  it("presents document failures without leaking internal retrieval details", () => {
    expect(presentAiError({ code: "AI_DOCUMENTS_DISABLED" })).toContain("disabled");
    expect(presentAiError({ code: "AI_CONTEXT_UNAVAILABLE" })).toContain("No answer was generated");
    expect(presentAiError({ code: "AI_DOCUMENT_CITATION_NOT_FOUND" })).toContain(
      "no longer available",
    );
  });

  it("uses separate customer document consent and renders verified citations as plain text", async () => {
    window.history.replaceState({}, "", "/assistant/documents");
    let consentActive = false;
    const citation = {
      id: "20000000-0000-4000-8000-000000000001",
      label: "S1",
      documentId: "30000000-0000-4000-8000-000000000001",
      title: "Returns <b>policy</b>",
      versionNumber: 3,
      excerpt: "Return within 30 days. <script>alert(1)</script>",
    };
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.endsWith("/auth/me")) {
        return apiResponse(200, { success: true, data: { user: customer } });
      }
      const notification = emptyNotifications(url);
      if (notification) return notification;
      if (
        url.endsWith("/ai/document-consents/customer") &&
        (!options.method || options.method === "GET")
      ) {
        return apiResponse(200, {
          success: true,
          data: { consent: documentConsent("customer", consentActive) },
        });
      }
      if (url.endsWith("/ai/document-consents/customer") && options.method === "PUT") {
        expect(options.headers["X-CSRF-Token"]).toBe("phase8-ui-csrf");
        expect(JSON.parse(options.body)).toEqual({
          noticeVersion: "groq-zdr-documents-v1",
        });
        consentActive = true;
        return apiResponse(201, {
          success: true,
          data: { consent: documentConsent("customer", true) },
        });
      }
      if (url.endsWith("/ai/customer/document-responses") && options.method === "POST") {
        expect(options.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/i);
        expect(JSON.parse(options.body)).toEqual({ question: "What is the return period?" });
        return apiResponse(200, {
          success: true,
          data: {
            response: {
              answer: "The current return period is 30 days.",
              outcome: "ANSWER",
              notices: [],
              citations: [citation],
            },
          },
        });
      }
      if (url.endsWith(`/ai/document-citations/${citation.id}`)) {
        return apiResponse(200, {
          success: true,
          data: { citation: { ...citation, excerpt: "Verified current passage." } },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    const rendered = render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Company document assistant" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("CONSENT REQUIRED")).toBeInTheDocument();
    await browser.click(
      screen.getByLabelText(
        /I understand what is sent to Groq and that its response may be incorrect/,
      ),
    );
    await browser.click(screen.getByRole("button", { name: "Accept and continue" }));
    await browser.type(
      screen.getByRole("textbox", { name: /Question/ }),
      "What is the return period?",
    );
    await browser.click(screen.getByRole("button", { name: "Ask company documents" }));

    expect(await screen.findByText(/Returns <b>policy<\/b>/)).toBeInTheDocument();
    expect(
      screen.getByText("Return within 30 days. <script>alert(1)</script>"),
    ).toBeInTheDocument();
    expect(rendered.container.querySelector("script")).toBeNull();
    expect(rendered.container.querySelector("b")).toBeNull();
    await browser.click(screen.getByRole("button", { name: "Verify S1 source" }));
    expect(await screen.findByText("Verified current passage.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/ai/consents/customer"))).toBe(false);
  });

  it("allows the owner document assistant without report access", async () => {
    window.history.replaceState({}, "", "/admin/document-assistant");
    const fetchMock = vi.fn(async (url) => {
      if (url.endsWith("/auth/me")) {
        return apiResponse(200, { success: true, data: { user: owner } });
      }
      const notification = emptyNotifications(url);
      if (notification) return notification;
      if (url.endsWith("/ai/document-consents/owner")) {
        return apiResponse(200, {
          success: true,
          data: { consent: documentConsent("owner", true) },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Operations document assistant" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("textbox", { name: /Question/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Document AI" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/ai/usage"))).toBe(false);
  });

  it("creates, uploads, and archives a document while keeping delete owner-only", async () => {
    window.history.replaceState({}, "", "/admin/documents");
    const documentId = "40000000-0000-4000-8000-000000000001";
    const versionId = "50000000-0000-4000-8000-000000000001";
    let managedDocument = null;
    const summary = () => {
      const value = { ...managedDocument };
      delete value.versions;
      return { ...value, activeVersion: null };
    };
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.endsWith("/auth/me")) {
        return apiResponse(200, { success: true, data: { user: admin } });
      }
      const notification = emptyNotifications(url);
      if (notification) return notification;
      if (url.includes("/documents?") && (!options.method || options.method === "GET")) {
        return apiResponse(200, {
          success: true,
          data: { documents: managedDocument ? [summary()] : [] },
          meta: {
            page: 1,
            limit: 100,
            total: managedDocument ? 1 : 0,
            totalPages: managedDocument ? 1 : 0,
          },
        });
      }
      if (url.endsWith("/documents") && options.method === "POST") {
        expect(options.headers["X-CSRF-Token"]).toBe("phase8-ui-csrf");
        expect(options.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/i);
        expect(JSON.parse(options.body)).toEqual({
          title: "Returns policy",
          filename: "returns.txt",
          mediaType: "text/plain",
          language: "en",
          audiences: ["CUSTOMER"],
        });
        managedDocument = {
          id: documentId,
          title: "Returns policy",
          status: "ACTIVE",
          activeVersionId: null,
          version: 0,
          deletedAt: null,
          createdAt: "2026-09-05T01:00:00.000Z",
          updatedAt: "2026-09-05T01:00:00.000Z",
          versions: [
            {
              id: versionId,
              versionNumber: 1,
              status: "AWAITING_UPLOAD",
              filename: "returns.txt",
              mediaType: "text/plain",
              language: "en",
              byteLength: null,
              indexVersion: 1,
              chunkCount: null,
              failureCode: null,
              audiences: ["CUSTOMER"],
              uploadedAt: null,
              processingStartedAt: null,
              readyAt: null,
              supersededAt: null,
              deletedAt: null,
              version: 0,
              createdAt: "2026-09-05T01:00:00.000Z",
              updatedAt: "2026-09-05T01:00:00.000Z",
            },
          ],
        };
        return apiResponse(201, { success: true, data: { document: managedDocument } });
      }
      if (
        url.endsWith(`/documents/${documentId}/versions/${versionId}/content`) &&
        options.method === "PUT"
      ) {
        expect(options.headers["Content-Type"]).toBe("text/plain");
        expect(new TextDecoder().decode(options.body)).toBe("Return within 30 days.");
        managedDocument.version = 1;
        managedDocument.versions[0] = {
          ...managedDocument.versions[0],
          status: "QUEUED",
          byteLength: 22,
          uploadedAt: "2026-09-05T01:01:00.000Z",
          version: 1,
        };
        return apiResponse(202, {
          success: true,
          data: {
            version: managedDocument.versions[0],
            job: { id: "60000000-0000-4000-8000-000000000001", status: "PENDING", created: true },
          },
        });
      }
      if (
        url.endsWith(`/documents/${documentId}`) &&
        (!options.method || options.method === "GET")
      ) {
        return apiResponse(200, { success: true, data: { document: managedDocument } });
      }
      if (url.endsWith(`/documents/${documentId}/status`) && options.method === "PATCH") {
        expect(JSON.parse(options.body)).toEqual({ status: "ARCHIVED", version: 1 });
        managedDocument = { ...managedDocument, status: "ARCHIVED", version: 2 };
        return apiResponse(200, { success: true, data: { document: managedDocument } });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Company documents" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Documents" })).toBeInTheDocument();
    await browser.type(screen.getByLabelText("Title"), "Returns policy");
    const file = new window.File(["Return within 30 days."], "returns.txt", {
      type: "text/plain",
    });
    if (!file.arrayBuffer) {
      Object.defineProperty(file, "arrayBuffer", {
        value: async () => new TextEncoder().encode("Return within 30 days.").buffer,
      });
    }
    const fileInput = screen.getByLabelText(/UTF-8 document/);
    await browser.upload(fileInput, file);
    expect(fileInput.files).toHaveLength(1);
    await browser.click(screen.getByRole("button", { name: "Create and upload" }));

    expect(await screen.findByText("Document queued for secure ingestion.")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Returns policy" })).toBeInTheDocument();
    expect(screen.getByText("QUEUED")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete document" })).not.toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Archive" }));
    expect(await screen.findByText("Document archived.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  it("shows aggregate advisory recovery inventory only to the owner", async () => {
    window.history.replaceState({}, "", "/admin/documents");
    const fetchMock = vi.fn(async (url) => {
      if (url.endsWith("/auth/me")) {
        return apiResponse(200, { success: true, data: { user: recoveryOwner } });
      }
      const notification = emptyNotifications(url);
      if (notification) return notification;
      if (url.includes("/documents?") && !url.includes("/recovery/")) {
        return apiResponse(200, {
          success: true,
          data: { documents: [] },
          meta: { page: 1, limit: 100, total: 0, totalPages: 0 },
        });
      }
      if (url.endsWith("/documents/recovery/orphans")) {
        return apiResponse(200, {
          success: true,
          data: {
            recovery: {
              clean: false,
              advisoryOnly: true,
              scannedAt: "2026-09-05T12:00:00.000Z",
              storage: { orphanObjectCount: 1, missingObjectCount: 0 },
              vectorIndex: { orphanPointCount: 2, missingVersionCount: 0 },
            },
          },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Orphan inventory" })).toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Scan recovery inventory" }));
    expect(
      await screen.findByText("Anomalies require manual review; no automatic action was taken."),
    ).toBeInTheDocument();
    expect(screen.getByText("Orphan objects").nextElementSibling).toHaveTextContent("1");
    expect(screen.getByText("Orphan vector points").nextElementSibling).toHaveTextContent("2");
  });
});
