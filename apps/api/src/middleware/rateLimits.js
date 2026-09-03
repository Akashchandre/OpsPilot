import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { AppError } from "../errors/AppError.js";

function sourceKey(request) {
  return ipKeyGenerator(request.ip ?? request.socket?.remoteAddress ?? "unknown");
}

function scopedKey(request, authenticated) {
  const source = sourceKey(request);
  if (!authenticated) return `source:${source}`;

  const userId = request.auth?.user?.id;
  return userId ? `user:${userId}:source:${source}` : `anonymous:source:${source}`;
}

function createLimiter({ windowMinutes, maximum, authenticated = true, identifier }) {
  const windowMs = windowMinutes * 60 * 1000;

  return rateLimit({
    windowMs,
    limit: maximum,
    identifier,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator(request) {
      return scopedKey(request, authenticated);
    },
    validate: {
      keyGeneratorIpFallback: false,
      trustProxy: false,
      xForwardedForHeader: false,
    },
    handler(request, response, next) {
      if (!response.getHeader("Retry-After")) {
        response.setHeader("Retry-After", Math.max(1, Math.ceil(windowMs / 1000)));
      }
      next(
        new AppError({
          statusCode: 429,
          code: "RATE_LIMITED",
          message: "Too many requests; try again later",
        }),
      );
    },
  });
}

export function createApiRateLimiter(config) {
  return createLimiter({
    ...config.rateLimit.api,
    authenticated: true,
    identifier: "api",
  });
}

export function createSupportWriteRateLimiter(config) {
  return createLimiter({
    ...config.rateLimit.support,
    authenticated: true,
    identifier: "support-write",
  });
}

export function createReportRateLimiter(config) {
  return createLimiter({
    ...config.rateLimit.reports,
    authenticated: true,
    identifier: "reports",
  });
}

export function createAiCustomerRateLimiter(config) {
  return createLimiter({
    windowMinutes: config.ai?.customer?.burstWindowMinutes ?? 15,
    maximum: config.ai?.customer?.burstMaximum ?? 5,
    authenticated: true,
    identifier: "ai-customer",
  });
}

export function createAiOwnerRateLimiter(config) {
  return createLimiter({
    windowMinutes: config.ai?.owner?.burstWindowMinutes ?? 15,
    maximum: config.ai?.owner?.burstMaximum ?? 10,
    authenticated: true,
    identifier: "ai-owner",
  });
}

export function createWebhookRateLimiter(config) {
  return createLimiter({
    ...config.rateLimit.webhook,
    authenticated: false,
    identifier: "razorpay-webhook",
  });
}
