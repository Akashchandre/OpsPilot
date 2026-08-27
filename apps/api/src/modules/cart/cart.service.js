import { cartInclude, presentCart } from "./cart.presenter.js";
import { PRODUCT_STATUS_ACTIVE } from "../commerce/commerce.constants.js";
import {
  commerceError,
  commerceVersionConflict,
  isPrismaWriteConflict,
} from "../commerce/commerce.errors.js";
import { presentMoney } from "../commerce/commerce.money.js";

async function ensureCart(transaction, userId) {
  return transaction.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

async function loadCart(transaction, userId) {
  const cart = await transaction.cart.findUnique({ where: { userId }, include: cartInclude });
  if (!cart) throw commerceError(500, "CART_STATE_INVALID", "Cart state is invalid");
  return cart;
}

function mapCartError(error) {
  if (error?.isOperational) throw error;
  if (isPrismaWriteConflict(error)) throw commerceVersionConflict();
  throw error;
}

export function createCartService(database, config) {
  return {
    async get(userId) {
      await ensureCart(database, userId);
      return presentCart(await loadCart(database, userId), config.business.currency);
    },

    async setItem({ userId, productId, input }) {
      try {
        const cart = await database.$transaction(
          async (transaction) => {
            const currentCart = await ensureCart(transaction, userId);
            if (currentCart.version !== input.version) throw commerceVersionConflict();

            const product = await transaction.product.findUnique({
              where: { id: productId },
              include: { inventoryBalance: true },
            });
            if (!product || product.status !== PRODUCT_STATUS_ACTIVE) {
              throw commerceError(404, "PRODUCT_NOT_FOUND", "Product was not found");
            }
            if (product.currency !== config.business.currency) {
              throw commerceError(
                409,
                "PRODUCT_CURRENCY_UNSUPPORTED",
                "Product currency is not supported for this cart",
              );
            }
            if ((product.inventoryBalance?.onHand ?? 0) < input.quantity) {
              throw commerceError(
                409,
                "CART_STOCK_UNAVAILABLE",
                "The requested quantity is not currently available",
              );
            }

            const existing = await transaction.cartItem.findUnique({
              where: { cartId_productId: { cartId: currentCart.id, productId } },
            });
            const unchanged =
              existing?.quantity === input.quantity &&
              presentMoney(existing.observedUnitPrice) === presentMoney(product.price) &&
              existing.observedCurrency === product.currency;
            if (unchanged) return loadCart(transaction, userId);

            await transaction.cartItem.upsert({
              where: { cartId_productId: { cartId: currentCart.id, productId } },
              update: {
                quantity: input.quantity,
                observedUnitPrice: product.price,
                observedCurrency: product.currency,
              },
              create: {
                cartId: currentCart.id,
                productId,
                quantity: input.quantity,
                observedUnitPrice: product.price,
                observedCurrency: product.currency,
              },
            });
            const update = await transaction.cart.updateMany({
              where: { id: currentCart.id, version: input.version },
              data: { version: { increment: 1 } },
            });
            if (update.count !== 1) throw commerceVersionConflict();
            return loadCart(transaction, userId);
          },
          { isolationLevel: "Serializable" },
        );
        return presentCart(cart, config.business.currency);
      } catch (error) {
        mapCartError(error);
      }
    },

    async removeItem({ userId, productId, input }) {
      try {
        const cart = await database.$transaction(
          async (transaction) => {
            const currentCart = await ensureCart(transaction, userId);
            if (currentCart.version !== input.version) throw commerceVersionConflict();
            const deletion = await transaction.cartItem.deleteMany({
              where: { cartId: currentCart.id, productId },
            });
            if (deletion.count > 0) {
              const update = await transaction.cart.updateMany({
                where: { id: currentCart.id, version: input.version },
                data: { version: { increment: 1 } },
              });
              if (update.count !== 1) throw commerceVersionConflict();
            }
            return loadCart(transaction, userId);
          },
          { isolationLevel: "Serializable" },
        );
        return presentCart(cart, config.business.currency);
      } catch (error) {
        mapCartError(error);
      }
    },

    async clear({ userId, input }) {
      try {
        const cart = await database.$transaction(
          async (transaction) => {
            const currentCart = await ensureCart(transaction, userId);
            if (currentCart.version !== input.version) throw commerceVersionConflict();
            const deletion = await transaction.cartItem.deleteMany({
              where: { cartId: currentCart.id },
            });
            if (deletion.count > 0) {
              const update = await transaction.cart.updateMany({
                where: { id: currentCart.id, version: input.version },
                data: { version: { increment: 1 } },
              });
              if (update.count !== 1) throw commerceVersionConflict();
            }
            return loadCart(transaction, userId);
          },
          { isolationLevel: "Serializable" },
        );
        return presentCart(cart, config.business.currency);
      } catch (error) {
        mapCartError(error);
      }
    },
  };
}
