import { AppError } from "../../errors/AppError.js";

export function commerceError(statusCode, code, message, details) {
  return new AppError({ statusCode, code, message, details });
}

export function commerceNotFound(resource) {
  const labels = {
    CART: "Cart",
    ORDER: "Order",
    PAYMENT: "Payment",
    REFUND: "Refund",
  };
  return commerceError(404, `${resource}_NOT_FOUND`, `${labels[resource]} was not found`);
}

export function commerceVersionConflict() {
  return commerceError(
    409,
    "RESOURCE_VERSION_CONFLICT",
    "This record changed after it was loaded. Refresh it and try again.",
  );
}

export function idempotencyConflict() {
  return commerceError(
    409,
    "IDEMPOTENCY_KEY_REUSED",
    "This idempotency key was already used with different input",
  );
}

export function isPrismaUniqueViolation(error) {
  return error?.code === "P2002";
}

export function isPrismaWriteConflict(error) {
  return error?.code === "P2034";
}
