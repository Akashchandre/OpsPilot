import dotenv from "dotenv";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import { hashPassword } from "./modules/auth/auth.password.js";

dotenv.config({ path: ".env.test", override: true, quiet: true });

const config = loadEnvironment();
const database = createDatabase(config.databaseUrl);
const app = createApp({ config, database });
const origin = config.corsOrigin;
const password = "Phase3 secure password!";
let passwordHash;

function cookieValue(response, name) {
  const cookie = response.headers["set-cookie"]?.find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`Response did not set ${name}`);
  return cookie.slice(name.length + 1).split(";", 1)[0];
}

async function clearBusinessData() {
  await database.inventoryAdjustment.deleteMany();
  await database.productCategory.deleteMany();
  await database.inventoryBalance.deleteMany();
  await database.product.deleteMany();
  await database.category.deleteMany();
}

async function clearIdentityData() {
  await database.securityEvent.deleteMany();
  await database.authSession.deleteMany();
  await database.userRole.deleteMany();
  await database.user.deleteMany();
}

async function seedUser(email, roleCode) {
  return database.user.create({
    data: {
      email,
      displayName: roleCode === "CUSTOMER" ? "Customer" : "Administrator",
      passwordHash,
      roles: { create: { role: { connect: { code: roleCode } } } },
    },
  });
}

async function authenticatedAgent(email, roleCode = "ADMIN") {
  await seedUser(email, roleCode);
  const agent = request.agent(app);
  const login = await agent
    .post("/api/v1/auth/login")
    .set("Origin", origin)
    .send({ email, password });
  expect(login.status).toBe(200);
  return { agent, csrf: cookieValue(login, config.auth.csrfCookieName) };
}

function withCsrf(requestBuilder, csrf) {
  return requestBuilder.set("Origin", origin).set("X-CSRF-Token", csrf);
}

async function createCategory(agent, csrf, input = {}) {
  return withCsrf(agent.post("/api/v1/categories"), csrf).send({
    slug: input.slug ?? "Office Chairs",
    name: input.name ?? "Office Chairs",
    description: input.description ?? "Ergonomic seating",
  });
}

async function createProduct(agent, csrf, categoryIds = [], input = {}) {
  return withCsrf(agent.post("/api/v1/products"), csrf).send({
    sku: input.sku ?? "chair-001",
    name: input.name ?? "Ergonomic Chair",
    description: input.description ?? "Adjustable office chair",
    price: input.price ?? "12999.50",
    categoryIds,
    initialQuantity: input.initialQuantity ?? 5,
    lowStockThreshold: input.lowStockThreshold ?? 2,
  });
}

beforeAll(async () => {
  passwordHash = await hashPassword(password);
});

beforeEach(async () => {
  await clearBusinessData();
  await clearIdentityData();
});

afterAll(async () => {
  await clearBusinessData();
  await clearIdentityData();
  await database.$disconnect();
});

