import { describe, expect, it } from "vitest";
import {
  adjustInventorySchema,
  categoryListQuerySchema,
  createCategorySchema,
  createProductSchema,
  normalizeSku,
  normalizeSlug,
  productListQuerySchema,
  updateCategorySchema,
  updateProductSchema,
} from "./catalog.schemas.js";

const categoryId = "2ab5644e-4100-48c2-9662-f242bc7a58bf";

describe("catalog schema normalization", () => {
  it("normalizes SKUs, slugs, and duplicate category selections", () => {
    expect(normalizeSku(" chair_001 ")).toBe("CHAIR_001");
    expect(normalizeSlug(" Office & Desk Chairs ")).toBe("office-desk-chairs");

    const product = createProductSchema.parse({
      sku: " chair-001 ",
      name: "Desk chair",
      price: "2999.50",
      categoryIds: [categoryId, categoryId],
    });
    expect(product).toMatchObject({
      sku: "CHAIR-001",
      categoryIds: [categoryId],
      description: "",
      initialQuantity: 0,
      lowStockThreshold: 0,
    });

    expect(
      createCategorySchema.parse({ slug: " Office Chairs ", name: "Office chairs" }),
    ).toMatchObject({ slug: "office-chairs" });
  });

  it("rejects invalid normalized identifiers and empty updates", () => {
    expect(
      createProductSchema.safeParse({ sku: "bad sku!", name: "Chair", price: "10" }).success,
    ).toBe(false);
    expect(createCategorySchema.safeParse({ slug: "---", name: "Chair" }).success).toBe(false);
    expect(updateProductSchema.safeParse({ version: 0 }).success).toBe(false);
    expect(updateCategorySchema.safeParse({ version: 0 }).success).toBe(false);
    expect(updateCategorySchema.safeParse({ version: 0, description: null }).success).toBe(true);
  });
});

describe("catalog list query rules", () => {
  it("applies public defaults and accepts management-only status filters", () => {
    expect(productListQuerySchema.parse({})).toMatchObject({
      page: 1,
      limit: 20,
      view: "public",
      availability: "all",
      sort: "createdAt",
      direction: "desc",
      status: "ALL",
    });
    expect(productListQuerySchema.safeParse({ view: "management", status: "DRAFT" }).success).toBe(
      true,
    );
    expect(
      categoryListQuerySchema.safeParse({ view: "management", status: "INACTIVE" }).success,
    ).toBe(true);
  });

  it("rejects public status filters and inverted price ranges", () => {
    const publicProductStatus = productListQuerySchema.safeParse({ status: "ACTIVE" });
    expect(publicProductStatus.success).toBe(false);
    expect(publicProductStatus.error.issues[0].path).toEqual(["status"]);

    const publicCategoryStatus = categoryListQuerySchema.safeParse({ status: "ACTIVE" });
    expect(publicCategoryStatus.success).toBe(false);
    expect(publicCategoryStatus.error.issues[0].path).toEqual(["status"]);

    const priceRange = productListQuerySchema.safeParse({ minPrice: "20", maxPrice: "10" });
    expect(priceRange.success).toBe(false);
    expect(priceRange.error.issues[0].path).toEqual(["maxPrice"]);
  });
});

describe("inventory adjustment rules", () => {
  it("accepts reason-compatible adjustments", () => {
    expect(
      adjustInventorySchema.safeParse({ delta: 4, reason: "RESTOCK", version: 0 }).success,
    ).toBe(true);
    expect(
      adjustInventorySchema.safeParse({ delta: -2, reason: "DAMAGE", version: 1 }).success,
    ).toBe(true);
    expect(
      adjustInventorySchema.safeParse({ delta: -1, reason: "CORRECTION", version: 2 }).success,
    ).toBe(true);
  });

  it("rejects zero and reason-incompatible adjustments", () => {
    expect(
      adjustInventorySchema.safeParse({ delta: 0, reason: "CORRECTION", version: 0 }).success,
    ).toBe(false);
    expect(
      adjustInventorySchema.safeParse({ delta: -1, reason: "RESTOCK", version: 0 }).success,
    ).toBe(false);
    expect(
      adjustInventorySchema.safeParse({ delta: 1, reason: "DAMAGE", version: 0 }).success,
    ).toBe(false);
    expect(
      adjustInventorySchema.safeParse({ delta: 1, reason: "INITIAL", version: 0 }).success,
    ).toBe(false);
  });
});
