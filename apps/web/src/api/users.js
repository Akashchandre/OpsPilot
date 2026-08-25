import { apiRequest } from "./client.js";

export async function listUsers({ page = 1, limit = 50, signal } = {}) {
  const payload = await apiRequest(`/users?page=${page}&limit=${limit}`, { signal });
  return { users: payload.data.users, meta: payload.meta };
}

export async function updateUserStatus(userId, status) {
  const payload = await apiRequest(`/users/${userId}/status`, {
    method: "PATCH",
    body: { status },
    requiresCsrf: true,
  });
  return payload.data.user;
}

export async function assignUserRole(userId, roleCode) {
  const payload = await apiRequest(`/users/${userId}/roles`, {
    method: "POST",
    body: { roleCode },
    requiresCsrf: true,
  });
  return payload.data.user;
}

export async function removeUserRole(userId, roleCode) {
  const payload = await apiRequest(`/users/${userId}/roles/${roleCode}`, {
    method: "DELETE",
    requiresCsrf: true,
  });
  return payload.data.user;
}
