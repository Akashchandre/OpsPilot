export function createNotificationsController(service) {
  return {
    async list(request, response, next) {
      try {
        const result = await service.list({
          recipientId: request.auth.user.id,
          query: request.validated.query,
        });
        response.status(200).json({
          success: true,
          data: { notifications: result.notifications },
          meta: result.meta,
        });
      } catch (error) {
        next(error);
      }
    },

    async unreadCount(request, response, next) {
      try {
        const unreadCount = await service.unreadCount(request.auth.user.id);
        response.status(200).json({ success: true, data: { unreadCount } });
      } catch (error) {
        next(error);
      }
    },

    async markRead(request, response, next) {
      try {
        const notification = await service.markRead({
          recipientId: request.auth.user.id,
          notificationId: request.validated.params.notificationId,
        });
        response.status(200).json({ success: true, data: { notification } });
      } catch (error) {
        next(error);
      }
    },

    async markThrough(request, response, next) {
      try {
        const result = await service.markThrough({
          recipientId: request.auth.user.id,
          highWaterCursor: request.validated.body.highWaterCursor,
        });
        response.status(200).json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    },
  };
}
