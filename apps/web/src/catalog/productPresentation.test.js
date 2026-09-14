import { describe, expect, it } from "vitest";
import { formatPublicSku, productImageForSku } from "./productPresentation.js";

describe("catalog product presentation", () => {
  it("removes the internal demo marker from public SKUs", () => {
    expect(formatPublicSku("DEMO-DESK-001")).toBe("DESK-001");
    expect(formatPublicSku("CHAIR-001")).toBe("CHAIR-001");
  });

  it("maps known product SKUs to bundled catalog images", () => {
    expect(productImageForSku("DEMO-DESK-001")).toBe("/catalog-images/office-desk.jpg");
    expect(productImageForSku("UNKNOWN-001")).toBeUndefined();
  });
});
