import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openRazorpayCheckout } from "./razorpayCheckout.js";

const result = {
  order: { orderNumber: "OP-UNIT" },
  checkout: {
    keyId: "unit_checkout_identifier",
    amountSubunits: 12_345,
    currency: "INR",
    providerOrderId: "order_unit_123",
    timeoutSeconds: 900,
    scriptUrl: "https://checkout.razorpay.com/v1/checkout.js",
  },
};

describe("hosted Razorpay Checkout loader", () => {
  afterEach(() => {
    cleanup();
    delete window.Razorpay;
    document
      .querySelectorAll('script[data-opspilot-checkout="razorpay"]')
      .forEach((node) => node.remove());
  });

  it("rejects an unexpected Checkout script URL", async () => {
    await expect(
      openRazorpayCheckout(
        { ...result, checkout: { ...result.checkout, scriptUrl: "https://example.invalid/x.js" } },
        { onResult() {}, onDismiss() {}, onFailure() {} },
      ),
    ).rejects.toThrow("Checkout script is invalid");
  });

  it("loads the allowlisted script and opens the hosted modal", async () => {
    const open = vi.fn();
    const on = vi.fn();
    const onResult = vi.fn();
    const onDismiss = vi.fn();
    const onFailure = vi.fn();
    const pending = openRazorpayCheckout(result, { onResult, onDismiss, onFailure });
    const script = document.querySelector('script[data-opspilot-checkout="razorpay"]');
    expect(script).toHaveAttribute("src", result.checkout.scriptUrl);
    window.Razorpay = vi.fn(function Razorpay(options) {
      expect(options.handler).toBe(onResult);
      expect(options.modal.ondismiss).toBe(onDismiss);
      this.on = on;
      this.open = open;
    });
    script.dispatchEvent(new Event("load"));
    await pending;

    expect(on).toHaveBeenCalledWith("payment.failed", onFailure);
    expect(open).toHaveBeenCalledOnce();
  });

  it("reports failures from both a new and an existing Checkout script", async () => {
    const callbacks = { onResult() {}, onDismiss() {}, onFailure() {} };
    const firstLoad = openRazorpayCheckout(result, callbacks);
    const script = document.querySelector('script[data-opspilot-checkout="razorpay"]');
    const firstFailure = expect(firstLoad).rejects.toThrow("Secure checkout could not load");

    script.dispatchEvent(new Event("error"));
    await firstFailure;

    const retryLoad = openRazorpayCheckout(result, callbacks);
    const retryFailure = expect(retryLoad).rejects.toThrow("Secure checkout could not load");

    script.dispatchEvent(new Event("error"));
    await retryFailure;
  });
});
