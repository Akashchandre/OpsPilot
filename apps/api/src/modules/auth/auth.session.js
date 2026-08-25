import { createOpaqueToken, digestToken, hashAuditValue } from "./auth.tokens.js";

export async function createSession(database, { userId, config, userAgent }) {
  const sessionToken = createOpaqueToken();
  const csrfToken = createOpaqueToken();
  const expiresAt = new Date(Date.now() + config.auth.sessionTtlHours * 60 * 60 * 1000);

  const session = await database.authSession.create({
    data: {
      userId,
      tokenHash: digestToken(sessionToken),
      csrfTokenHash: digestToken(csrfToken),
      expiresAt,
      userAgentHash: userAgent ? hashAuditValue(userAgent) : null,
    },
  });

  return { ...session, sessionToken, csrfToken };
}
