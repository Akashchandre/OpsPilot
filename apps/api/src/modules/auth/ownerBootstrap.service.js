import { AppError } from "../../errors/AppError.js";
import { SECURITY_EVENTS, SYSTEM_ROLES } from "./auth.constants.js";
import { authorizationInclude, presentUser } from "./auth.presenter.js";
import { hashPassword } from "./auth.password.js";
import { recordSecurityEvent } from "./auth.securityEvents.js";

export async function bootstrapOwner(database, { displayName, email, password }) {
  const passwordHash = await hashPassword(password);

  const user = await database.$transaction(
    async (transaction) => {
      const ownerRole = await transaction.role.findUnique({
        where: { code: SYSTEM_ROLES.OWNER },
      });
      if (!ownerRole) {
        throw new AppError({
          statusCode: 500,
          code: "AUTHORIZATION_DATA_MISSING",
          message: "Apply Phase 2 migrations before bootstrapping an owner",
        });
      }

      const ownerCount = await transaction.userRole.count({
        where: { roleId: ownerRole.id },
      });
      if (ownerCount > 0) {
        throw new AppError({
          statusCode: 409,
          code: "OWNER_ALREADY_EXISTS",
          message: "An owner account already exists",
        });
      }

      const created = await transaction.user.create({
        data: {
          displayName,
          email,
          passwordHash,
          roles: { create: { roleId: ownerRole.id } },
        },
        include: authorizationInclude,
      });
      await recordSecurityEvent(transaction, {
        eventType: SECURITY_EVENTS.OWNER_BOOTSTRAPPED,
        actorUserId: created.id,
        targetUserId: created.id,
      });
      return created;
    },
    { isolationLevel: "Serializable" },
  );

  return presentUser(user);
}
