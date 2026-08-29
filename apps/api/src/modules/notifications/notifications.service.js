import { AppError } from "../../errors/AppError.js";
import { presentNotification } from "./notifications.presenter.js";

function notificationNotFound() {
  return new AppError({
    statusCode: 404,
    code: "NOTIFICATION_NOT_FOUND",
    message: "Notification was not found",
  });
}

export function createNotificationsService(database, dependencies = {}) {
  const now = dependencies.now ?? (() => new Date());
  return Object.freeze({
    async list({ recipientId, query }) {
      const fetched = await database.notification.findMany({
        where: {
          recipientId,
          ...(query.afterProvided ? { sequence: { gt: query.after } } : {}),
        },
        orderBy: { sequence: query.afterProvided ? "asc" : "desc" },
        take: query.limit + 1,
      });
      const hasMore = query.afterProvided && fetched.length > query.limit;
      const selected = fetched.slice(0, query.limit);
      const notifications = query.afterProvided ? selected : selected.reverse();
      const nextCursor = notifications.at(-1)?.sequence ?? query.after;
      return {
        notifications: notifications.map(presentNotification),
        meta: {
          nextCursor: nextCursor.toString(),
          hasMore,
          truncatedBefore: !query.afterProvided && fetched.length > query.limit,
          limit: query.limit,
        },
      };
    },

    async unreadCount(recipientId) {
      return database.notification.count({ where: { recipientId, readAt: null } });
    },

    async markRead({ recipientId, notificationId }) {
      const existing = await database.notification.findFirst({
        where: { id: notificationId, recipientId },
      });
      if (!existing) throw notificationNotFound();
      if (!existing.readAt) {
        await database.notification.updateMany({
          where: { id: notificationId, recipientId, readAt: null },
          data: { readAt: now() },
        });
      }
      const notification = await database.notification.findFirst({
        where: { id: notificationId, recipientId },
      });
      return presentNotification(notification);
    },

    async markThrough({ recipientId, highWaterCursor }) {
      const result = await database.notification.updateMany({
        where: { recipientId, sequence: { lte: highWaterCursor }, readAt: null },
        data: { readAt: now() },
      });
      return { updatedCount: result.count, highWaterCursor: highWaterCursor.toString() };
    },
  });
}
