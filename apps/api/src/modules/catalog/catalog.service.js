import {
  catalogError,
  isPrismaUniqueViolation,
  isPrismaWriteConflict,
  resourceNotFound,
  versionConflict,
} from "./catalog.errors.js";
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "../audit/audit.constants.js";
import { auditDescriptor } from "../audit/audit.descriptor.js";
import { createAuditService } from "../audit/audit.service.js";
import { CATEGORY_STATUSES, CATALOG_VIEWS, PRODUCT_STATUSES } from "./catalog.constants.js";
import { createProductInclude, presentCategory, presentProduct } from "./catalog.presenter.js";

function paginationMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

function productWhere(query, management) {
  const where = {};
  if (management) {
    if (query.status !== "ALL") where.status = query.status;
  } else {
    where.status = PRODUCT_STATUSES.ACTIVE;
  }

  if (query.search) {
    where.OR = [
      { name: { contains: query.search } },
      { sku: { contains: query.search.toUpperCase() } },
    ];
  }
  if (query.category) {
    where.categories = {
      some: {
        category: {
          slug: query.category,
          ...(!management ? { status: CATEGORY_STATUSES.ACTIVE } : {}),
        },
      },
    };
  }
  if (query.availability === "inStock") {
    where.inventoryBalance = { is: { onHand: { gt: 0 } } };
  }
  if (query.availability === "outOfStock") {
    where.inventoryBalance = { is: { onHand: 0 } };
  }
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.price = {
      ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
      ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
    };
  }
  return where;
}

async function requireActiveCategories(transaction, categoryIds) {
  if (categoryIds.length === 0) return [];
  const categories = await transaction.category.findMany({
    where: { id: { in: categoryIds }, status: CATEGORY_STATUSES.ACTIVE },
    select: { id: true },
  });
  if (categories.length !== categoryIds.length) {
    throw catalogError(
      422,
      "CATEGORY_SELECTION_INVALID",
      "Every selected category must exist and be active",
    );
  }
  return categories;
}

function assertProductTransition(from, to) {
  const transitions = {
    [PRODUCT_STATUSES.DRAFT]: PRODUCT_STATUSES.ACTIVE,
    [PRODUCT_STATUSES.ACTIVE]: PRODUCT_STATUSES.ARCHIVED,
    [PRODUCT_STATUSES.ARCHIVED]: PRODUCT_STATUSES.DRAFT,
  };
  if (from !== to && transitions[from] !== to) {
    throw catalogError(
      409,
      "PRODUCT_STATUS_TRANSITION_INVALID",
      `Product cannot move from ${from} to ${to}`,
    );
  }
}

async function loadProduct(transaction, productId) {
  const product = await transaction.product.findUnique({
    where: { id: productId },
    include: createProductInclude(),
  });
  if (!product) throw resourceNotFound("PRODUCT");
  return product;
}

async function loadCategory(transaction, categoryId) {
  const category = await transaction.category.findUnique({
    where: { id: categoryId },
    include: { _count: { select: { products: true } } },
  });
  if (!category) throw resourceNotFound("CATEGORY");
  return category;
}

function mapCatalogWriteError(error, duplicateCode, duplicateMessage) {
  if (error?.isOperational) throw error;
  if (isPrismaUniqueViolation(error)) {
    throw catalogError(409, duplicateCode, duplicateMessage);
  }
  if (isPrismaWriteConflict(error)) throw versionConflict();
  throw error;
}

