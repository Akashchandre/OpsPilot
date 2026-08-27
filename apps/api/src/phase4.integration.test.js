import { createHmac, randomUUID } from "node:crypto";
import dotenv from "dotenv";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import { hashPassword } from "./modules/auth/auth.password.js";

dotenv.config({ path: ".env.test", override: true, quiet: true });

const checkoutSigningMaterial = "unit-only-checkout-signing-material";
const webhookSigningMaterial = "unit-only-webhook-signing-material";
const baseConfig = loadEnvironment();
const config = {
  ...baseConfig,
  auth: { ...baseConfig.auth, loginRateLimitMax: 100 },
  payments: {
    ...baseConfig.payments,
    razorpay: {
      ...baseConfig.payments.razorpay,
      enabled: true,
      keyId: "unit_checkout_identifier",
      keySecret: checkoutSigningMaterial,
      webhookSecret: webhookSigningMaterial,
    },
  },
};

function createFakeProvider() {
  const state = {
    orders: new Map(),
    payments: new Map(),
    refunds: new Map(),
    nextRefundFailure: null,
  };

  return {
    enabled: true,
    keyId: config.payments.razorpay.keyId,
    checkoutScriptUrl: config.payments.razorpay.checkoutScriptUrl,
    reset() {
      state.orders.clear();
      state.payments.clear();
      state.refunds.clear();
      state.nextRefundFailure = null;
    },
    async createOrder({ amountSubunits, currency, receipt }) {
      const existing = [...state.orders.values()].find((order) => order.receipt === receipt);
      if (existing) return existing;
      const order = {
        id: `order_${receipt.replaceAll("-", "")}`,
        amount: amountSubunits,
        currency,
        receipt,
        status: "created",
        created_at: Math.floor(Date.now() / 1000),
      };
      state.orders.set(order.id, order);
      return order;
    },
    async findOrderByReceipt(receipt) {
      return [...state.orders.values()].find((order) => order.receipt === receipt) ?? null;
    },
    async fetchOrder(providerOrderId) {
      const order = state.orders.get(providerOrderId);
      if (!order)
        throw Object.assign(new Error("not found"), { code: "PAYMENT_PROVIDER_REQUEST_REJECTED" });
      return order;
    },
    async fetchPaymentsForOrder(providerOrderId) {
      return {
        items: [...state.payments.values()].filter(
          (payment) => payment.order_id === providerOrderId,
        ),
      };
    },
    async fetchPayment(providerPaymentId) {
      const payment = state.payments.get(providerPaymentId);
      if (!payment)
        throw Object.assign(new Error("not found"), { code: "PAYMENT_PROVIDER_REQUEST_REJECTED" });
      return payment;
    },
    async createRefund(providerPaymentId, { amountSubunits, idempotencyKey }) {
      if (state.nextRefundFailure) {
        const failure = state.nextRefundFailure;
        state.nextRefundFailure = null;
        throw failure;
      }
      const existing = [...state.refunds.values()].find(
        (refund) => refund.idempotencyKey === idempotencyKey,
      );
      if (existing) return existing;
      const payment = state.payments.get(providerPaymentId);
      const refund = {
        id: `rfnd_${idempotencyKey.replaceAll("-", "")}`,
        payment_id: providerPaymentId,
        amount: amountSubunits,
        currency: payment.currency,
        status: "processed",
        created_at: Math.floor(Date.now() / 1000),
        idempotencyKey,
      };
      state.refunds.set(refund.id, refund);
      return refund;
    },
    async fetchRefund(providerRefundId) {
      const refund = state.refunds.get(providerRefundId);
      if (!refund)
        throw Object.assign(new Error("not found"), { code: "PAYMENT_PROVIDER_REQUEST_REJECTED" });
      return refund;
    },
    setPayment(providerOrderId, providerPaymentId, status) {
      const order = state.orders.get(providerOrderId);
      const payment = {
        id: providerPaymentId,
        order_id: providerOrderId,
        amount: order.amount,
        currency: order.currency,
        status,
        created_at: Math.floor(Date.now() / 1000),
      };
      state.payments.set(providerPaymentId, payment);
      if (status === "captured") order.status = "paid";
      return payment;
    },
    setOrderStatus(providerOrderId, status) {
      state.orders.get(providerOrderId).status = status;
    },
    failNextRefund(failure) {
      state.nextRefundFailure = failure;
    },
  };
}

