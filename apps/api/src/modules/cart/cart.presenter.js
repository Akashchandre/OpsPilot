import {
  bigSubunitsToMoney,
  moneyToSubunitsBigInt,
  presentMoney,
} from "../commerce/commerce.money.js";
import { PRODUCT_STATUS_ACTIVE } from "../commerce/commerce.constants.js";

export const cartInclude = Object.freeze({
  items: {
    include: { product: { include: { inventoryBalance: true } } },
    orderBy: [{ createdAt: "asc" }, { productId: "asc" }],
  },
});

export function presentCart(cart, currency) {
  let subtotalSubunits = 0n;
  let requiresReview = false;

  const items = cart.items.map((item) => {
    const currentUnitPrice = presentMoney(item.product.price);
    const observedUnitPrice = presentMoney(item.observedUnitPrice);
    const priceChanged =
      currentUnitPrice !== observedUnitPrice || item.product.currency !== item.observedCurrency;
    const active = item.product.status === PRODUCT_STATUS_ACTIVE;
    const inStock = (item.product.inventoryBalance?.onHand ?? 0) > 0;
    const sufficientForQuantity = (item.product.inventoryBalance?.onHand ?? 0) >= item.quantity;
    const purchasable =
      active &&
      sufficientForQuantity &&
      item.product.currency === currency &&
      item.observedCurrency === currency;

    subtotalSubunits += moneyToSubunitsBigInt(currentUnitPrice) * BigInt(item.quantity);
    requiresReview ||= priceChanged || !purchasable;

    return {
      product: {
        id: item.product.id,
        sku: item.product.sku,
        name: item.product.name,
        status: item.product.status,
      },
      quantity: item.quantity,
      observedUnitPrice,
      currentUnitPrice,
      currency: item.product.currency,
      lineTotal: bigSubunitsToMoney(
        moneyToSubunitsBigInt(currentUnitPrice) * BigInt(item.quantity),
      ),
      priceChanged,
      availability: { inStock, sufficientForQuantity },
      purchasable,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  });

  return {
    id: cart.id,
    version: cart.version,
    items,
    subtotal: bigSubunitsToMoney(subtotalSubunits),
    currency,
    requiresReview,
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
  };
}