export function createCatalogService(database, config) {
  const appendAudit = createAuditService(database, config).append;
  return {
    async listProducts(query) {
      const management = query.view === CATALOG_VIEWS.MANAGEMENT;
      const where = productWhere(query, management);
      const orderBy = [{ [query.sort]: query.direction }, { id: "asc" }];
      const [products, total] = await database.$transaction([
        database.product.findMany({
          where,
          include: createProductInclude({ publicOnly: !management }),
          orderBy,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        database.product.count({ where }),
      ]);
      return {
        products: products.map(presentProduct),
        meta: paginationMeta(query.page, query.limit, total),
      };
    },

    async getPublicProduct(productId) {
      const product = await database.product.findFirst({
        where: { id: productId, status: PRODUCT_STATUSES.ACTIVE },
        include: createProductInclude({ publicOnly: true }),
      });
      if (!product) throw resourceNotFound("PRODUCT");
      return presentProduct(product);
    },

    async createProduct({ actor, input, requestId }) {
      try {
        return await database.$transaction(
          async (transaction) => {
            await requireActiveCategories(transaction, input.categoryIds);
            const product = await transaction.product.create({
              data: {
                sku: input.sku,
                name: input.name,
                description: input.description,
                price: input.price,
                currency: config.business.currency,
                categories: {
                  create: input.categoryIds.map((categoryId) => ({ categoryId })),
                },
                inventoryBalance: {
                  create: {
                    onHand: input.initialQuantity,
                    lowStockThreshold: input.lowStockThreshold,
                  },
                },
                ...(input.initialQuantity > 0
                  ? {
                      inventoryAdjustments: {
                        create: {
                          delta: input.initialQuantity,
                          quantityBefore: 0,
                          quantityAfter: input.initialQuantity,
                          reason: "INITIAL",
                          actorUserId: actor.id,
                          requestId,
                        },
                      },
                    }
                  : {}),
              },
              include: createProductInclude(),
            });
            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.PRODUCT_CREATED,
                actorUserId: actor.id,
                targetType: AUDIT_TARGET_TYPES.PRODUCT,
                targetId: product.id,
                requestId,
                metadata: {
                  categoryCount: input.categoryIds.length,
                  initialQuantity: input.initialQuantity,
                  currency: config.business.currency,
                },
              }),
            );
            if (input.initialQuantity > 0) {
              await appendAudit(
                transaction,
                auditDescriptor({
                  action: AUDIT_ACTIONS.INVENTORY_ADJUSTED,
                  actorUserId: actor.id,
                  targetType: AUDIT_TARGET_TYPES.INVENTORY,
                  targetId: product.id,
                  requestId,
                  metadata: {
                    delta: input.initialQuantity,
                    quantityBefore: 0,
                    quantityAfter: input.initialQuantity,
                    reason: "INITIAL",
                  },
                }),
              );
            }
            return presentProduct(product);
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        mapCatalogWriteError(error, "PRODUCT_SKU_EXISTS", "A product with this SKU already exists");
      }
    },

    async updateProduct({ actor, productId, input, requestId }) {
      try {
        return await database.$transaction(
          async (transaction) => {
            const product = await loadProduct(transaction, productId);
            if (product.version !== input.version) throw versionConflict();
            if (input.categoryIds) {
              await requireActiveCategories(transaction, input.categoryIds);
              if (product.status === PRODUCT_STATUSES.ACTIVE && input.categoryIds.length === 0) {
                throw catalogError(
                  409,
                  "ACTIVE_PRODUCT_CATEGORY_REQUIRED",
                  "An active product must have at least one active category",
                );
              }
            }

            const update = await transaction.product.updateMany({
              where: { id: productId, version: input.version },
              data: {
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.description !== undefined ? { description: input.description } : {}),
                ...(input.price !== undefined ? { price: input.price } : {}),
                version: { increment: 1 },
              },
            });
            if (update.count !== 1) throw versionConflict();

            if (input.categoryIds) {
              await transaction.productCategory.deleteMany({ where: { productId } });
              if (input.categoryIds.length > 0) {
                await transaction.productCategory.createMany({
                  data: input.categoryIds.map((categoryId) => ({ productId, categoryId })),
                });
              }
            }
            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.PRODUCT_UPDATED,
                actorUserId: actor.id,
                targetType: AUDIT_TARGET_TYPES.PRODUCT,
                targetId: productId,
                requestId,
                metadata: {
                  changedFields: ["name", "description", "price", "categoryIds"].filter(
                    (field) => input[field] !== undefined,
                  ),
                },
              }),
            );
            return presentProduct(await loadProduct(transaction, productId));
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        mapCatalogWriteError(error, "PRODUCT_SKU_EXISTS", "A product with this SKU already exists");
      }
    },

    async updateProductStatus({ actor, productId, input, requestId }) {
      try {
        return await database.$transaction(
          async (transaction) => {
            const product = await loadProduct(transaction, productId);
            if (product.version !== input.version) throw versionConflict();
            assertProductTransition(product.status, input.status);
            if (product.status === input.status) return presentProduct(product);

            if (input.status === PRODUCT_STATUSES.ACTIVE) {
              const activeCategoryCount = await transaction.productCategory.count({
                where: { productId, category: { status: CATEGORY_STATUSES.ACTIVE } },
              });
              if (activeCategoryCount === 0) {
                throw catalogError(
                  409,
                  "PRODUCT_NOT_READY",
                  "A product needs at least one active category before activation",
                );
              }
            }

            const update = await transaction.product.updateMany({
              where: { id: productId, version: input.version },
              data: { status: input.status, version: { increment: 1 } },
            });
            if (update.count !== 1) throw versionConflict();
            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.PRODUCT_STATUS_CHANGED,
                actorUserId: actor.id,
                targetType: AUDIT_TARGET_TYPES.PRODUCT,
                targetId: productId,
                requestId,
                metadata: { fromStatus: product.status, toStatus: input.status },
              }),
            );
            return presentProduct(await loadProduct(transaction, productId));
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        mapCatalogWriteError(error, "PRODUCT_SKU_EXISTS", "A product with this SKU already exists");
      }
    },

    async listCategories(query) {
      const management = query.view === CATALOG_VIEWS.MANAGEMENT;
      const where = {
        ...(management && query.status !== "ALL"
          ? { status: query.status }
          : !management
            ? { status: CATEGORY_STATUSES.ACTIVE }
            : {}),
        ...(query.search
          ? { OR: [{ name: { contains: query.search } }, { slug: { contains: query.search } }] }
          : {}),
      };
      const [categories, total] = await database.$transaction([
        database.category.findMany({
          where,
          include: { _count: { select: { products: true } } },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        database.category.count({ where }),
      ]);
      return {
        categories: categories.map((category) =>
          presentCategory(category, { includeCount: management }),
        ),
        meta: paginationMeta(query.page, query.limit, total),
      };
    },

    async createCategory({ actor, input, requestId }) {
      try {
        const category = await database.$transaction(
          async (transaction) => {
            const created = await transaction.category.create({ data: input });
            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.CATEGORY_CREATED,
                actorUserId: actor.id,
                targetType: AUDIT_TARGET_TYPES.CATEGORY,
                targetId: created.id,
                requestId,
                metadata: {},
              }),
            );
            return created;
          },
          { isolationLevel: "Serializable" },
        );
        return presentCategory(category);
      } catch (error) {
        mapCatalogWriteError(
          error,
          "CATEGORY_SLUG_EXISTS",
          "A category with this slug already exists",
        );
      }
    },

    async updateCategory({ actor, categoryId, input, requestId }) {
      try {
        return await database.$transaction(
          async (transaction) => {
            const category = await loadCategory(transaction, categoryId);
            if (category.version !== input.version) throw versionConflict();
            const update = await transaction.category.updateMany({
              where: { id: categoryId, version: input.version },
              data: {
                ...(input.slug !== undefined ? { slug: input.slug } : {}),
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.description !== undefined ? { description: input.description } : {}),
                version: { increment: 1 },
              },
            });
            if (update.count !== 1) throw versionConflict();
            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.CATEGORY_UPDATED,
                actorUserId: actor.id,
                targetType: AUDIT_TARGET_TYPES.CATEGORY,
                targetId: categoryId,
                requestId,
                metadata: {
                  changedFields: ["slug", "name", "description"].filter(
                    (field) => input[field] !== undefined,
                  ),
                },
              }),
            );
            return presentCategory(await loadCategory(transaction, categoryId), {
              includeCount: true,
            });
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        mapCatalogWriteError(
          error,
          "CATEGORY_SLUG_EXISTS",
          "A category with this slug already exists",
        );
      }
    },

    async updateCategoryStatus({ actor, categoryId, input, requestId }) {
      try {
        return await database.$transaction(
          async (transaction) => {
            const category = await loadCategory(transaction, categoryId);
            if (category.version !== input.version) throw versionConflict();
            if (category.status === input.status) {
              return presentCategory(category, { includeCount: true });
            }
            if (input.status === CATEGORY_STATUSES.INACTIVE) {
              const activeProductCount = await transaction.productCategory.count({
                where: { categoryId, product: { status: PRODUCT_STATUSES.ACTIVE } },
              });
              if (activeProductCount > 0) {
                throw catalogError(
                  409,
                  "CATEGORY_IN_USE",
                  "A category linked to an active product cannot be deactivated",
                );
              }
            }
            const update = await transaction.category.updateMany({
              where: { id: categoryId, version: input.version },
              data: { status: input.status, version: { increment: 1 } },
            });
            if (update.count !== 1) throw versionConflict();
            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.CATEGORY_STATUS_CHANGED,
                actorUserId: actor.id,
                targetType: AUDIT_TARGET_TYPES.CATEGORY,
                targetId: categoryId,
                requestId,
                metadata: { fromStatus: category.status, toStatus: input.status },
              }),
            );
            return presentCategory(await loadCategory(transaction, categoryId), {
              includeCount: true,
            });
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        mapCatalogWriteError(
          error,
          "CATEGORY_SLUG_EXISTS",
          "A category with this slug already exists",
        );
      }
    },
  };
}
