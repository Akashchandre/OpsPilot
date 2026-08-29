import { apiRequest } from "./client.js";

export async function listNotifications({ after, limit = 50, signal } = {}) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (after !== undefined) query.set("after", after);
  const response = await apiRequest(`/notifications?${query}`, { signal });
  return { notifications: response.data.notifications, meta: response.meta };
}

export async function getUnreadNotificationCount({ signal } = {}) {
  const response = await apiRequest("/notifications/unread-count", { signal });
  return response.data.unreadCount;
}

export async function markNotificationRead(notificationId) {
  const response = await apiRequest(`/notifications/${notificationId}/read`, {
    method: "PATCH",
    requiresCsrf: true,
  });
  return response.data.notification;
}

export async function markAllNotificationsRead(highWaterCursor) {
  const response = await apiRequest("/notifications/read-all", {
    method: "POST",
    requiresCsrf: true,
    body: { highWaterCursor },
  });
  return response.data;
}
