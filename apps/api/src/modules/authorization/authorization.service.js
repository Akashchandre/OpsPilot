export function createAuthorizationService(database) {
  return {
    async listRoles() {
      const roles = await database.role.findMany({
        where: { isSystem: true },
        include: {
          rolePermissions: {
            include: { permission: true },
            orderBy: { permission: { code: "asc" } },
          },
        },
        orderBy: { code: "asc" },
      });

      return roles.map((role) => ({
        id: role.id,
        code: role.code,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissions: role.rolePermissions.map((entry) => entry.permission.code),
      }));
    },

    async listPermissions() {
      return database.permission.findMany({
        select: { id: true, code: true, description: true },
        orderBy: { code: "asc" },
      });
    },
  };
}
