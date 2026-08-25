import { rateLimit } from "express-rate-limit";
import { AppError } from "../errors/AppError.js";

export function createAuthRateLimiter(config) {
  return rateLimit({
    windowMs: config.auth.loginRateLimitWindowMinutes * 60 * 1000,
    limit: config.auth.loginRateLimitMax,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler(request, _response, next) {
      next(
        new AppError({
          statusCode: 429,
          code: "AUTH_RATE_LIMITED",
          message: "Too many authentication attempts; try again later",
          details: [{ requestId: request.id }],
        }),
      );
    },
  });
}
