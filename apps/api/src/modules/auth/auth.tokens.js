import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export function digestToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function hashAuditValue(value) {
  return digestToken(value);
}

export function tokenMatchesDigest(token, expectedDigest) {
  if (typeof token !== "string" || typeof expectedDigest !== "string") {
    return false;
  }

  const actual = Buffer.from(digestToken(token), "hex");
  const expected = Buffer.from(expectedDigest, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
