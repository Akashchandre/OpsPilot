import { z } from "zod";
import { AppError } from "../errors/AppError.js";

const idempotencyKeySchema = z.uuid();

export function requireIdempotencyKey(request, _response, next) {
  const result = idempotencyKeySchema.safeParse(request.get("Idempotency-Key"));
  if (!result.success) {
    return next(
      new AppError({
        statusCode: 422,
        code: "IDEMPOTENCY_KEY_INVALID",
        message: "A valid Idempotency-Key header is required",
      }),
    );
  }

  request.idempotencyKey = result.data;
  return next();
}
