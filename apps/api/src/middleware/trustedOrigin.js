import { AppError } from "../errors/AppError.js";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function requireTrustedOrigin(trustedOrigin) {
  return function verifyTrustedOrigin(request, _response, next) {
    if (safeMethods.has(request.method) || request.get("Origin") === trustedOrigin) {
      return next();
    }

    return next(
      new AppError({
        statusCode: 403,
        code: "ORIGIN_NOT_ALLOWED",
        message: "The request origin is not allowed",
      }),
    );
  };
}
