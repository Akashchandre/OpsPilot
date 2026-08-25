import { AppError } from "../../errors/AppError.js";
import { SECURITY_EVENTS, SYSTEM_ROLES, USER_STATUSES } from "../auth/auth.constants.js";
import { authorizationInclude, presentUser } from "../auth/auth.presenter.js";
import { recordSecurityEvent } from "../auth/auth.securityEvents.js";

function notFound(resource) {
  return new AppError({
    statusCode: 404,
    code: `${resource}_NOT_FOUND`,
    message: `${resource === "USER" ? "User" : "Role"} was not found`,
  });
}

function forbidden() {
  return new AppError({
    statusCode: 403,
    code: "FORBIDDEN",
    message: "You do not have permission to perform this action",
  });
}

function lastOwnerRequired() {
  return new AppError({
    statusCode: 409,
    code: "LAST_OWNER_REQUIRED",
    message: "The last active owner cannot be disabled or lose the owner role",
  });
}

function roleCodes(user) {
  return new Set(user.roles.map((assignment) => assignment.role.code));
}

function assertActorCanModifyTarget(actorRoles, targetRoles, roleCode) {
  const actorIsOwner = actorRoles.has(SYSTEM_ROLES.OWNER);
  const targetIsOwner = targetRoles.has(SYSTEM_ROLES.OWNER);

  if ((!actorIsOwner && targetIsOwner) || (roleCode === SYSTEM_ROLES.OWNER && !actorIsOwner)) {
    throw forbidden();
  }
}

async function countActiveOwners(transaction) {
  return transaction.user.count({
    where: {
      status: USER_STATUSES.ACTIVE,
      roles: { some: { role: { code: SYSTEM_ROLES.OWNER } } },
    },
  });
}

export function createUsersService(database) {
  return {
    async list({ page, limit }) {
      const where = {};
      const [users, total] = await database.$transaction([
        database.user.findMany({
          where,
          include: authorizationInclude,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        database.user.count({ where }),
      ]);

      return {
        users: users.map(presentUser),
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    },

    async get(userId) {
      const user = await database.user.findUnique({
        where: { id: userId },
        include: authorizationInclude,
      });
      if (!user) throw notFound("USER");
      return presentUser(user);
    },

    async updateStatus({ actor, userId, status, requestId }) {
      return database.$transaction(
        async (transaction) => {
          const target = await transaction.user.findUnique({
            where: { id: userId },
            include: authorizationInclude,
          });
          if (!target) throw notFound("USER");

          const actorRoles = roleCodes(actor);
          const targetRoles = roleCodes(target);
          assertActorCanModifyTarget(actorRoles, targetRoles);

          if (
            status === USER_STATUSES.DISABLED &&
            target.status === USER_STATUSES.ACTIVE &&
            targetRoles.has(SYSTEM_ROLES.OWNER) &&
            (await countActiveOwners(transaction)) <= 1
          ) {
            throw lastOwnerRequired();
          }

          if (target.status === status) return presentUser(target);

          const updated = await transaction.user.update({
            where: { id: userId },
            data: { status },
            include: authorizationInclude,
          });

          if (status === USER_STATUSES.DISABLED) {
            await transaction.authSession.updateMany({
              where: { userId, revokedAt: null },
              data: { revokedAt: new Date() },
            });
          }

          await recordSecurityEvent(transaction, {
            eventType: SECURITY_EVENTS.USER_STATUS_CHANGED,
            actorUserId: actor.id,
            targetUserId: userId,
            requestId,
            metadata: { from: target.status, to: status },
          });

          return presentUser(updated);
        },
        { isolationLevel: "Serializable" },
      );
    },

    async assignRole({ actor, userId, roleCode, requestId }) {
      return database.$transaction(
        async (transaction) => {
          const [target, role] = await Promise.all([
            transaction.user.findUnique({
              where: { id: userId },
              include: authorizationInclude,
            }),
            transaction.role.findUnique({ where: { code: roleCode } }),
          ]);
          if (!target) throw notFound("USER");
          if (!role) throw notFound("ROLE");

          assertActorCanModifyTarget(roleCodes(actor), roleCodes(target), roleCode);

          const existingAssignment = await transaction.userRole.findUnique({
            where: { userId_roleId: { userId, roleId: role.id } },
          });
          if (!existingAssignment) {
            await transaction.userRole.create({
              data: { userId, roleId: role.id, assignedById: actor.id },
            });
            await recordSecurityEvent(transaction, {
              eventType: SECURITY_EVENTS.ROLE_ASSIGNED,
              actorUserId: actor.id,
              targetUserId: userId,
              requestId,
              metadata: { roleCode },
            });
          }

          const updated = await transaction.user.findUnique({
            where: { id: userId },
            include: authorizationInclude,
          });
          return presentUser(updated);
        },
        { isolationLevel: "Serializable" },
      );
    },

    async removeRole({ actor, userId, roleCode, requestId }) {
      return database.$transaction(
        async (transaction) => {
          const [target, role] = await Promise.all([
            transaction.user.findUnique({
              where: { id: userId },
              include: authorizationInclude,
            }),
            transaction.role.findUnique({ where: { code: roleCode } }),
          ]);
          if (!target) throw notFound("USER");
          if (!role) throw notFound("ROLE");

          const targetRoles = roleCodes(target);
          assertActorCanModifyTarget(roleCodes(actor), targetRoles, roleCode);

          if (
            roleCode === SYSTEM_ROLES.OWNER &&
            target.status === USER_STATUSES.ACTIVE &&
            targetRoles.has(SYSTEM_ROLES.OWNER) &&
            (await countActiveOwners(transaction)) <= 1
          ) {
            throw lastOwnerRequired();
          }

          const removed = await transaction.userRole.deleteMany({
            where: { userId, roleId: role.id },
          });

          if (removed.count > 0) {
            await recordSecurityEvent(transaction, {
              eventType: SECURITY_EVENTS.ROLE_REMOVED,
              actorUserId: actor.id,
              targetUserId: userId,
              requestId,
              metadata: { roleCode },
            });
          }

          const updated = await transaction.user.findUnique({
            where: { id: userId },
            include: authorizationInclude,
          });
          return presentUser(updated);
        },
        { isolationLevel: "Serializable" },
      );
    },
  };
}
