import { apiRequest } from "./client.js";

function queryString(values) {
  const parameters = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      parameters.set(key, String(value));
    }
  });
  const query = parameters.toString();
  return query ? `?${query}` : "";
}

export async function listProducts(filters = {}) {
  const { signal, ...query } = filters;
  const payload = await apiRequest(`/products${queryString(query)}`, { signal });
  return { products: payload.data.products, meta: payload.meta };
}

export async function getProduct(productId, { signal } = {}) {
  const payload = await apiRequest(`/products/${productId}`, { signal });
  return payload.data.product;
}

export async function listCategories(filters = {}) {
  const { signal, ...query } = filters;
  const payload = await apiRequest(`/categories${queryString(query)}`, { signal });
  return { categories: payload.data.categories, meta: payload.meta };
}

export async function createCategory(category) {
  const payload = await apiRequest("/categories", {
    method: "POST",
    body: category,
    requiresCsrf: true,
  });
  return payload.data.category;
}

export async function updateCategory(categoryId, category) {
  const payload = await apiRequest(`/categories/${categoryId}`, {
    method: "PATCH",
    body: category,
    requiresCsrf: true,
  });
  return payload.data.category;
}

export async function updateCategoryStatus(categoryId, status, version) {
  const payload = await apiRequest(`/categories/${categoryId}/status`, {
    method: "PATCH",
    body: { status, version },
    requiresCsrf: true,
  });
  return payload.data.category;
}

export async function createProduct(product) {
  const payload = await apiRequest("/products", {
    method: "POST",
    body: product,
    requiresCsrf: true,
  });
  return payload.data.product;
}

export async function updateProduct(productId, product) {
  const payload = await apiRequest(`/products/${productId}`, {
    method: "PATCH",
    body: product,
    requiresCsrf: true,
  });
  return payload.data.product;
}

export async function updateProductStatus(productId, status, version) {
  const payload = await apiRequest(`/products/${productId}/status`, {
    method: "PATCH",
    body: { status, version },
    requiresCsrf: true,
  });
  return payload.data.product;
}
