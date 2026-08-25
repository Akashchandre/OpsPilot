import { apiRequest } from "./client.js";

export async function getCurrentUser({ signal } = {}) {
  const payload = await apiRequest("/auth/me", { signal });
  return payload.data.user;
}

export async function login(credentials) {
  const payload = await apiRequest("/auth/login", { method: "POST", body: credentials });
  return payload.data.user;
}

export async function register(registration) {
  const payload = await apiRequest("/auth/register", { method: "POST", body: registration });
  return payload.data.user;
}

export function logout() {
  return apiRequest("/auth/logout", { method: "POST", requiresCsrf: true });
}
