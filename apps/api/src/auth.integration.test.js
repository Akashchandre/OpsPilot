import dotenv from "dotenv";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import { hashPassword } from "./modules/auth/auth.password.js";
import { bootstrapOwner } from "./modules/auth/ownerBootstrap.service.js";

dotenv.config({ path: ".env.test", override: true, quiet: true });

const baseConfig = loadEnvironment();
const config = {
  ...baseConfig,
  auth: { ...baseConfig.auth, loginRateLimitMax: 100 },
};
const database = createDatabase(config.databaseUrl);
const app = createApp({ config, database });
const origin = config.corsOrigin;
const password = "Phase2 secure password!";
let sharedPasswordHash;

async function clearCommerceData() {
  await database.providerWebhookEvent.deleteMany();
  await database.refund.deleteMany();
  await database.paymentAttempt.deleteMany();
  await database.payment.deleteMany();
  await database.orderStatusEvent.deleteMany();
  await database.inventoryReservation.deleteMany();
  await database.orderItem.deleteMany();
  await database.order.deleteMany();
  await database.cartItem.deleteMany();
  await database.cart.deleteMany();
}

function cookieValue(response, name) {
  const cookie = response.headers["set-cookie"]?.find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`Response did not set ${name}`);
  return cookie.slice(name.length + 1).split(";", 1)[0];
}

async function register(agent, email, displayName = "Phase Two Customer") {
  return agent
    .post("/api/v1/auth/register")
    .set("Origin", origin)
    .send({ displayName, email, password });
}

async function login(agent, email) {
  return agent.post("/api/v1/auth/login").set("Origin", origin).send({ email, password });
}

async function seedUser({ email, displayName, roleCode }) {
  return database.user.create({
    data: {
      email,
      displayName,
      passwordHash: sharedPasswordHash,
      roles: { create: { role: { connect: { code: roleCode } } } },
    },
  });
}

beforeAll(async () => {
  sharedPasswordHash = await hashPassword(password);
});

beforeEach(async () => {
  await clearCommerceData();
  await database.securityEvent.deleteMany();
  await database.authSession.deleteMany();
  await database.userRole.deleteMany();
  await database.user.deleteMany();
});

afterAll(async () => {
  await clearCommerceData();
  await database.securityEvent.deleteMany();
  await database.authSession.deleteMany();
  await database.userRole.deleteMany();
  await database.user.deleteMany();
  await database.$disconnect();
});

