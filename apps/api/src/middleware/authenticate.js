import { AppError } from "../errors/AppError.js";
import { authorizationInclude } from "../modules/auth/auth.presenter.js";
import { digestToken } from "../modules/auth/auth.tokens.js";
import { USER_STATUSES } from "../modules/auth/auth.constants.js";

function authenticationRequired() {
  return new AppError({
    statusCode: 401,
    code: "AUTHENTICATION_REQUIRED",
    message: "Authentication is required",
  });
}

export function authenticate(database, config) {
  return async function authenticateRequest(request, response, next) {
    try {
      const sessionToken = request.cookies?.[config.auth.sessionCookieName];
      if (!sessionToken) return next(authenticationRequired());

      const session = await database.authSession.findUnique({
        where: { tokenHash: digestToken(sessionToken) },
        include: { user: { include: authorizationInclude } },
      });

      const now = new Date();
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt <= now ||
        session.user.status !== USER_STATUSES.ACTIVE
      ) {
        return next(authenticationRequired());
      }

      const roleCodes = new Set(session.user.roles.map((assignment) => assignment.role.code));
      const permissions = new Set(
        session.user.roles.flatMap((assignment) =>
          assignment.role.rolePermissions.map((entry) => entry.permission.code),
        ),
      );

      request.auth = { session, user: session.user, roleCodes, permissions };
      response.setHeader("Cache-Control", "no-store");

      if (now.getTime() - session.lastSeenAt.getTime() >= 5 * 60 * 1000) {
        await database.authSession.update({
          where: { id: session.id },
          data: { lastSeenAt: now },
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
