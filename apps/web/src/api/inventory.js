import { apiRequest } from "./client.js";

export async function listInventory({ page = 1, limit = 50, search, signal } = {}) {
  const parameters = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) parameters.set("search", search);
  const payload = await apiRequest(`/inventory?${parameters}`, { signal });
  return { inventory: payload.data.inventory, meta: payload.meta };
}

export async function listInventoryAdjustments(productId, { page = 1, limit = 20 } = {}) {
  const payload = await apiRequest(
    `/inventory/${productId}/adjustments?page=${page}&limit=${limit}`,
  );
  return { adjustments: payload.data.adjustments, meta: payload.meta };
}

export async function adjustInventory(productId, adjustment) {
  const payload = await apiRequest(`/inventory/${productId}/adjustments`, {
    method: "POST",
    body: adjustment,
    requiresCsrf: true,
  });
  return payload.data.inventory;
}

export async function updateInventoryThreshold(productId, lowStockThreshold, version) {
  const payload = await apiRequest(`/inventory/${productId}`, {
    method: "PATCH",
    body: { lowStockThreshold, version },
    requiresCsrf: true,
  });
  return payload.data.inventory;
}
