import { createHmac, timingSafeEqual } from "node:crypto";

const sha256HexPattern = /^[0-9a-f]{64}$/i;

function verifyHmac(message, signature, secret) {
  if (typeof signature !== "string" || !sha256HexPattern.test(signature)) return false;
  if (typeof secret !== "string" || secret.length === 0) return false;

  const expected = Buffer.from(createHmac("sha256", secret).update(message).digest("hex"), "hex");
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature, secret }) {
  return verifyHmac(`${providerOrderId}|${providerPaymentId}`, signature, secret);
}

export function verifyWebhookSignature({ rawBody, signature, secret }) {
  return Buffer.isBuffer(rawBody) && verifyHmac(rawBody, signature, secret);
}
