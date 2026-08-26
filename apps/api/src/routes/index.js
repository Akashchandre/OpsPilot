import { Router } from "express";
import { createAuthRouter } from "../modules/auth/auth.routes.js";
import { createAuthorizationRouter } from "../modules/authorization/authorization.routes.js";
import { createCatalogRouter } from "../modules/catalog/catalog.routes.js";
import { createHealthRouter } from "../modules/health/health.routes.js";
import { createInventoryRouter } from "../modules/inventory/inventory.routes.js";
import { createUsersRouter } from "../modules/users/users.routes.js";

export function createApiRouter(database, config) {
  const router = Router();

  router.use("/health", createHealthRouter(database));
  router.use("/auth", createAuthRouter(database, config));
  router.use("/users", createUsersRouter(database, config));
  router.use(createCatalogRouter(database, config));
  router.use("/inventory", createInventoryRouter(database, config));
  router.use(createAuthorizationRouter(database, config));

  return router;
}
