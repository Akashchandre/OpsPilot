import { AppError } from "../errors/AppError.js";

export function rejectUrlEncoded(request, _response, next) {
  const contentType = request.get("Content-Type") ?? "";
  if (!/^application\/x-www-form-urlencoded(?:\s*;|\s*$)/i.test(contentType)) return next();

  return next(
    new AppError({
      statusCode: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "URL-encoded request bodies are not supported",
    }),
  );
}
