import { AppError } from "../errors/AppError.js";
import { tokenMatchesDigest } from "../modules/auth/auth.tokens.js";

export function requireCsrf(config) {
  return function verifyCsrf(request, _response, next) {
    const headerToken = request.get("X-CSRF-Token");
    const cookieToken = request.cookies?.[config.auth.csrfCookieName];
    const expectedDigest = request.auth?.session.csrfTokenHash;

    if (
      headerToken &&
      cookieToken &&
      tokenMatchesDigest(headerToken, expectedDigest) &&
      tokenMatchesDigest(cookieToken, expectedDigest)
    ) {
      return next();
    }

    return next(
      new AppError({
        statusCode: 403,
        code: "CSRF_INVALID",
        message: "The CSRF token is missing or invalid",
      }),
    );
  };
}
