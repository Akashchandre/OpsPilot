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
    "categories:manage",
    "inventory:adjust",
    "inventory:read",
    "products:manage",
    "roles:read",
    "users:read",
    "users:roles:manage",
    "users:status:manage",
  ],
};

const catalogCategory = {
  id: "8ac19d1e-ff10-4e7a-af02-a6a43d4ab231",
  slug: "chairs",
  name: "Chairs",
  description: "Office seating",
  status: "ACTIVE",
  version: 0,
  productCount: 1,
};

const catalogProduct = {
  id: "341fa2e5-0055-463d-b0ef-cb44aef36ccd",
  sku: "CHAIR-001",
  name: "Ergonomic Chair",
  description: "Adjustable office chair",
  price: "12999.50",
  currency: "INR",
  status: "ACTIVE",
  version: 0,
  categories: [catalogCategory],
  availability: { inStock: true },
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

  it("shows the public active catalog without requiring a session", async () => {
    window.history.replaceState({}, "", "/products");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url.endsWith("/auth/me")) return unauthenticated;
        if (url.includes("/categories?")) {
          return apiResponse(200, {
            success: true,
            data: { categories: [catalogCategory] },
            meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
          });
        }
        if (url.includes("/products?")) {
          return apiResponse(200, {
            success: true,
            data: {
              products: [catalogProduct],
            },
            meta: { page: 1, limit: 12, total: 13, totalPages: 2 },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Products" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Ergonomic Chair" })).toBeInTheDocument();
    expect(screen.getByText("In stock", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText(/₹|INR/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Search"), "chair");
    await user.selectOptions(screen.getByLabelText("Category"), "chairs");
    await user.selectOptions(screen.getByLabelText("Availability"), "inStock");
    await user.selectOptions(screen.getByLabelText("Sort"), "price:asc");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url.includes("search=chair"))).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url.includes("page=2"))).toBe(true),
    );
  });

  it("creates a category from the protected catalog UI with CSRF", async () => {
    window.history.replaceState({}, "", "/admin/catalog");
    document.cookie = "opspilot_csrf=catalog-token; path=/";
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.endsWith("/auth/me")) {
        return apiResponse(200, { success: true, data: { user: admin } });
      }
      if (url.includes("/products?view=management")) {
        return apiResponse(200, {
          success: true,
          data: { products: [] },
          meta: { page: 1, limit: 100, total: 0, totalPages: 0 },
        });
      }
      if (url.includes("/categories?view=management")) {
        return apiResponse(200, {
          success: true,
          data: { categories: [] },
          meta: { page: 1, limit: 100, total: 0, totalPages: 0 },
        });
      }
      if (url.endsWith("/categories") && options.method === "POST") {
        expect(options.headers["X-CSRF-Token"]).toBe("catalog-token");
        return apiResponse(201, {
          success: true,
          data: {
            category: {
              id: "category-1",
              slug: "office-chairs",
              name: "Office Chairs",
              description: "",
              status: "ACTIVE",
              version: 0,
              productCount: 0,
            },
          },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);
    const categoryHeading = await screen.findByRole("heading", { name: "Create category" });
    const categoryForm = categoryHeading.closest("form");
    await user.type(within(categoryForm).getByLabelText("Name"), "Office Chairs");
    await user.type(within(categoryForm).getByLabelText("Slug"), "office-chairs");
    await user.click(within(categoryForm).getByRole("button", { name: "Create category" }));

    expect(await screen.findByDisplayValue("Office Chairs")).toBeInTheDocument();
  });

  it("loads active product details and handles an unavailable product", async () => {
    window.history.replaceState({}, "", `/products/${catalogProduct.id}`);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url.endsWith("/auth/me")) return unauthenticated;
        if (url.endsWith(`/products/${catalogProduct.id}`)) {
          return apiResponse(200, { success: true, data: { product: catalogProduct } });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(<App />);
    expect(await screen.findByRole("heading", { name: catalogProduct.name })).toBeInTheDocument();
    expect(screen.getByText("Cart and ordering begin in Phase 4.")).toBeInTheDocument();

    cleanup();
    window.history.replaceState({}, "", "/products/2ce31da7-2736-4f6e-9193-aa3250e44a89");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url.endsWith("/auth/me")) return unauthenticated;
        if (url.includes("/products/")) {
          return apiResponse(404, {
            success: false,
            error: { code: "PRODUCT_NOT_FOUND", message: "Product was not found" },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Product unavailable" })).toBeInTheDocument();
  });

  it("maintains products and categories through protected versioned forms", async () => {
    window.history.replaceState({}, "", "/admin/catalog");
    document.cookie = "opspilot_csrf=management-token; path=/";
    let productState = { ...catalogProduct, status: "DRAFT", version: 0 };
    let categoryState = { ...catalogCategory };
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.endsWith("/auth/me")) {
        return apiResponse(200, { success: true, data: { user: admin } });
      }
      if (url.includes("/products?view=management")) {
        return apiResponse(200, {
          success: true,
          data: { products: [productState] },
          meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
        });
      }
      if (url.includes("/categories?view=management")) {
        return apiResponse(200, {
          success: true,
          data: { categories: [categoryState] },
          meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
        });
      }
      if (url.endsWith(`/products/${catalogProduct.id}`) && options.method === "PATCH") {
        expect(options.headers["X-CSRF-Token"]).toBe("management-token");
        const body = JSON.parse(options.body);
        productState = { ...productState, ...body, version: body.version + 1 };
        return apiResponse(200, { success: true, data: { product: productState } });
      }
      if (url.endsWith(`/products/${catalogProduct.id}/status`) && options.method === "PATCH") {
        const body = JSON.parse(options.body);
        productState = { ...productState, status: body.status, version: body.version + 1 };
        return apiResponse(200, { success: true, data: { product: productState } });
      }
      if (url.endsWith(`/categories/${catalogCategory.id}`) && options.method === "PATCH") {
        const body = JSON.parse(options.body);
        categoryState = { ...categoryState, ...body, version: body.version + 1 };
        return apiResponse(200, { success: true, data: { category: categoryState } });
      }
      if (url.endsWith(`/categories/${catalogCategory.id}/status`) && options.method === "PATCH") {
        const body = JSON.parse(options.body);
        categoryState = { ...categoryState, status: body.status, version: body.version + 1 };
        return apiResponse(200, { success: true, data: { category: categoryState } });
      }
      if (url.endsWith("/products") && options.method === "POST") {
        const body = JSON.parse(options.body);
        return apiResponse(201, {
          success: true,
          data: {
            product: {
              ...catalogProduct,
              id: "8b23f843-da07-4592-be3b-7c97b8bca4c6",
              ...body,
              sku: body.sku.toUpperCase(),
              status: "DRAFT",
              version: 0,
              currency: "INR",
              categories: [categoryState],
              availability: { inStock: body.initialQuantity > 0 },
            },
          },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);
    await screen.findByRole("heading", { name: "Catalog management" });

    let productForm = screen.getByDisplayValue("Ergonomic Chair").closest("form");
    await user.clear(within(productForm).getByLabelText("Name"));
    await user.type(within(productForm).getByLabelText("Name"), "Updated Chair");
    const categoryCheckbox = within(productForm).getByRole("checkbox", { name: "Chairs" });
    await user.click(categoryCheckbox);
    await user.click(categoryCheckbox);
    await user.click(within(productForm).getByRole("button", { name: "Save product" }));

    productForm = (await screen.findByDisplayValue("Updated Chair")).closest("form");
    await user.click(within(productForm).getByRole("button", { name: "Activate" }));
    productForm = (await screen.findByDisplayValue("Updated Chair")).closest("form");
    expect(within(productForm).getByText("ACTIVE", { selector: ".badge" })).toBeInTheDocument();

    let categoryForm = screen.getByDisplayValue("Chairs").closest("form");
    await user.clear(within(categoryForm).getByLabelText("Name"));
    await user.type(within(categoryForm).getByLabelText("Name"), "Seating");
    await user.click(within(categoryForm).getByRole("button", { name: "Save category" }));
    categoryForm = (await screen.findByDisplayValue("Seating")).closest("form");
    await user.click(within(categoryForm).getByRole("button", { name: "Deactivate" }));
    expect(await screen.findByText("INACTIVE", { selector: ".badge" })).toBeInTheDocument();

    const createHeading = screen.getByRole("heading", { name: "Create draft product" });
    const createForm = createHeading.closest("form");
    await user.type(within(createForm).getByLabelText("SKU"), "desk-001");
    await user.type(within(createForm).getByLabelText("Name"), "Standing Desk");
    await user.type(within(createForm).getByLabelText("Price (INR)"), "24999.00");
    await user.type(within(createForm).getByLabelText("Initial quantity"), "3");
    await user.click(within(createForm).getByRole("button", { name: "Create product" }));
    expect(await screen.findByDisplayValue("Standing Desk")).toBeInTheDocument();
  });

  it("adjusts inventory from the protected UI with the current version and CSRF", async () => {
    window.history.replaceState({}, "", "/admin/inventory");
    document.cookie = "opspilot_csrf=inventory-token; path=/";
    let balance = {
      product: { id: "product-1", sku: "CHAIR-001", name: "Chair", status: "ACTIVE" },
      onHand: 5,
      lowStockThreshold: 2,
      inStock: true,
      lowStock: false,
      version: 0,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options = {}) => {
        if (url.endsWith("/auth/me")) {
          return apiResponse(200, { success: true, data: { user: admin } });
        }
        if (url.includes("/inventory?page=")) {
          return apiResponse(200, {
            success: true,
            data: { inventory: [balance] },
            meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
          });
        }
        if (url.endsWith("/inventory/product-1/adjustments") && options.method === "POST") {
          expect(options.headers["X-CSRF-Token"]).toBe("inventory-token");
          expect(JSON.parse(options.body)).toMatchObject({
            delta: 2,
            reason: "RESTOCK",
            version: 0,
          });
          balance = { ...balance, onHand: 7, version: 1 };
          return apiResponse(201, { success: true, data: { inventory: balance } });
        }
        if (url.includes("/inventory/product-1/adjustments?page=")) {
          return apiResponse(200, {
            success: true,
            data: {
              adjustments: [
                {
                  id: "adjustment-1",
                  productId: "product-1",
                  delta: 2,
                  quantityBefore: 5,
                  quantityAfter: 7,
                  reason: "RESTOCK",
                  note: "New stock",
                  actor: { id: admin.id, displayName: admin.displayName },
                },
              ],
            },
            meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
          });
        }
        if (url.endsWith("/inventory/product-1") && options.method === "PATCH") {
          const body = JSON.parse(options.body);
          balance = {
            ...balance,
            lowStockThreshold: body.lowStockThreshold,
            lowStock: balance.onHand <= body.lowStockThreshold,
            version: body.version + 1,
          };
          return apiResponse(200, { success: true, data: { inventory: balance } });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    const user = userEvent.setup();

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Inventory" })).toBeInTheDocument();
    await user.type(await screen.findByLabelText("Signed quantity"), "2");
    await user.click(screen.getByRole("button", { name: "Apply adjustment" }));

    await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "View adjustment history" }));
    expect(await screen.findByText("+2 · RESTOCK")).toBeInTheDocument();
    expect(screen.getByText("New stock")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide adjustment history" }));

    const thresholdInput = screen.getByLabelText("Quantity");
    await user.clear(thresholdInput);
    await user.type(thresholdInput, "8");
    await user.click(screen.getByRole("button", { name: "Save threshold" }));
    await waitFor(() => expect(screen.getByText("8")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Search inventory"), "chair");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url.includes("search=chair"))).toBe(true),
    );
  });
});