describe.sequential("Phase 3 business core API", () => {
  it("publishes only active catalog data without revealing exact inventory", async () => {
    const { agent, csrf } = await authenticatedAgent("admin-catalog@example.com");
    const categoryResponse = await createCategory(agent, csrf);
    expect(categoryResponse.status).toBe(201);
    expect(categoryResponse.body.data.category.slug).toBe("office-chairs");

    const productResponse = await createProduct(agent, csrf, [
      categoryResponse.body.data.category.id,
    ]);
    expect(productResponse.status).toBe(201);
    expect(productResponse.body.data.product).toMatchObject({
      sku: "CHAIR-001",
      price: "12999.50",
      currency: "INR",
      status: "DRAFT",
    });

    const beforeActivation = await request(app).get("/api/v1/products");
    expect(beforeActivation.status).toBe(200);
    expect(beforeActivation.body.data.products).toEqual([]);

    const activation = await withCsrf(
      agent.patch(`/api/v1/products/${productResponse.body.data.product.id}/status`),
      csrf,
    ).send({ status: "ACTIVE", version: productResponse.body.data.product.version });
    expect(activation.status).toBe(200);

    const catalog = await request(app).get(
      "/api/v1/products?search=chair&availability=inStock&sort=price&direction=asc",
    );
    expect(catalog.status).toBe(200);
    expect(catalog.body.meta.total).toBe(1);
    expect(catalog.body.data.products[0]).toMatchObject({
      sku: "CHAIR-001",
      availability: { inStock: true },
    });
    expect(catalog.body.data.products[0]).not.toHaveProperty("onHand");
    expect(catalog.body.data.products[0]).not.toHaveProperty("inventory");

    const detail = await request(app).get(
      `/api/v1/products/${productResponse.body.data.product.id}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.data.product.categories[0].slug).toBe("office-chairs");
  });

  it("protects management views and mutations from customers and missing CSRF", async () => {
    const { agent: customerAgent, csrf } = await authenticatedAgent(
      "catalog-customer@example.com",
      "CUSTOMER",
    );

    const management = await customerAgent.get("/api/v1/products?view=management");
    expect(management.status).toBe(403);

    const forbiddenCreate = await withCsrf(customerAgent.post("/api/v1/categories"), csrf).send({
      slug: "forbidden",
      name: "Forbidden",
    });
    expect(forbiddenCreate.status).toBe(403);

    const { agent: adminAgent } = await authenticatedAgent("csrf-admin@example.com");
    const missingCsrf = await adminAgent
      .post("/api/v1/categories")
      .set("Origin", origin)
      .send({ slug: "missing-csrf", name: "Missing CSRF" });
    expect(missingCsrf.status).toBe(403);
    expect(missingCsrf.body.error.code).toBe("CSRF_INVALID");
  });

  it("normalizes uniqueness and rejects activation without an active category", async () => {
    const { agent, csrf } = await authenticatedAgent("admin-validation@example.com");
    const firstCategory = await createCategory(agent, csrf, { slug: "Office Chairs" });
    expect(firstCategory.status).toBe(201);
    const duplicateCategory = await createCategory(agent, csrf, { slug: "office---chairs" });
    expect(duplicateCategory.status).toBe(409);
    expect(duplicateCategory.body.error.code).toBe("CATEGORY_SLUG_EXISTS");

    const firstProduct = await createProduct(agent, csrf, [], { sku: "seat_001" });
    expect(firstProduct.status).toBe(201);
    const duplicateProduct = await createProduct(agent, csrf, [], { sku: "SEAT_001" });
    expect(duplicateProduct.status).toBe(409);
    expect(duplicateProduct.body.error.code).toBe("PRODUCT_SKU_EXISTS");

    const activation = await withCsrf(
      agent.patch(`/api/v1/products/${firstProduct.body.data.product.id}/status`),
      csrf,
    ).send({ status: "ACTIVE", version: firstProduct.body.data.product.version });
    expect(activation.status).toBe(409);
    expect(activation.body.error.code).toBe("PRODUCT_NOT_READY");
  });

  it("enforces product versions, lifecycle transitions, and category-in-use rules", async () => {
    const { agent, csrf } = await authenticatedAgent("admin-lifecycle@example.com");
    const category = (await createCategory(agent, csrf)).body.data.category;
    const product = (await createProduct(agent, csrf, [category.id])).body.data.product;

    const updated = await withCsrf(agent.patch(`/api/v1/products/${product.id}`), csrf).send({
      name: "Updated Chair",
      version: product.version,
    });
    expect(updated.status).toBe(200);

    const stale = await withCsrf(agent.patch(`/api/v1/products/${product.id}`), csrf).send({
      name: "Stale Chair",
      version: product.version,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("RESOURCE_VERSION_CONFLICT");

    const invalidTransition = await withCsrf(
      agent.patch(`/api/v1/products/${product.id}/status`),
      csrf,
    ).send({ status: "ARCHIVED", version: updated.body.data.product.version });
    expect(invalidTransition.status).toBe(409);

    const activated = await withCsrf(
      agent.patch(`/api/v1/products/${product.id}/status`),
      csrf,
    ).send({ status: "ACTIVE", version: updated.body.data.product.version });
    expect(activated.status).toBe(200);

    const deactivateCategory = await withCsrf(
      agent.patch(`/api/v1/categories/${category.id}/status`),
      csrf,
    ).send({ status: "INACTIVE", version: category.version });
    expect(deactivateCategory.status).toBe(409);
    expect(deactivateCategory.body.error.code).toBe("CATEGORY_IN_USE");
  });

  it("protects exact inventory and atomically records valid adjustments", async () => {
    const { agent, csrf } = await authenticatedAgent("admin-inventory@example.com");
    const category = (await createCategory(agent, csrf)).body.data.category;
    const product = (await createProduct(agent, csrf, [category.id], { initialQuantity: 4 })).body
      .data.product;

    expect((await request(app).get(`/api/v1/inventory/${product.id}`)).status).toBe(401);

    const exact = await agent.get(`/api/v1/inventory/${product.id}`);
    expect(exact.status).toBe(200);
    expect(exact.body.data.inventory).toMatchObject({ onHand: 4, version: 0 });

    const damaged = await withCsrf(
      agent.post(`/api/v1/inventory/${product.id}/adjustments`),
      csrf,
    ).send({ delta: -2, reason: "DAMAGE", note: "Packaging damage", version: 0 });
    expect(damaged.status).toBe(201);
    expect(damaged.body.data.inventory).toMatchObject({ onHand: 2, version: 1, lowStock: true });

    const belowZero = await withCsrf(
      agent.post(`/api/v1/inventory/${product.id}/adjustments`),
      csrf,
    ).send({ delta: -3, reason: "CORRECTION", version: 1 });
    expect(belowZero.status).toBe(409);
    expect(belowZero.body.error.code).toBe("INVENTORY_BELOW_ZERO");

    const history = await agent.get(`/api/v1/inventory/${product.id}/adjustments`);
    expect(history.status).toBe(200);
    expect(history.body.data.adjustments).toHaveLength(2);
    expect(history.body.data.adjustments.map((entry) => entry.reason).sort()).toEqual([
      "DAMAGE",
      "INITIAL",
    ]);

    const threshold = await withCsrf(agent.patch(`/api/v1/inventory/${product.id}`), csrf).send({
      lowStockThreshold: 1,
      version: 1,
    });
    expect(threshold.status).toBe(200);
    expect(threshold.body.data.inventory).toMatchObject({ lowStockThreshold: 1, lowStock: false });
  });

  it("allows only one concurrent adjustment for the same inventory version", async () => {
    const { agent, csrf } = await authenticatedAgent("admin-concurrency@example.com");
    const category = (await createCategory(agent, csrf)).body.data.category;
    const product = (await createProduct(agent, csrf, [category.id], { initialQuantity: 10 })).body
      .data.product;

    const requests = [2, 3].map((delta) =>
      withCsrf(agent.post(`/api/v1/inventory/${product.id}/adjustments`), csrf).send({
        delta,
        reason: "RESTOCK",
        version: 0,
      }),
    );
    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);

    const finalBalance = await agent.get(`/api/v1/inventory/${product.id}`);
    expect([12, 13]).toContain(finalBalance.body.data.inventory.onHand);
    const history = await agent.get(`/api/v1/inventory/${product.id}/adjustments`);
    expect(history.body.data.adjustments).toHaveLength(2);
  });
});
