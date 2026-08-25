import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

const unauthenticated = apiResponse(401, {
  success: false,
  error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication is required" },
});

const customer = {
  id: "1d7408ed-b33a-4cc2-bf87-8c7f2cf91af4",
  email: "customer@example.com",
  displayName: "Customer",
  status: "ACTIVE",
  roles: ["CUSTOMER"],
  permissions: [],
};

const admin = {
  ...customer,
  id: "10d4fe71-cecc-4dc6-92c9-410b5301d7bf",
  email: "admin@example.com",
  displayName: "Administrator",
  roles: ["ADMIN"],
  permissions: [
    "permissions:read",
    "roles:read",
    "users:read",
    "users:roles:manage",
    "users:status:manage",
  ],
};

describe("OpsPilot web authentication", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/");
    document.cookie = "opspilot_csrf=; Max-Age=0; path=/";
  });

  it("shows the healthy platform state while treating a missing session as signed out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url.endsWith("/auth/me")) return unauthenticated;
        if (url.endsWith("/health")) {
          return apiResponse(200, { success: true, data: { status: "ok" } });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(<App />);

    expect(screen.getByText("Checking the platform services…")).toBeInTheDocument();
    expect(await screen.findByText("Foundation ready")).toBeInTheDocument();
    expect(screen.getByText("Web, API, and MySQL are connected.")).toBeInTheDocument();
  });

  it("redirects an unauthenticated protected route to login", async () => {
    window.history.replaceState({}, "", "/dashboard");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(unauthenticated));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Log in to OpsPilot" })).toBeInTheDocument();
  });

  it("logs in and opens the protected dashboard", async () => {
    window.history.replaceState({}, "", "/login");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options = {}) => {
        if (url.endsWith("/auth/me")) return unauthenticated;
        if (url.endsWith("/auth/login") && options.method === "POST") {
          return apiResponse(200, { success: true, data: { user: customer } });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    const user = userEvent.setup();

    render(<App />);
    await screen.findByRole("heading", { name: "Log in to OpsPilot" });
    await user.type(screen.getByLabelText("Email"), customer.email);
    await user.type(screen.getByLabelText("Password"), "Phase2 secure password!");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("heading", { name: "Welcome, Customer." })).toBeInTheDocument();
    expect(screen.getByText("CUSTOMER")).toBeInTheDocument();
  });

  it("shows an authorization state when a customer opens the user administration route", async () => {
    window.history.replaceState({}, "", "/admin/users");
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
    expect(screen.getByText(/does not have permission/i)).toBeInTheDocument();
  });

  it("registers a customer and opens the protected dashboard", async () => {
    window.history.replaceState({}, "", "/register");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options = {}) => {
        if (url.endsWith("/auth/me")) return unauthenticated;
        if (url.endsWith("/auth/register") && options.method === "POST") {
          return apiResponse(201, { success: true, data: { user: customer } });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    const user = userEvent.setup();

    render(<App />);
    await screen.findByRole("heading", { name: "Create your account" });
    await user.type(screen.getByLabelText("Display name"), customer.displayName);
    await user.type(screen.getByLabelText("Email"), customer.email);
    await user.type(screen.getByLabelText("Password"), "Phase2 secure password!");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Welcome, Customer." })).toBeInTheDocument();
  });

  it("loads the authorized user list and forwards CSRF for a status change", async () => {
    window.history.replaceState({}, "", "/admin/users");
    document.cookie = "opspilot_csrf=test-csrf-token; path=/";
    const disabledCustomer = { ...customer, status: "DISABLED" };
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.endsWith("/auth/me")) {
        return apiResponse(200, { success: true, data: { user: admin } });
      }
      if (url.includes("/users?page=")) {
        return apiResponse(200, {
          success: true,
          data: { users: [customer] },
          meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
        });
      }
      if (url.endsWith(`/users/${customer.id}/status`) && options.method === "PATCH") {
        expect(options.headers["X-CSRF-Token"]).toBe("test-csrf-token");
        return apiResponse(200, { success: true, data: { user: disabledCustomer } });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Users and access" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Disable" }));

    expect(await screen.findByText("DISABLED")).toBeInTheDocument();
  });

  it("logs out with CSRF and returns to the login page", async () => {
    window.history.replaceState({}, "", "/dashboard");
    document.cookie = "opspilot_csrf=logout-token; path=/";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options = {}) => {
        if (url.endsWith("/auth/me")) {
          return apiResponse(200, { success: true, data: { user: customer } });
        }
        if (url.endsWith("/auth/logout") && options.method === "POST") {
          expect(options.headers["X-CSRF-Token"]).toBe("logout-token");
          return apiResponse(200, { success: true, data: { loggedOut: true } });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    const user = userEvent.setup();

    render(<App />);
    await screen.findByRole("heading", { name: "Welcome, Customer." });
    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("heading", { name: "Log in to OpsPilot" })).toBeInTheDocument();
  });

  it("shows a safe unavailable state when health cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url.endsWith("/auth/me")) return unauthenticated;
        if (url.endsWith("/health")) throw new Error("network failed");
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Platform services are unavailable.")).toBeInTheDocument();
    });
  });
});