describe.sequential("Phase 2 authentication and RBAC API", () => {
  it("registers a customer, protects the session with CSRF, and revokes it on logout", async () => {
    const agent = request.agent(app);

    const unauthenticated = await agent.get("/api/v1/auth/me");
    expect(unauthenticated.status).toBe(401);

    const registration = await register(agent, "Customer@Example.com");
    expect(registration.status).toBe(201);
    expect(registration.body.data.user).toMatchObject({
      email: "customer@example.com",
      roles: ["CUSTOMER"],
      permissions: [],
    });
    expect(
      registration.headers["set-cookie"].find((value) =>
        value.startsWith(`${config.auth.sessionCookieName}=`),
      ),
    ).toContain("HttpOnly");

    const current = await agent.get("/api/v1/auth/me");
    expect(current.status).toBe(200);
    expect(current.body.data.user.email).toBe("customer@example.com");

    const missingCsrf = await agent.post("/api/v1/auth/logout").set("Origin", origin);
    expect(missingCsrf.status).toBe(403);
    expect(missingCsrf.body.error.code).toBe("CSRF_INVALID");

    const csrfToken = cookieValue(registration, config.auth.csrfCookieName);
    const logout = await agent
      .post("/api/v1/auth/logout")
      .set("Origin", origin)
      .set("X-CSRF-Token", csrfToken);
    expect(logout.status).toBe(200);

    const revoked = await agent.get("/api/v1/auth/me");
    expect(revoked.status).toBe(401);
  });

  it("returns safe registration, validation, and login failures", async () => {
    const firstAgent = request.agent(app);
    expect((await register(firstAgent, "duplicate@example.com")).status).toBe(201);

    const duplicate = await register(request.agent(app), "DUPLICATE@example.com");
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("REGISTRATION_UNAVAILABLE");

    const invalid = await request(app)
      .post("/api/v1/auth/register")
      .set("Origin", origin)
      .send({ displayName: "A", email: "not-email", password: "short" });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");

    const wrongPassword = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({ email: "duplicate@example.com", password: "incorrect password" });
    const unknownUser = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({ email: "unknown@example.com", password: "incorrect password" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body.error).toEqual(unknownUser.body.error);
  });

  it("rejects expired sessions and locks repeated invalid credentials", async () => {
    const agent = request.agent(app);
    const registration = await register(agent, "expiry@example.com");
    expect(registration.status).toBe(201);

    const createdUser = await database.user.findUnique({ where: { email: "expiry@example.com" } });
    await database.authSession.updateMany({
      where: { userId: createdUser.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await agent.get("/api/v1/auth/me")).status).toBe(401);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await request(app)
        .post("/api/v1/auth/login")
        .set("Origin", origin)
        .send({ email: createdUser.email, password: "definitely incorrect" });
      expect(failed.status).toBe(401);
    }

    const lockedUser = await database.user.findUnique({ where: { id: createdUser.id } });
    expect(lockedUser.failedLoginAttempts).toBe(5);
    expect(lockedUser.lockedUntil.getTime()).toBeGreaterThan(Date.now());

    const validWhileLocked = await login(request.agent(app), createdUser.email);
    expect(validWhileLocked.status).toBe(401);
  });

  it("enforces deny-by-default permissions and applies role changes immediately", async () => {
    const owner = await seedUser({
      email: "owner@example.com",
      displayName: "Owner",
      roleCode: "OWNER",
    });
    const customer = await seedUser({
      email: "customer@example.com",
      displayName: "Customer",
      roleCode: "CUSTOMER",
    });
    const ownerAgent = request.agent(app);
    const customerAgent = request.agent(app);
    const ownerLogin = await login(ownerAgent, owner.email);
    await login(customerAgent, customer.email);

    const forbidden = await customerAgent.get("/api/v1/users");
    expect(forbidden.status).toBe(403);

    const ownerList = await ownerAgent.get("/api/v1/users");
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.meta.total).toBe(2);

    const roles = await ownerAgent.get("/api/v1/roles");
    const permissions = await ownerAgent.get("/api/v1/permissions");
    expect(roles.status).toBe(200);
    expect(roles.body.data.roles.map((role) => role.code)).toEqual(["ADMIN", "CUSTOMER", "OWNER"]);
    expect(permissions.status).toBe(200);
    expect(permissions.body.data.permissions).toHaveLength(14);
    expect(permissions.body.data.permissions.map((permission) => permission.code)).toContain(
      "inventory:adjust",
    );

    const csrfToken = cookieValue(ownerLogin, config.auth.csrfCookieName);
    const assigned = await ownerAgent
      .post(`/api/v1/users/${customer.id}/roles`)
      .set("Origin", origin)
      .set("X-CSRF-Token", csrfToken)
      .send({ roleCode: "ADMIN" });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data.user.roles).toEqual(["ADMIN", "CUSTOMER"]);

    const immediateAccess = await customerAgent.get("/api/v1/users");
    expect(immediateAccess.status).toBe(200);

    const lastOwnerRemoval = await ownerAgent
      .delete(`/api/v1/users/${owner.id}/roles/OWNER`)
      .set("Origin", origin)
      .set("X-CSRF-Token", csrfToken);
    expect(lastOwnerRemoval.status).toBe(409);
    expect(lastOwnerRemoval.body.error.code).toBe("LAST_OWNER_REQUIRED");
  });

  it("prevents administrators from modifying owners and rejects disabled sessions", async () => {
    const owner = await seedUser({
      email: "owner@example.com",
      displayName: "Owner",
      roleCode: "OWNER",
    });
    const admin = await seedUser({
      email: "admin@example.com",
      displayName: "Admin",
      roleCode: "ADMIN",
    });
    const ownerAgent = request.agent(app);
    const adminAgent = request.agent(app);
    const ownerLogin = await login(ownerAgent, owner.email);
    const adminLogin = await login(adminAgent, admin.email);

    const adminCsrf = cookieValue(adminLogin, config.auth.csrfCookieName);
    const ownerMutation = await adminAgent
      .patch(`/api/v1/users/${owner.id}/status`)
      .set("Origin", origin)
      .set("X-CSRF-Token", adminCsrf)
      .send({ status: "DISABLED" });
    expect(ownerMutation.status).toBe(403);

    const ownerCsrf = cookieValue(ownerLogin, config.auth.csrfCookieName);
    const disabled = await ownerAgent
      .patch(`/api/v1/users/${admin.id}/status`)
      .set("Origin", origin)
      .set("X-CSRF-Token", ownerCsrf)
      .send({ status: "DISABLED" });
    expect(disabled.status).toBe(200);

    const revoked = await adminAgent.get("/api/v1/auth/me");
    expect(revoked.status).toBe(401);
  });

  it("rate-limits repeated authentication attempts", async () => {
    const limitedConfig = {
      ...config,
      auth: { ...config.auth, loginRateLimitMax: 2 },
    };
    const limitedApp = createApp({ config: limitedConfig, database });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await request(limitedApp)
        .post("/api/v1/auth/login")
        .set("Origin", origin)
        .send({ email: `unknown-${attempt}@example.com`, password });
      expect(response.status).toBe(401);
    }

    const limited = await request(limitedApp)
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({ email: "unknown-final@example.com", password });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("AUTH_RATE_LIMITED");
  });

  it("bootstraps exactly one owner", async () => {
    const owner = await bootstrapOwner(database, {
      displayName: "Bootstrap Owner",
      email: "bootstrap@example.com",
      password,
    });
    expect(owner.roles).toEqual(["OWNER"]);
    expect(owner.permissions).toHaveLength(14);

    await expect(
      bootstrapOwner(database, {
        displayName: "Second Owner",
        email: "second@example.com",
        password,
      }),
    ).rejects.toMatchObject({ code: "OWNER_ALREADY_EXISTS" });
  });
});
