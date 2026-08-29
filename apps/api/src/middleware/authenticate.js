import { AppError } from "../errors/AppError.js";
import { USER_STATUSES } from "../modules/auth/auth.constants.js";
import { authorizationInclude } from "../modules/auth/auth.presenter.js";
import { digestToken } from "../modules/auth/auth.tokens.js";

function authenticationRequired() {
  return new AppError({
    statusCode: 401,
    code: "AUTHENTICATION_REQUIRED",
    message: "Authentication is required",
  });
}

function assignAuthentication(request, session) {
  request.auth = authenticationFromSession(session);
}

function authenticationFromSession(session) {
  const roleCodes = new Set(session.user.roles.map((assignment) => assignment.role.code));
  const permissions = new Set(
    session.user.roles.flatMap((assignment) =>
      assignment.role.rolePermissions.map((entry) => entry.permission.code),
    ),
  );

  return { session, user: session.user, roleCodes, permissions };
}

export async function resolveActiveSessionToken(database, sessionToken, now = new Date()) {
  if (!sessionToken) return null;
  const session = await database.authSession.findUnique({
    where: { tokenHash: digestToken(sessionToken) },
    include: { user: { include: authorizationInclude } },
  });
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    session.user.status !== USER_STATUSES.ACTIVE
  ) {
    return null;
  }
  return authenticationFromSession(session);
}

async function resolveAuthentication(database, config, request) {
  if (request.authenticationResolved) return request.auth ?? null;

  const sessionToken = request.cookies?.[config.auth.sessionCookieName];
  if (!sessionToken) {
    request.authenticationResolved = true;
    return null;
  }

  request.authenticationResolved = true;
  const authentication = await resolveActiveSessionToken(database, sessionToken);
  if (!authentication) return null;
  assignAuthentication(request, authentication.session);
  return request.auth;
}

async function touchSession(database, request) {
  const now = new Date();
  if (now.getTime() - request.auth.session.lastSeenAt.getTime() < 5 * 60 * 1000) return;

  await database.authSession.update({
    where: { id: request.auth.session.id },
    data: { lastSeenAt: now },
  });
  request.auth.session.lastSeenAt = now;
}

export function resolveRateLimitIdentity(database, config) {
  return async function resolveRequestRateLimitIdentity(request, _response, next) {
    try {
      await resolveAuthentication(database, config, request);
    } catch {
      request.authenticationResolved = false;
      delete request.auth;
    }
    return next();
  };
}

export function authenticate(database, config) {
  return async function authenticateRequest(request, response, next) {
    try {
      const authentication = await resolveAuthentication(database, config, request);
      if (!authentication) return next(authenticationRequired());

      response.setHeader("Cache-Control", "no-store");
      await touchSession(database, request);
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
