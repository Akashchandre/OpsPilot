import { apiRequest } from "./client.js";

function queryString(values) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  }
  return query.toString();
}

export async function getCart(options = {}) {
  const response = await apiRequest("/cart", options);
  return response.data.cart;
}

export async function setCartItem(productId, input) {
  const response = await apiRequest(`/cart/items/${productId}`, {
    method: "PUT",
    body: input,
    requiresCsrf: true,
  });
  return response.data.cart;
}

export async function removeCartItem(productId, version) {
  const response = await apiRequest(`/cart/items/${productId}`, {
    method: "DELETE",
    body: { version },
    requiresCsrf: true,
  });
  return response.data.cart;
}

export async function clearCart(version) {
  const response = await apiRequest("/cart/items", {
    method: "DELETE",
    body: { version },
    requiresCsrf: true,
  });
  return response.data.cart;
}

export async function createOrder(input, idempotencyKey) {
  const response = await apiRequest("/orders", {
    method: "POST",
    body: input,
    requiresCsrf: true,
    idempotencyKey,
  });
  return response.data;
}

export async function getPaymentSession(orderId) {
  const response = await apiRequest(`/orders/${orderId}/payment-session`, {
    method: "POST",
    body: {},
    requiresCsrf: true,
  });
  return response.data;
}

export async function confirmPayment(input) {
  const response = await apiRequest("/payments/confirm", {
    method: "POST",
    body: input,
    requiresCsrf: true,
  });
  return response.data;
}

export async function listOrders({
  view = "self",
  status = "ALL",
  page = 1,
  limit = 20,
  signal,
} = {}) {
  const response = await apiRequest(
    `/orders?${queryString({ view, status, page, limit, direction: "desc" })}`,
    { signal },
  );
  return { orders: response.data.orders, meta: response.meta };
}

export async function getOrder(orderId, { view = "self", signal } = {}) {
  const response = await apiRequest(`/orders/${orderId}?${queryString({ view })}`, { signal });
  return response.data.order;
}

export async function cancelOwnOrder(orderId, version) {
  const response = await apiRequest(`/orders/${orderId}/cancellation`, {
    method: "POST",
    body: { version },
    requiresCsrf: true,
  });
  return response.data.order;
}

export async function updateOrderStatus(orderId, input) {
  const response = await apiRequest(`/orders/${orderId}/status`, {
    method: "PATCH",
    body: input,
    requiresCsrf: true,
  });
  return response.data.order;
}

export async function refundPayment(paymentId, idempotencyKey) {
  const response = await apiRequest(`/payments/${paymentId}/refunds`, {
    method: "POST",
    body: {},
    requiresCsrf: true,
    idempotencyKey,
  });
  return response.data;
}

export async function reconcilePayment(paymentId) {
  const response = await apiRequest(`/payments/${paymentId}/reconcile`, {
    method: "POST",
    body: {},
    requiresCsrf: true,
  });
  return response.data.payment;
}
