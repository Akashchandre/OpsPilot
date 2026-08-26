import { CATEGORY_STATUSES } from "./catalog.constants.js";

export function createProductInclude({ publicOnly = false } = {}) {
  return {
    categories: {
      ...(publicOnly ? { where: { category: { status: CATEGORY_STATUSES.ACTIVE } } } : {}),
      include: { category: true },
      orderBy: { category: { name: "asc" } },
    },
    inventoryBalance: true,
  };
}

export function presentCategory(category, { includeCount = false } = {}) {
  const presented = {
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description,
    status: category.status,
    version: category.version,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
  if (includeCount) presented.productCount = category._count?.products ?? 0;
  return presented;
}

export function presentProduct(product) {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    price: product.price.toFixed(2),
    currency: product.currency,
    status: product.status,
    version: product.version,
    categories: product.categories.map((entry) => presentCategory(entry.category)),
    availability: { inStock: (product.inventoryBalance?.onHand ?? 0) > 0 },
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}
