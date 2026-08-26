import { z } from "zod";
import {
  CATEGORY_STATUSES,
  CATALOG_VIEWS,
  INVENTORY_ADJUSTMENT_REASONS,
  MAX_INVENTORY_QUANTITY,
  PRODUCT_STATUSES,
} from "./catalog.constants.js";

export function normalizeSku(value) {
  return value.trim().toUpperCase();
}

export function normalizeSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const skuSchema = z
  .string()
  .min(1)
  .max(64)
  .transform(normalizeSku)
  .pipe(z.string().regex(/^[A-Z0-9]+(?:[-_][A-Z0-9]+)*$/, "Enter a valid SKU"));

const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .transform(normalizeSlug)
  .pipe(
    z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  );

const moneySchema = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/, "Enter a nonnegative amount with at most 2 decimals");

const categoryIdsSchema = z
  .array(z.uuid())
  .max(50)
  .transform((values) => [...new Set(values)]);

const paginationShape = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const productIdParamsSchema = z.strictObject({ productId: z.uuid() });
export const categoryIdParamsSchema = z.strictObject({ categoryId: z.uuid() });

export const productListQuerySchema = z
  .strictObject({
    ...paginationShape,
    view: z.enum(Object.values(CATALOG_VIEWS)).default(CATALOG_VIEWS.PUBLIC),
    search: z.string().trim().min(1).max(100).optional(),
    category: slugSchema.optional(),
    availability: z.enum(["all", "inStock", "outOfStock"]).default("all"),
    minPrice: moneySchema.optional(),
    maxPrice: moneySchema.optional(),
    sort: z.enum(["name", "price", "createdAt"]).default("createdAt"),
    direction: z.enum(["asc", "desc"]).default("desc"),
    status: z.enum(["ALL", ...Object.values(PRODUCT_STATUSES)]).default("ALL"),
  })
  .superRefine((query, context) => {
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      Number(query.minPrice) > Number(query.maxPrice)
    ) {
      context.addIssue({
        code: "custom",
        path: ["maxPrice"],
        message: "Maximum price must be greater than or equal to minimum price",
      });
    }
    if (query.view === CATALOG_VIEWS.PUBLIC && query.status !== "ALL") {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Status filtering is available only in management view",
      });
    }
  });

export const categoryListQuerySchema = z
  .strictObject({
    ...paginationShape,
    view: z.enum(Object.values(CATALOG_VIEWS)).default(CATALOG_VIEWS.PUBLIC),
    search: z.string().trim().min(1).max(100).optional(),
    status: z.enum(["ALL", ...Object.values(CATEGORY_STATUSES)]).default("ALL"),
  })
  .superRefine((query, context) => {
    if (query.view === CATALOG_VIEWS.PUBLIC && query.status !== "ALL") {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Status filtering is available only in management view",
      });
    }
  });

export const createProductSchema = z.strictObject({
  sku: skuSchema,
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(5000).default(""),
  price: moneySchema,
  categoryIds: categoryIdsSchema.default([]),
  initialQuantity: z.number().int().min(0).max(MAX_INVENTORY_QUANTITY).default(0),
  lowStockThreshold: z.number().int().min(0).max(MAX_INVENTORY_QUANTITY).default(0),
});

export const updateProductSchema = z
  .strictObject({
    version: z.number().int().min(0),
    name: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(5000).optional(),
    price: moneySchema.optional(),
    categoryIds: categoryIdsSchema.optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.description !== undefined ||
      body.price !== undefined ||
      body.categoryIds !== undefined,
    { message: "Provide at least one product field to update" },
  );

export const updateProductStatusSchema = z.strictObject({
  status: z.enum(Object.values(PRODUCT_STATUSES)),
  version: z.number().int().min(0),
});

export const createCategorySchema = z.strictObject({
  slug: slugSchema,
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
});

export const updateCategorySchema = z
  .strictObject({
    version: z.number().int().min(0),
    slug: slugSchema.optional(),
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (body) => body.slug !== undefined || body.name !== undefined || body.description !== undefined,
    { message: "Provide at least one category field to update" },
  );

export const updateCategoryStatusSchema = z.strictObject({
  status: z.enum(Object.values(CATEGORY_STATUSES)),
  version: z.number().int().min(0),
});

export const inventoryListQuerySchema = z.strictObject({
  ...paginationShape,
  search: z.string().trim().min(1).max(100).optional(),
});

export const adjustmentListQuerySchema = z.strictObject(paginationShape);

export const adjustInventorySchema = z
  .strictObject({
    delta: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .refine((value) => value !== 0, "Adjustment must not be zero"),
    reason: z.enum(
      Object.values(INVENTORY_ADJUSTMENT_REASONS).filter(
        (reason) => reason !== INVENTORY_ADJUSTMENT_REASONS.INITIAL,
      ),
    ),
    note: z.string().trim().min(1).max(500).optional(),
    version: z.number().int().min(0),
  })
  .superRefine((body, context) => {
    if (body.reason === INVENTORY_ADJUSTMENT_REASONS.RESTOCK && body.delta < 0) {
      context.addIssue({
        code: "custom",
        path: ["delta"],
        message: "A restock adjustment must increase inventory",
      });
    }
    if (body.reason === INVENTORY_ADJUSTMENT_REASONS.DAMAGE && body.delta > 0) {
      context.addIssue({
        code: "custom",
        path: ["delta"],
        message: "A damage adjustment must decrease inventory",
      });
    }
  });

export const updateInventoryThresholdSchema = z.strictObject({
  lowStockThreshold: z.number().int().min(0).max(MAX_INVENTORY_QUANTITY),
  version: z.number().int().min(0),
});
