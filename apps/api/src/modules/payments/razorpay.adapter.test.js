import { describe, expect, it, vi } from "vitest";
import { createRazorpayAdapter } from "./razorpay.adapter.js";

function providerConfig(enabled = true) {
  return {
    payments: {
      razorpay: {
        enabled,
        keyId: "unit_checkout_identifier",
        keySecret: "unit-only-api-material",
        apiBaseUrl: "https://provider.invalid/v1",
        checkoutScriptUrl: "https://provider.invalid/checkout.js",
        requestTimeoutMs: 100,
      },
    },
  };
}

describe("Razorpay adapter", () => {
  it("creates a non-partial provider order with subunit totals", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "order_unit_123" }),
    });
    const adapter = createRazorpayAdapter(providerConfig(), { fetchImpl });

    await adapter.createOrder({ amountSubunits: 12_345, currency: "INR", receipt: "op_unit" });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://provider.invalid/v1/orders");
    expect(JSON.parse(options.body)).toEqual({
      amount: 12_345,
      currency: "INR",
      receipt: "op_unit",
      partial_payment: false,
    });
    expect(options.headers.Authorization).toMatch(/^Basic /);
  });

  it("fails safely when the provider is disabled or times out", async () => {
    const disabled = createRazorpayAdapter(providerConfig(false));
    await expect(disabled.fetchOrder("order_unit_123")).rejects.toMatchObject({
      code: "PAYMENT_PROVIDER_NOT_CONFIGURED",
    });

    const timedOut = createRazorpayAdapter(providerConfig(), {
      fetchImpl: vi.fn().mockRejectedValue(new Error("sensitive network detail")),
    });
    await expect(timedOut.fetchPayment("pay_unit_123")).rejects.toMatchObject({
      code: "PAYMENT_PROVIDER_TIMEOUT",
      message: "The payment provider request could not be completed",
    });
  });

  it("supports receipt recovery, provider reads, and idempotent refunds", async () => {
    const ok = (payload) => ({ ok: true, status: 200, json: async () => payload });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok({ items: [{ id: "order_unit_123", receipt: "op_unit" }] }))
      .mockResolvedValueOnce(ok({ id: "order_unit_123" }))
      .mockResolvedValueOnce(ok({ items: [{ id: "pay_unit_123" }] }))
      .mockResolvedValueOnce(ok({ id: "pay_unit_123" }))
      .mockResolvedValueOnce(ok({ id: "rfnd_unit_123" }))
      .mockResolvedValueOnce(ok({ id: "rfnd_unit_123", status: "processed" }));
    const adapter = createRazorpayAdapter(providerConfig(), { fetchImpl });

    expect(await adapter.findOrderByReceipt("op_unit")).toMatchObject({ id: "order_unit_123" });
    await adapter.fetchOrder("order_unit_123");
    await adapter.fetchPaymentsForOrder("order_unit_123");
    await adapter.fetchPayment("pay_unit_123");
    await adapter.createRefund("pay_unit_123", {
      amountSubunits: 12_345,
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });
    await adapter.fetchRefund("rfnd_unit_123");

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "https://provider.invalid/v1/orders?receipt=op_unit&count=2",
      "https://provider.invalid/v1/orders/order_unit_123",
      "https://provider.invalid/v1/orders/order_unit_123/payments",
      "https://provider.invalid/v1/payments/pay_unit_123",
      "https://provider.invalid/v1/payments/pay_unit_123/refund",
      "https://provider.invalid/v1/refunds/rfnd_unit_123",
    ]);
    expect(fetchImpl.mock.calls[4][1].headers["X-Refund-Idempotency"]).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("maps provider response failures and duplicate receipts to safe codes", async () => {
    const response = (status, payload = {}) => ({
      ok: false,
      status,
      json: async () => payload,
    });
    for (const [status, code] of [
      [401, "PAYMENT_PROVIDER_AUTHENTICATION_FAILED"],
      [429, "PAYMENT_PROVIDER_RATE_LIMITED"],
      [500, "PAYMENT_PROVIDER_UNAVAILABLE"],
      [400, "PAYMENT_PROVIDER_REQUEST_REJECTED"],
    ]) {
      const adapter = createRazorpayAdapter(providerConfig(), {
        fetchImpl: vi.fn().mockResolvedValue(response(status)),
      });
      await expect(adapter.fetchOrder("order_unit_123")).rejects.toMatchObject({ code });
    }

    const invalidResponse = createRazorpayAdapter(providerConfig(), {
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("invalid body detail");
        },
      }),
    });
    await expect(invalidResponse.fetchOrder("order_unit_123")).rejects.toMatchObject({
      code: "PAYMENT_PROVIDER_INVALID_RESPONSE",
    });

    const duplicate = createRazorpayAdapter(providerConfig(), {
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            { id: "order_unit_1", receipt: "op_unit" },
            { id: "order_unit_2", receipt: "op_unit" },
          ],
        }),
      }),
    });
    await expect(duplicate.findOrderByReceipt("op_unit")).rejects.toMatchObject({
      code: "PAYMENT_PROVIDER_DUPLICATE_RECEIPT",
    });
  });
});
