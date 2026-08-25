import { AppError } from "../../errors/AppError.js";
import {
  SECURITY_EVENTS,
  SECURITY_EVENT_OUTCOMES,
  SYSTEM_ROLES,
  USER_STATUSES,
} from "./auth.constants.js";
import { authorizationInclude, presentUser } from "./auth.presenter.js";
import { getDummyPasswordHash, hashPassword, verifyPassword } from "./auth.password.js";
import { createSession } from "./auth.session.js";
import { recordSecurityEvent } from "./auth.securityEvents.js";
import { hashAuditValue } from "./auth.tokens.js";

const maximumFailedLoginAttempts = 5;
const accountLockMinutes = 15;

function invalidCredentials() {
  return new AppError({
    statusCode: 401,
    code: "INVALID_CREDENTIALS",
    message: "The email or password is incorrect",
  });
}

function isUniqueConstraintError(error) {
  return error?.code === "P2002";
}

async function recordFailedLogin(database, user, email, requestId, shouldIncrement) {
  const newFailedAttempts = (user?.failedLoginAttempts ?? 0) + 1;
  const lockedUntil =
    shouldIncrement && newFailedAttempts >= maximumFailedLoginAttempts
      ? new Date(Date.now() + accountLockMinutes * 60 * 1000)
      : undefined;

  await database.$transaction(async (transaction) => {
    if (user && shouldIncrement) {
      await transaction.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newFailedAttempts,
          ...(lockedUntil ? { lockedUntil } : {}),
        },
      });
    }

    await recordSecurityEvent(transaction, {
      eventType: SECURITY_EVENTS.LOGIN_FAILED,
      outcome: SECURITY_EVENT_OUTCOMES.FAILURE,
      targetUserId: user?.id,
      requestId,
      metadata: { emailHash: hashAuditValue(email) },
    });
  });
}

export function createAuthService(database, config) {
  return {
    async register({ displayName, email, password, requestId, userAgent }) {
      const passwordHash = await hashPassword(password);

      try {
        const result = await database.$transaction(async (transaction) => {
          const user = await transaction.user.create({
            data: {
              displayName,
              email,
              passwordHash,
              roles: {
                create: {
                  role: { connect: { code: SYSTEM_ROLES.CUSTOMER } },
                },
              },
            },
            include: authorizationInclude,
          });
          const session = await createSession(transaction, {
            userId: user.id,
            config,
            userAgent,
          });

          await recordSecurityEvent(transaction, {
            eventType: SECURITY_EVENTS.USER_REGISTERED,
            actorUserId: user.id,
            targetUserId: user.id,
            requestId,
          });

          return { user, session };
        });

        return { user: presentUser(result.user), session: result.session };
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new AppError({
            statusCode: 409,
            code: "REGISTRATION_UNAVAILABLE",
            message: "An account could not be created with the provided details",
          });
        }
        throw error;
      }
    },

    async login({ email, password, requestId, userAgent }) {
      const user = await database.user.findUnique({
        where: { email },
        include: authorizationInclude,
      });
      const passwordHash = user?.passwordHash ?? (await getDummyPasswordHash());
      const passwordValid = await verifyPassword(passwordHash, password);
      const now = new Date();
      const locked = Boolean(user?.lockedUntil && user.lockedUntil > now);
      const active = user?.status === USER_STATUSES.ACTIVE;

      if (!user || !passwordValid || !active || locked) {
        await recordFailedLogin(
          database,
          user,
          email,
          requestId,
          Boolean(user && active && !locked && !passwordValid),
        );
        throw invalidCredentials();
      }

      const result = await database.$transaction(async (transaction) => {
        const refreshedUser = await transaction.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockedUntil: null },
          include: authorizationInclude,
        });
        const session = await createSession(transaction, {
          userId: user.id,
          config,
          userAgent,
        });

        await recordSecurityEvent(transaction, {
          eventType: SECURITY_EVENTS.LOGIN_SUCCEEDED,
          actorUserId: user.id,
          targetUserId: user.id,
          requestId,
        });

        return { user: refreshedUser, session };
      });

      return { user: presentUser(result.user), session: result.session };
    },

    async logout({ sessionId, userId, requestId }) {
      await database.$transaction(async (transaction) => {
        await transaction.authSession.updateMany({
          where: { id: sessionId, userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await recordSecurityEvent(transaction, {
          eventType: SECURITY_EVENTS.LOGOUT_SUCCEEDED,
          actorUserId: userId,
          targetUserId: userId,
          requestId,
        });
      });
    },
  };
}