const database = createDatabase(config.databaseUrl);
const paymentProvider = createFakeProvider();
const app = createApp({ config, database, paymentProvider });
const origin = config.corsOrigin;
const password = "Phase4 secure password!";
const address = {
  recipientName: "Asha Customer",
  phone: "+919876543210",
  addressLine1: "10 Market Road",
  addressLine2: "Near Central Park",
  city: "Pune",
  state: "Maharashtra",
  postalCode: "411001",
  countryCode: "IN",
};
let passwordHash;

function cookieValue(response, name) {
  const cookie = response.headers["set-cookie"]?.find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`Response did not set ${name}`);
  return cookie.slice(name.length + 1).split(";", 1)[0];
}

function withCsrf(requestBuilder, csrf) {
  return requestBuilder.set("Origin", origin).set("X-CSRF-Token", csrf);
}

async function clearDatabase() {
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
  await database.inventoryAdjustment.deleteMany();
  await database.productCategory.deleteMany();
  await database.inventoryBalance.deleteMany();
  await database.product.deleteMany();
  await database.category.deleteMany();
  await database.securityEvent.deleteMany();
  await database.authSession.deleteMany();
  await database.userRole.deleteMany();
  await database.user.deleteMany();
}

async function seedUser(email, roleCode) {
  return database.user.create({
    data: {
      email,
      displayName: roleCode === "CUSTOMER" ? "Asha Customer" : "Order Administrator",
      passwordHash,
      roles: { create: { role: { connect: { code: roleCode } } } },
    },
  });
}

async function login(email) {
  const agent = request.agent(app);
  const response = await agent
    .post("/api/v1/auth/login")
    .set("Origin", origin)
    .send({ email, password });
  expect(response.status).toBe(200);
  return { agent, csrf: cookieValue(response, config.auth.csrfCookieName) };
}

async function seedProduct({ quantity = 5, price = "99.99", sku = "PHASE4-ITEM" } = {}) {
  return database.product.create({
    data: {
      sku,
      name: "Phase 4 Item",
      description: "A product used to verify checkout",
      price,
      currency: "INR",
      status: "ACTIVE",
      inventoryBalance: { create: { onHand: quantity, lowStockThreshold: 1 } },
    },
  });
}

async function addToCart(agent, csrf, productId, quantity = 1) {
  const current = await agent.get("/api/v1/cart");
  expect(current.status).toBe(200);
  return withCsrf(agent.put(`/api/v1/cart/items/${productId}`), csrf).send({
    quantity,
    version: current.body.data.cart.version,
  });
}

async function checkout(agent, csrf, productId, quantity = 1, idempotencyKey = randomUUID()) {
  const cart = await addToCart(agent, csrf, productId, quantity);
  expect(cart.status).toBe(200);
  const input = { cartVersion: cart.body.data.cart.version, shippingAddress: address };
  const response = await withCsrf(agent.post("/api/v1/orders"), csrf)
    .set("Idempotency-Key", idempotencyKey)
    .send(input);
  return { response, input, idempotencyKey };
}

function checkoutSignature(providerOrderId, providerPaymentId) {
  return createHmac("sha256", checkoutSigningMaterial)
    .update(`${providerOrderId}|${providerPaymentId}`)
    .digest("hex");
}

function webhookPayload(event, entity) {
  return {
    event,
    created_at: Math.floor(Date.now() / 1000),
    payload: event.startsWith("refund.") ? { refund: { entity } } : { payment: { entity } },
  };
}

