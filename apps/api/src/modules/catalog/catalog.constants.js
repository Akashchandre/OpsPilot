export const PRODUCT_STATUSES = Object.freeze({
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
});

export const CATEGORY_STATUSES = Object.freeze({
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
});

export const CATALOG_VIEWS = Object.freeze({
  PUBLIC: "public",
  MANAGEMENT: "management",
});

export const INVENTORY_ADJUSTMENT_REASONS = Object.freeze({
  INITIAL: "INITIAL",
  RESTOCK: "RESTOCK",
  CORRECTION: "CORRECTION",
  DAMAGE: "DAMAGE",
});

export const MAX_INVENTORY_QUANTITY = 2_000_000_000;
