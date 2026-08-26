import {
  catalogError,
  isPrismaWriteConflict,
  resourceNotFound,
  versionConflict,
} from "../catalog/catalog.errors.js";
import { MAX_INVENTORY_QUANTITY } from "../catalog/catalog.constants.js";
import { inventoryInclude, presentAdjustment, presentInventory } from "./inventory.presenter.js";

function paginationMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

async function loadInventory(transaction, productId) {
  const balance = await transaction.inventoryBalance.findUnique({
    where: { productId },
    include: inventoryInclude,
  });
  if (!balance) throw resourceNotFound("INVENTORY");
  return balance;
}

function rethrowInventoryError(error) {
  if (error?.isOperational) throw error;
  if (isPrismaWriteConflict(error)) throw versionConflict();
  throw error;
}

export function createInventoryService(database) {
  return {
    async list(query) {
      const where = query.search
        ? {
            product: {
              OR: [
                { name: { contains: query.search } },
                { sku: { contains: query.search.toUpperCase() } },
              ],
            },
          }
        : {};
      const [balances, total] = await database.$transaction([
        database.inventoryBalance.findMany({
          where,
          include: inventoryInclude,
          orderBy: [{ product: { name: "asc" } }, { productId: "asc" }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        database.inventoryBalance.count({ where }),
      ]);
      return {
        inventory: balances.map(presentInventory),
        meta: paginationMeta(query.page, query.limit, total),
      };
    },

    async get(productId) {
      return presentInventory(await loadInventory(database, productId));
    },

    async listAdjustments(productId, query) {
      if (!(await database.inventoryBalance.findUnique({ where: { productId } }))) {
        throw resourceNotFound("INVENTORY");
      }
      const where = { productId };
      const [adjustments, total] = await database.$transaction([
        database.inventoryAdjustment.findMany({
          where,
          include: { actor: { select: { id: true, displayName: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        database.inventoryAdjustment.count({ where }),
      ]);
      return {
        adjustments: adjustments.map(presentAdjustment),
        meta: paginationMeta(query.page, query.limit, total),
      };
    },

    async adjust({ actor, productId, input, requestId }) {
      try {
        return await database.$transaction(
          async (transaction) => {
            const balance = await loadInventory(transaction, productId);
            if (balance.version !== input.version) throw versionConflict();

            const quantityAfter = balance.onHand + input.delta;
            if (quantityAfter < 0) {
              throw catalogError(
                409,
                "INVENTORY_BELOW_ZERO",
                "The adjustment would make inventory negative",
              );
            }
            if (!Number.isSafeInteger(quantityAfter) || quantityAfter > MAX_INVENTORY_QUANTITY) {
              throw catalogError(
                409,
                "INVENTORY_LIMIT_EXCEEDED",
                "The resulting inventory quantity is too large",
              );
            }

            const updated = await transaction.inventoryBalance.updateMany({
              where: { productId, version: input.version },
              data: { onHand: quantityAfter, version: { increment: 1 } },
            });
            if (updated.count !== 1) throw versionConflict();

            await transaction.inventoryAdjustment.create({
              data: {
                productId,
                delta: input.delta,
                quantityBefore: balance.onHand,
                quantityAfter,
                reason: input.reason,
                note: input.note,
                actorUserId: actor.id,
                requestId,
              },
            });
            return presentInventory(await loadInventory(transaction, productId));
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        rethrowInventoryError(error);
      }
    },

    async updateThreshold({ productId, input }) {
      try {
        return await database.$transaction(
          async (transaction) => {
            const balance = await loadInventory(transaction, productId);
            if (balance.version !== input.version) throw versionConflict();
            if (balance.lowStockThreshold === input.lowStockThreshold) {
              return presentInventory(balance);
            }
            const updated = await transaction.inventoryBalance.updateMany({
              where: { productId, version: input.version },
              data: {
                lowStockThreshold: input.lowStockThreshold,
                version: { increment: 1 },
              },
            });
            if (updated.count !== 1) throw versionConflict();
            return presentInventory(await loadInventory(transaction, productId));
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        rethrowInventoryError(error);
      }
    },
  };
}
