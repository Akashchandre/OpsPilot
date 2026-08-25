export function createAuthorizationController(service) {
  return {
    async listRoles(_request, response, next) {
      try {
        const roles = await service.listRoles();
        response.status(200).json({ success: true, data: { roles } });
      } catch (error) {
        next(error);
      }
    },

    async listPermissions(_request, response, next) {
      try {
        const permissions = await service.listPermissions();
        response.status(200).json({ success: true, data: { permissions } });
      } catch (error) {
        next(error);
      }
    },
  };
}
