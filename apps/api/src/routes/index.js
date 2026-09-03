import { Router } from "express";
import { createAuditRouter } from "../modules/audit/audit.routes.js";
import { createAiRouter } from "../modules/ai/ai.routes.js";
import { createAuthRouter } from "../modules/auth/auth.routes.js";
import { createAuthorizationRouter } from "../modules/authorization/authorization.routes.js";
import { createCatalogRouter } from "../modules/catalog/catalog.routes.js";
import { createCartRouter } from "../modules/cart/cart.routes.js";
import { createHealthRouter } from "../modules/health/health.routes.js";
import { createInventoryRouter } from "../modules/inventory/inventory.routes.js";
import { createJobsRouter } from "../modules/jobs/jobs.routes.js";
import { createNotificationsRouter } from "../modules/notifications/notifications.routes.js";
import { createOrdersRouter } from "../modules/orders/orders.routes.js";
import { createPaymentsRouter } from "../modules/payments/payments.routes.js";
import { createReportsRouter } from "../modules/reports/reports.routes.js";
import { createSupportRouter } from "../modules/support/support.routes.js";
import { createUsersRouter } from "../modules/users/users.routes.js";

export function createApiRouter(database, config, paymentProvider, aiClient) {
  const router = Router();

  router.use("/health", createHealthRouter(database, config, aiClient));
  router.use("/ai", createAiRouter(database, config, aiClient));
  router.use("/audit-events", createAuditRouter(database, config));
  router.use("/auth", createAuthRouter(database, config));
  router.use("/users", createUsersRouter(database, config));
  router.use("/cart", createCartRouter(database, config));
  router.use("/orders", createOrdersRouter(database, config, paymentProvider));
  router.use("/payments", createPaymentsRouter(database, config, paymentProvider));
  router.use("/reports", createReportsRouter(database, config));
  router.use("/support", createSupportRouter(database, config));
  router.use(createCatalogRouter(database, config));
  router.use("/inventory", createInventoryRouter(database, config));
  router.use("/jobs", createJobsRouter(database, config));
  router.use("/notifications", createNotificationsRouter(database, config));
  router.use(createAuthorizationRouter(database, config));

  return router;
}
