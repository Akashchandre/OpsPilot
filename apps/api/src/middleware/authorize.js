import { AppError } from "../errors/AppError.js";

export function requirePermission(permission) {
  return function authorizeRequest(request, _response, next) {
    if (request.auth?.permissions.has(permission)) {
      return next();
    }

    return next(
      new AppError({
        statusCode: 403,
        code: "FORBIDDEN",
        message: "You do not have permission to perform this action",
      }),
    );
  };
}
