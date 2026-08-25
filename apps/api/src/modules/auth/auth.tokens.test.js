import { describe, expect, it } from "vitest";
import { createOpaqueToken, digestToken, tokenMatchesDigest } from "./auth.tokens.js";

describe("opaque authentication tokens", () => {
  it("creates unpredictable values and compares only their digests", () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();
    const digest = digestToken(first);

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenMatchesDigest(first, digest)).toBe(true);
    expect(tokenMatchesDigest(second, digest)).toBe(false);
  });
});
