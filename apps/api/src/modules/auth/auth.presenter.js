function collectRoles(user) {
  return [...new Set((user.roles ?? []).map((assignment) => assignment.role.code))].sort();
}

function collectPermissions(user) {
  return [
    ...new Set(
      (user.roles ?? []).flatMap((assignment) =>
        (assignment.role.rolePermissions ?? []).map((entry) => entry.permission.code),
      ),
    ),
  ].sort();
}

export function presentUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    roles: collectRoles(user),
    permissions: collectPermissions(user),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export const authorizationInclude = Object.freeze({
  roles: {
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      },
    },
  },
});
