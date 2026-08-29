import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { requireCsrf } from "../../middleware/requireCsrf.js";
import { validate } from "../../middleware/validate.js";
import { PERMISSIONS } from "../auth/auth.constants.js";
import { createJobsController } from "./jobs.controller.js";
import { jobIdParamsSchema, jobListQuerySchema, replayJobBodySchema } from "./jobs.schemas.js";
import { createJobsService } from "./jobs.service.js";

export function createJobsRouter(database, config) {
  const router = Router();
  const controller = createJobsController(createJobsService(database, config));
  const verifyCsrf = requireCsrf(config);
  router.use(authenticate(database, config));
  router.get(
    "/",
    requirePermission(PERMISSIONS.JOBS_READ),
    validate({ query: jobListQuerySchema }),
    controller.list,
  );
  router.get("/health", requirePermission(PERMISSIONS.JOBS_READ), controller.health);
  router.get(
    "/:jobId",
    requirePermission(PERMISSIONS.JOBS_READ),
    validate({ params: jobIdParamsSchema }),
    controller.detail,
  );
  router.post(
    "/:jobId/replay",
    requirePermission(PERMISSIONS.JOBS_REPLAY),
    verifyCsrf,
    validate({ params: jobIdParamsSchema, body: replayJobBodySchema }),
    controller.replay,
  );
  return router;
}
