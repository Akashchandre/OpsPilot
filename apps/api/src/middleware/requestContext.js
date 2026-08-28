import { randomUUID } from "node:crypto";

function normalizedRoute(request) {
  const route = request.route?.path;
  if (typeof route === "string") return route;
  if (Array.isArray(route) && route.every((entry) => typeof entry === "string")) {
    return route.join("|");
  }
  return "UNMATCHED";
}

export function createRequestContext(logger) {
  return function requestContext(request, response, next) {
    request.id = randomUUID();
    response.setHeader("X-Request-Id", request.id);

    const startedAt = process.hrtime.bigint();
    let recorded = false;
    const recordCompletion = () => {
      if (recorded) return;
      recorded = true;

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const level = request.logError ? "error" : response.statusCode >= 500 ? "warn" : "info";
      logger.log(level, "request.completed", {
        requestId: request.id,
        method: request.method,
        route: normalizedRoute(request),
        statusCode: response.statusCode,
        durationMs: Number(durationMs.toFixed(3)),
        ...request.logError,
      });
    };

    response.once("finish", recordCompletion);
    response.once("close", recordCompletion);
    next();
  };
}
