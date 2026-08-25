export function createUsersController(usersService) {
  return {
    async list(request, response, next) {
      try {
        const result = await usersService.list(request.validated.query);
        response.status(200).json({
          success: true,
          data: { users: result.users },
          meta: result.meta,
        });
      } catch (error) {
        next(error);
      }
    },

    async get(request, response, next) {
      try {
        const user = await usersService.get(request.validated.params.userId);
        response.status(200).json({ success: true, data: { user } });
      } catch (error) {
        next(error);
      }
    },

    async updateStatus(request, response, next) {
      try {
        const user = await usersService.updateStatus({
          actor: request.auth.user,
          userId: request.validated.params.userId,
          status: request.validated.body.status,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: { user } });
      } catch (error) {
        next(error);
      }
    },

    async assignRole(request, response, next) {
      try {
        const user = await usersService.assignRole({
          actor: request.auth.user,
          userId: request.validated.params.userId,
          roleCode: request.validated.body.roleCode,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: { user } });
      } catch (error) {
        next(error);
      }
    },

    async removeRole(request, response, next) {
      try {
        const user = await usersService.removeRole({
          actor: request.auth.user,
          userId: request.validated.params.userId,
          roleCode: request.validated.params.roleCode,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: { user } });
      } catch (error) {
        next(error);
      }
    },
  };
}
