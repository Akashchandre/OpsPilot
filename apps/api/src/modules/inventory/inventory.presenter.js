export const inventoryInclude = Object.freeze({
  product: {
    select: { id: true, sku: true, name: true, status: true },
  },
});

export function presentInventory(balance) {
  return {
    product: balance.product,
    onHand: balance.onHand,
    lowStockThreshold: balance.lowStockThreshold,
    inStock: balance.onHand > 0,
    lowStock: balance.onHand <= balance.lowStockThreshold,
    version: balance.version,
    updatedAt: balance.updatedAt,
  };
}

export function presentAdjustment(adjustment) {
  return {
    id: adjustment.id,
    productId: adjustment.productId,
    delta: adjustment.delta,
    quantityBefore: adjustment.quantityBefore,
    quantityAfter: adjustment.quantityAfter,
    reason: adjustment.reason,
    note: adjustment.note,
    actor: adjustment.actor
      ? { id: adjustment.actor.id, displayName: adjustment.actor.displayName }
      : null,
    createdAt: adjustment.createdAt,
  };
}
