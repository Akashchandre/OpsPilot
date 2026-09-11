import { describe, expect, it } from "vitest";
import { resolveNotificationSource } from "./notifications.gateway.js";

describe("notification gateway proxy source", () => {
  it("uses the direct peer when no proxy hop is trusted", () => {
    expect(resolveNotificationSource("127.0.0.1", "198.51.100.10", 0)).toBe("127.0.0.1");
  });

  it("selects the viewer behind Nginx and CloudFront", () => {
    expect(resolveNotificationSource("172.20.0.4", "198.51.100.10, 203.0.113.20", 2)).toBe(
      "198.51.100.10",
    );
  });

  it("ignores a viewer-supplied prefix before the trusted CloudFront hops", () => {
    expect(
      resolveNotificationSource("172.20.0.4", "192.0.2.99, 198.51.100.10, 203.0.113.20", 2),
    ).toBe("198.51.100.10");
  });

  it("falls back to the direct peer for a short or malformed forwarding chain", () => {
    expect(resolveNotificationSource("172.20.0.4", "198.51.100.10", 2)).toBe("172.20.0.4");
    expect(resolveNotificationSource("172.20.0.4", "not-an-ip, 203.0.113.20", 2)).toBe(
      "172.20.0.4",
    );
  });
});