async function sendWebhook(eventId, payload, { signatureOverride } = {}) {
  const rawBody = JSON.stringify(payload);
  const signature =
    signatureOverride ?? createHmac("sha256", webhookSigningMaterial).update(rawBody).digest("hex");
  return request(app)
    .post("/api/v1/payments/webhooks/razorpay")
    .set("Content-Type", "application/json")
    .set("X-Razorpay-Event-Id", eventId)
    .set("X-Razorpay-Signature", signature)
    .send(rawBody);
}

beforeAll(async () => {
  passwordHash = await hashPassword(password);
});

beforeEach(async () => {
  await clearDatabase();
  paymentProvider.reset();
});

afterAll(async () => {
  await clearDatabase();
  await database.$disconnect();
});

describe.sequential("Phase 4 cart, order, and Razorpay lifecycle", () => {
  it("enforces versioned carts, price review, checkout idempotency, and ownership", async () => {
    await seedUser("customer-cart@example.com", "CUSTOMER");
    await seedUser("other-customer@example.com", "CUSTOMER");
    const product = await seedProduct();
    const customer = await login("customer-cart@example.com");

    const anonymous = await request(app).get("/api/v1/cart");
    expect(anonymous.status).toBe(401);

    const cart = await addToCart(customer.agent, customer.csrf, product.id, 2);
    expect(cart.body.data.cart).toMatchObject({
      version: 1,
      subtotal: "199.98",
      requiresReview: false,
    });

    const stale = await withCsrf(
      customer.agent.put(`/api/v1/cart/items/${product.id}`),
      customer.csrf,
    ).send({ quantity: 1, version: 0 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("RESOURCE_VERSION_CONFLICT");

    await database.product.update({ where: { id: product.id }, data: { price: "109.99" } });
    const priceChanged = await withCsrf(customer.agent.post("/api/v1/orders"), customer.csrf)
      .set("Idempotency-Key", randomUUID())
      .send({ cartVersion: 1, shippingAddress: address });
    expect(priceChanged.status).toBe(409);
    expect(priceChanged.body.error.code).toBe("CART_PRICE_CHANGED");
    expect(await database.order.count()).toBe(0);
    expect(
      (await database.inventoryBalance.findUnique({ where: { productId: product.id } })).onHand,
    ).toBe(5);

    const reviewed = await withCsrf(
      customer.agent.put(`/api/v1/cart/items/${product.id}`),
      customer.csrf,
    ).send({ quantity: 2, version: 1 });
    const input = {
      cartVersion: reviewed.body.data.cart.version,
      shippingAddress: address,
    };
    const idempotencyKey = randomUUID();
    const created = await withCsrf(customer.agent.post("/api/v1/orders"), customer.csrf)
      .set("Idempotency-Key", idempotencyKey)
      .send(input);
    expect(created.status).toBe(201);
    expect(created.body.data.checkout).toMatchObject({
      keyId: config.payments.razorpay.keyId,
      amountSubunits: 21_998,
      currency: "INR",
    });

    const repeated = await withCsrf(customer.agent.post("/api/v1/orders"), customer.csrf)
      .set("Idempotency-Key", idempotencyKey)
      .send(input);
    expect(repeated.status).toBe(201);
    expect(repeated.body.data.order.id).toBe(created.body.data.order.id);
    expect(await database.order.count()).toBe(1);

    const reused = await withCsrf(customer.agent.post("/api/v1/orders"), customer.csrf)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        ...input,
        shippingAddress: { ...address, city: "Mumbai" },
      });
    expect(reused.status).toBe(409);
    expect(reused.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");

    const other = await login("other-customer@example.com");
    const hidden = await other.agent.get(`/api/v1/payments/${created.body.data.order.payment.id}`);
    expect(hidden.status).toBe(404);
  });

  it("updates, removes, clears, and validates cart quantities", async () => {
    await seedUser("customer-cart-actions@example.com", "CUSTOMER");
    const product = await seedProduct();
    const customer = await login("customer-cart-actions@example.com");
    const added = await addToCart(customer.agent, customer.csrf, product.id, 2);

    const updated = await withCsrf(
      customer.agent.put(`/api/v1/cart/items/${product.id}`),
      customer.csrf,
    ).send({ quantity: 3, version: added.body.data.cart.version });
    expect(updated.status).toBe(200);
    expect(updated.body.data.cart).toMatchObject({ version: 2, subtotal: "299.97" });

    const removed = await withCsrf(
      customer.agent.delete(`/api/v1/cart/items/${product.id}`),
      customer.csrf,
    ).send({ version: updated.body.data.cart.version });
    expect(removed.status).toBe(200);
    expect(removed.body.data.cart.items).toEqual([]);

    const unchanged = await withCsrf(
      customer.agent.delete(`/api/v1/cart/items/${product.id}`),
      customer.csrf,
    ).send({ version: removed.body.data.cart.version });
    expect(unchanged.status).toBe(200);
    expect(unchanged.body.data.cart.version).toBe(removed.body.data.cart.version);

    const readded = await withCsrf(
      customer.agent.put(`/api/v1/cart/items/${product.id}`),
      customer.csrf,
    ).send({ quantity: 1, version: unchanged.body.data.cart.version });
    const cleared = await withCsrf(customer.agent.delete("/api/v1/cart/items"), customer.csrf).send(
      {
        version: readded.body.data.cart.version,
      },
    );
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.cart.items).toEqual([]);

    const insufficient = await withCsrf(
      customer.agent.put(`/api/v1/cart/items/${product.id}`),
      customer.csrf,
    ).send({ quantity: 6, version: cleared.body.data.cart.version });
    expect(insufficient.status).toBe(409);
    expect(insufficient.body.error.code).toBe("CART_STOCK_UNAVAILABLE");

    const invalid = await withCsrf(
      customer.agent.put(`/api/v1/cart/items/${product.id}`),
      customer.csrf,
    ).send({ quantity: 100, version: cleared.body.data.cart.version });
    expect(invalid.status).toBe(422);
  });

  it("supports owned reads, payment resumption, fulfillment, and unpaid cancellation", async () => {
    await seedUser("customer-fulfillment@example.com", "CUSTOMER");
    await seedUser("admin-fulfillment@example.com", "ADMIN");
    const product = await seedProduct();
    const customer = await login("customer-fulfillment@example.com");
    const admin = await login("admin-fulfillment@example.com");
    const { response: created } = await checkout(customer.agent, customer.csrf, product.id);
    const { order, checkout: checkoutData } = created.body.data;

    const resumed = await withCsrf(
      customer.agent.post(`/api/v1/orders/${order.id}/payment-session`),
      customer.csrf,
    ).send({});
    expect(resumed.status).toBe(200);
    expect(resumed.body.data.checkout.providerOrderId).toBe(checkoutData.providerOrderId);

    expect((await customer.agent.get("/api/v1/orders")).body.data.orders).toHaveLength(1);
    expect((await customer.agent.get(`/api/v1/orders/${order.id}`)).status).toBe(200);
    expect((await customer.agent.get(`/api/v1/payments/${order.payment.id}`)).status).toBe(200);
    expect((await admin.agent.get("/api/v1/orders?view=management")).status).toBe(200);
    expect((await admin.agent.get(`/api/v1/orders/${order.id}?view=management`)).status).toBe(200);
    expect((await admin.agent.get(`/api/v1/payments/${order.payment.id}`)).status).toBe(200);

    const providerPaymentId = "pay_unit_fulfillment_001";
    paymentProvider.setPayment(checkoutData.providerOrderId, providerPaymentId, "captured");
    const confirmed = await withCsrf(
      customer.agent.post("/api/v1/payments/confirm"),
      customer.csrf,
    ).send({
      orderId: order.id,
      providerOrderId: checkoutData.providerOrderId,
      providerPaymentId,
      signature: checkoutSignature(checkoutData.providerOrderId, providerPaymentId),
    });

    const processing = await withCsrf(
      admin.agent.patch(`/api/v1/orders/${order.id}/status`),
      admin.csrf,
    ).send({ status: "PROCESSING", version: confirmed.body.data.order.version });
    expect(processing.body.data.order.status).toBe("PROCESSING");
    const shipped = await withCsrf(
      admin.agent.patch(`/api/v1/orders/${order.id}/status`),
      admin.csrf,
    ).send({
      status: "SHIPPED",
      version: processing.body.data.order.version,
      carrierName: "Unit Carrier",
      trackingNumber: "TRACK-001",
    });
    expect(shipped.body.data.order.fulfillment).toMatchObject({
      carrierName: "Unit Carrier",
      trackingNumber: "TRACK-001",
    });
    const delivered = await withCsrf(
      admin.agent.patch(`/api/v1/orders/${order.id}/status`),
      admin.csrf,
    ).send({ status: "DELIVERED", version: shipped.body.data.order.version });
    expect(delivered.body.data.order.status).toBe("DELIVERED");

    const invalidTransition = await withCsrf(
      admin.agent.patch(`/api/v1/orders/${order.id}/status`),
      admin.csrf,
    ).send({ status: "CANCELLED", version: delivered.body.data.order.version });
    expect(invalidTransition.status).toBe(409);
    expect(invalidTransition.body.error.code).toBe("ORDER_STATUS_TRANSITION_INVALID");

    const pending = await checkout(customer.agent, customer.csrf, product.id);
    const customerCancelled = await withCsrf(
      customer.agent.post(`/api/v1/orders/${pending.response.body.data.order.id}/cancellation`),
      customer.csrf,
    ).send({ version: pending.response.body.data.order.version });
    expect(customerCancelled.status).toBe(200);
    expect(customerCancelled.body.data.order.status).toBe("CANCELLED");
  });

  it("confirms only provider-fetched captures and performs one authorized full refund", async () => {
    await seedUser("customer-payment@example.com", "CUSTOMER");
    await seedUser("admin-payment@example.com", "ADMIN");
    const product = await seedProduct();
    const customer = await login("customer-payment@example.com");
    const admin = await login("admin-payment@example.com");
    const { response: created } = await checkout(customer.agent, customer.csrf, product.id, 2);
    expect(created.status).toBe(201);

    const { order, checkout: checkoutData } = created.body.data;
    const providerPaymentId = "pay_unit_capture_001";
    const capturedEntity = paymentProvider.setPayment(
      checkoutData.providerOrderId,
      providerPaymentId,
      "captured",
    );

    const invalid = await withCsrf(
      customer.agent.post("/api/v1/payments/confirm"),
      customer.csrf,
    ).send({
      orderId: order.id,
      providerOrderId: checkoutData.providerOrderId,
      providerPaymentId,
      signature: "0".repeat(64),
    });
    expect(invalid.status).toBe(422);
    expect((await database.order.findUnique({ where: { id: order.id } })).status).toBe(
      "PENDING_PAYMENT",
    );

    const confirmed = await withCsrf(
      customer.agent.post("/api/v1/payments/confirm"),
      customer.csrf,
    ).send({
      orderId: order.id,
      providerOrderId: checkoutData.providerOrderId,
      providerPaymentId,
      signature: checkoutSignature(checkoutData.providerOrderId, providerPaymentId),
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.order.status).toBe("CONFIRMED");
    expect(
      await database.inventoryReservation.count({
        where: { orderId: order.id, status: "CONSUMED" },
      }),
    ).toBe(1);

    const forbidden = await withCsrf(
      customer.agent.patch(`/api/v1/orders/${order.id}/status`),
      customer.csrf,
    ).send({ status: "CANCELLED", version: confirmed.body.data.order.version });
    expect(forbidden.status).toBe(403);

    const cancelled = await withCsrf(
      admin.agent.patch(`/api/v1/orders/${order.id}/status`),
      admin.csrf,
    ).send({ status: "CANCELLED", version: confirmed.body.data.order.version });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.order.status).toBe("CANCELLED");
    expect(cancelled.body.data.order.payment.status).toBe("REFUND_PENDING");

    const refundKey = randomUUID();
    const refunded = await withCsrf(
      admin.agent.post(`/api/v1/payments/${order.payment.id}/refunds`),
      admin.csrf,
    )
      .set("Idempotency-Key", refundKey)
      .send({});
    expect(refunded.status).toBe(200);
    expect(refunded.body.data.refund).toMatchObject({
      status: "PROCESSED",
      amount: "199.98",
      currency: "INR",
    });

    const repeated = await withCsrf(
      admin.agent.post(`/api/v1/payments/${order.payment.id}/refunds`),
      admin.csrf,
    )
      .set("Idempotency-Key", refundKey)
      .send({});
    expect(repeated.status).toBe(200);
    expect(repeated.body.data.refund.id).toBe(refunded.body.data.refund.id);
    expect(await database.refund.count()).toBe(1);
    expect((await database.payment.findUnique({ where: { id: order.payment.id } })).status).toBe(
      "REFUNDED",
    );
    const repeatedCapture = await sendWebhook(
      "evt_unit_post_refund_capture_1",
      webhookPayload("payment.captured", capturedEntity),
    );
    expect(repeatedCapture.status).toBe(200);
    expect((await database.payment.findUnique({ where: { id: order.payment.id } })).status).toBe(
      "REFUNDED",
    );
    expect((await database.order.findUnique({ where: { id: order.id } })).status).toBe("CANCELLED");
    expect(
      (await database.inventoryBalance.findUnique({ where: { productId: product.id } })).onHand,
    ).toBe(5);
  });

  it("keeps an ambiguous refund pending, applies failure evidence, and permits a safe retry", async () => {
    await seedUser("customer-refund-retry@example.com", "CUSTOMER");
    await seedUser("admin-refund-retry@example.com", "ADMIN");
    const product = await seedProduct();
    const customer = await login("customer-refund-retry@example.com");
    const admin = await login("admin-refund-retry@example.com");
    const { response: created } = await checkout(customer.agent, customer.csrf, product.id);
    const { order, checkout: checkoutData } = created.body.data;
    const providerPaymentId = "pay_unit_refund_retry_001";
    paymentProvider.setPayment(checkoutData.providerOrderId, providerPaymentId, "captured");
    const confirmed = await withCsrf(
      customer.agent.post("/api/v1/payments/confirm"),
      customer.csrf,
    ).send({
      orderId: order.id,
      providerOrderId: checkoutData.providerOrderId,
      providerPaymentId,
      signature: checkoutSignature(checkoutData.providerOrderId, providerPaymentId),
    });
    await withCsrf(admin.agent.patch(`/api/v1/orders/${order.id}/status`), admin.csrf).send({
      status: "CANCELLED",
      version: confirmed.body.data.order.version,
    });

    paymentProvider.failNextRefund(
      Object.assign(new Error("ambiguous unit timeout"), {
        code: "PAYMENT_PROVIDER_TIMEOUT",
        ambiguous: true,
      }),
    );
    const pending = await withCsrf(
      admin.agent.post(`/api/v1/payments/${order.payment.id}/refunds`),
      admin.csrf,
    )
      .set("Idempotency-Key", randomUUID())
      .send({});
    expect(pending.status).toBe(202);
    expect(pending.body.data).toMatchObject({
      refund: { status: "PENDING" },
      providerCode: "PAYMENT_PROVIDER_TIMEOUT",
    });

    const failedRefundEntity = {
      id: "rfnd_unit_failed_001",
      payment_id: providerPaymentId,
      amount: 9_999,
      currency: "INR",
      status: "failed",
      error_code: "unit_failure",
      created_at: Math.floor(Date.now() / 1000),
    };
    const failed = await sendWebhook(
      "evt_unit_refund_failed_1",
      webhookPayload("refund.failed", failedRefundEntity),
    );
    expect(failed.status).toBe(200);
    expect(
      (await database.refund.findFirst({ where: { paymentId: order.payment.id } })).status,
    ).toBe("FAILED");

    const retried = await withCsrf(
      admin.agent.post(`/api/v1/payments/${order.payment.id}/refunds`),
      admin.csrf,
    )
      .set("Idempotency-Key", randomUUID())
      .send({});
    expect(retried.status).toBe(200);
    expect(retried.body.data.refund.status).toBe("PROCESSED");
    expect(await database.refund.count()).toBe(2);
  });

  it("verifies, deduplicates, and monotonically applies raw webhook events", async () => {
    await seedUser("customer-webhook@example.com", "CUSTOMER");
    const product = await seedProduct();
    const customer = await login("customer-webhook@example.com");
    const { response: created } = await checkout(customer.agent, customer.csrf, product.id);
    const { order, checkout: checkoutData } = created.body.data;
    const providerPaymentId = "pay_unit_webhook_001";
    const authorizedEntity = paymentProvider.setPayment(
      checkoutData.providerOrderId,
      providerPaymentId,
      "authorized",
    );

    const invalid = await sendWebhook(
      "evt_unit_invalid_1",
      webhookPayload("payment.authorized", authorizedEntity),
      { signatureOverride: "0".repeat(64) },
    );
    expect(invalid.status).toBe(401);
    expect(await database.providerWebhookEvent.count()).toBe(0);

    const authorized = await sendWebhook(
      "evt_unit_authorized_1",
      webhookPayload("payment.authorized", authorizedEntity),
    );
    expect(authorized.status).toBe(200);
    expect((await database.order.findUnique({ where: { id: order.id } })).status).toBe(
      "PENDING_PAYMENT",
    );

    const capturedEntity = paymentProvider.setPayment(
      checkoutData.providerOrderId,
      providerPaymentId,
      "captured",
    );
    const capturedPayload = webhookPayload("payment.captured", capturedEntity);
    const captured = await sendWebhook("evt_unit_captured_1", capturedPayload);
    expect(captured.status).toBe(200);
    expect((await database.order.findUnique({ where: { id: order.id } })).status).toBe("CONFIRMED");

    const duplicate = await sendWebhook("evt_unit_captured_1", capturedPayload);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.data.duplicate).toBe(true);

    const failedEntity = { ...capturedEntity, status: "failed" };
    const lateFailure = await sendWebhook(
      "evt_unit_failed_1",
      webhookPayload("payment.failed", failedEntity),
    );
    expect(lateFailure.status).toBe(200);
    expect(
      await database.paymentAttempt.findUnique({
        where: { providerPaymentId },
      }),
    ).toMatchObject({ status: "CAPTURED" });

    const unsupportedPayload = webhookPayload("subscription.charged", {});
    const unsupported = await sendWebhook("evt_unit_unsupported_1", unsupportedPayload);
    expect(unsupported.status).toBe(200);
    expect(unsupported.body.data.status).toBe("IGNORED");
    const conflictingReplay = await sendWebhook(
      "evt_unit_unsupported_1",
      webhookPayload("subscription.charged", { changed: true }),
    );
    expect(conflictingReplay.status).toBe(409);
    const badEventId = await sendWebhook(
      "invalid event id",
      webhookPayload("payment.captured", capturedEntity),
    );
    expect(badEventId.status).toBe(400);
    expect(await database.providerWebhookEvent.count()).toBe(4);
  });

  it("releases expired stock and quarantines a later capture for review", async () => {
    await seedUser("customer-expiry@example.com", "CUSTOMER");
    const product = await seedProduct({ quantity: 1 });
    const customer = await login("customer-expiry@example.com");
    const { response: created } = await checkout(customer.agent, customer.csrf, product.id);
    const { order, checkout: checkoutData } = created.body.data;
    const past = new Date(Date.now() - 60_000);
    await database.order.update({
      where: { id: order.id },
      data: { reservationExpiresAt: past },
    });
    await database.inventoryReservation.updateMany({
      where: { orderId: order.id },
      data: { expiresAt: past },
    });

    const listing = await customer.agent.get("/api/v1/orders");
    expect(listing.status).toBe(200);
    expect(listing.body.data.orders[0].status).toBe("EXPIRED");
    expect(
      (await database.inventoryBalance.findUnique({ where: { productId: product.id } })).onHand,
    ).toBe(1);

    const capturedEntity = paymentProvider.setPayment(
      checkoutData.providerOrderId,
      "pay_unit_late_capture_001",
      "captured",
    );
    const lateCapture = await sendWebhook(
      "evt_unit_late_capture_1",
      webhookPayload("payment.captured", capturedEntity),
    );
    expect(lateCapture.status).toBe(200);
    expect(lateCapture.body.data.status).toBe("REVIEW_REQUIRED");
    expect((await database.order.findUnique({ where: { id: order.id } })).status).toBe(
      "PAYMENT_REVIEW",
    );
    expect(
      (await database.inventoryBalance.findUnique({ where: { productId: product.id } })).onHand,
    ).toBe(1);
  });

  it("allows only authorized operators to reconcile a lost capture", async () => {
    await seedUser("customer-reconcile@example.com", "CUSTOMER");
    await seedUser("admin-reconcile@example.com", "ADMIN");
    const product = await seedProduct();
    const customer = await login("customer-reconcile@example.com");
    const admin = await login("admin-reconcile@example.com");
    const { response: created } = await checkout(customer.agent, customer.csrf, product.id);
    const { order, checkout: checkoutData } = created.body.data;
    paymentProvider.setPayment(checkoutData.providerOrderId, "pay_unit_reconcile_001", "captured");

    const forbidden = await withCsrf(
      customer.agent.post(`/api/v1/payments/${order.payment.id}/reconcile`),
      customer.csrf,
    ).send({});
    expect(forbidden.status).toBe(403);

    const reconciled = await withCsrf(
      admin.agent.post(`/api/v1/payments/${order.payment.id}/reconcile`),
      admin.csrf,
    ).send({});
    expect(reconciled.status).toBe(200);
    expect(reconciled.body.data.payment.status).toBe("CAPTURED");
    expect((await database.order.findUnique({ where: { id: order.id } })).status).toBe("CONFIRMED");

    const second = await checkout(customer.agent, customer.csrf, product.id);
    const secondOrder = second.response.body.data.order;
    paymentProvider.setOrderStatus(second.response.body.data.checkout.providerOrderId, "paid");
    const reviewed = await withCsrf(
      admin.agent.post(`/api/v1/payments/${secondOrder.payment.id}/reconcile`),
      admin.csrf,
    ).send({});
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.data.payment.status).toBe("REVIEW_REQUIRED");
    expect((await database.order.findUnique({ where: { id: secondOrder.id } })).status).toBe(
      "PAYMENT_REVIEW",
    );
  });

  it("allows only one concurrent checkout to reserve the final unit", async () => {
    await seedUser("customer-race-one@example.com", "CUSTOMER");
    await seedUser("customer-race-two@example.com", "CUSTOMER");
    const product = await seedProduct({ quantity: 1 });
    const first = await login("customer-race-one@example.com");
    const second = await login("customer-race-two@example.com");
    const firstCart = await addToCart(first.agent, first.csrf, product.id);
    const secondCart = await addToCart(second.agent, second.csrf, product.id);

    const requests = [
      withCsrf(first.agent.post("/api/v1/orders"), first.csrf)
        .set("Idempotency-Key", randomUUID())
        .send({ cartVersion: firstCart.body.data.cart.version, shippingAddress: address }),
      withCsrf(second.agent.post("/api/v1/orders"), second.csrf)
        .set("Idempotency-Key", randomUUID())
        .send({ cartVersion: secondCart.body.data.cart.version, shippingAddress: address }),
    ];
    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await database.order.count()).toBe(1);
    expect(
      (await database.inventoryBalance.findUnique({ where: { productId: product.id } })).onHand,
    ).toBe(0);
  });
});
