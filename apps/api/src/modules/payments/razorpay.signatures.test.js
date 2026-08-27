import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyCheckoutSignature, verifyWebhookSignature } from "./razorpay.signatures.js";

const signingMaterial = "unit-only-signing-material";

describe("Razorpay signature verification", () => {
  it("verifies Checkout using the stored order ID and exact payment ID", () => {
    const providerOrderId = "order_unit_123";
    const providerPaymentId = "pay_unit_456";
    const signature = createHmac("sha256", signingMaterial)
      .update(`${providerOrderId}|${providerPaymentId}`)
      .digest("hex");

    expect(
      verifyCheckoutSignature({
        providerOrderId,
        providerPaymentId,
        signature,
        secret: signingMaterial,
      }),
    ).toBe(true);
    expect(
      verifyCheckoutSignature({
        providerOrderId,
        providerPaymentId: "pay_unit_tampered",
        signature,
        secret: signingMaterial,
      }),
    ).toBe(false);
  });

  it("binds webhook signatures to the exact raw bytes", () => {
    const rawBody = Buffer.from('{"event":"payment.captured","value":1}');
    const signature = createHmac("sha256", signingMaterial).update(rawBody).digest("hex");

    expect(verifyWebhookSignature({ rawBody, signature, secret: signingMaterial })).toBe(true);
    expect(
      verifyWebhookSignature({
        rawBody: Buffer.from('{"value":1,"event":"payment.captured"}'),
        signature,
        secret: signingMaterial,
      }),
    ).toBe(false);
    expect(
      verifyWebhookSignature({ rawBody, signature: "not-a-signature", secret: signingMaterial }),
    ).toBe(false);
  });
});
