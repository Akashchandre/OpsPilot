import { AppError } from "../../errors/AppError.js";

export function catalogError(statusCode, code, message, details) {
  return new AppError({ statusCode, code, message, details });
}

export function resourceNotFound(resource) {
  const labels = { PRODUCT: "Product", CATEGORY: "Category", INVENTORY: "Inventory" };
  return catalogError(404, `${resource}_NOT_FOUND`, `${labels[resource]} was not found`);
}

export function versionConflict() {
  return catalogError(
    409,
    "RESOURCE_VERSION_CONFLICT",
    "This record changed after it was loaded. Refresh it and try again.",
  );
}

export function isPrismaUniqueViolation(error) {
  return error?.code === "P2002";
}

export function isPrismaWriteConflict(error) {
  return error?.code === "P2034";
}
