export function sessionCookieOptions(config, expiresAt) {
  return {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: "lax",
    path: "/api/v1",
    expires: expiresAt,
  };
}

export function csrfCookieOptions(config, expiresAt) {
  return {
    httpOnly: false,
    secure: config.auth.cookieSecure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  };
}

export function clearAuthenticationCookies(response, config) {
  response.clearCookie(config.auth.sessionCookieName, {
    ...sessionCookieOptions(config),
    expires: undefined,
  });
  response.clearCookie(config.auth.csrfCookieName, {
    ...csrfCookieOptions(config),
    expires: undefined,
  });
}

export function setAuthenticationCookies(response, config, session) {
  response.cookie(
    config.auth.sessionCookieName,
    session.sessionToken,
    sessionCookieOptions(config, session.expiresAt),
  );
  response.cookie(
    config.auth.csrfCookieName,
    session.csrfToken,
    csrfCookieOptions(config, session.expiresAt),
  );
}
