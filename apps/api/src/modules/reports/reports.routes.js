import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { createReportRateLimiter } from "../../middleware/rateLimits.js";
import { validate } from "../../middleware/validate.js";
import { PERMISSIONS } from "../auth/auth.constants.js";
import { createReportsController } from "./reports.controller.js";
import { overviewQuerySchema } from "./reports.schemas.js";
import { createReportsService } from "./reports.service.js";

export function createReportsRouter(database, config) {
  const router = Router();
  const controller = createReportsController(createReportsService(database, config));
  const limitReports = createReportRateLimiter(config);

  router.use(authenticate(database, config));
  router.get(
    "/overview",
    requirePermission(PERMISSIONS.REPORTS_READ),
    limitReports,
    validate({ query: overviewQuerySchema }),
    controller.overview,
  );

  return router;
}
