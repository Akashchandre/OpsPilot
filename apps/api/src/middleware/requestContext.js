import { randomUUID } from "node:crypto";

export function requestContext(request, response, next) {
  request.id = randomUUID();
  response.setHeader("X-Request-Id", request.id);
  next();
}
