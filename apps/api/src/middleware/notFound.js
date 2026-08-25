import { AppError } from "../errors/AppError.js";

export function notFound(request, _response, next) {
  next(
    new AppError({
      statusCode: 404,
      code: "ROUTE_NOT_FOUND",
      message: `No route exists for ${request.method} ${request.originalUrl}`,
    }),
  );
}
