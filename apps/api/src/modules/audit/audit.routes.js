import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { PERMISSIONS } from "../auth/auth.constants.js";
import { createAuditController } from "./audit.controller.js";
import { auditListQuerySchema } from "./audit.schemas.js";
import { createAuditService } from "./audit.service.js";

export function createAuditRouter(database, config) {
  const router = Router();
  const controller = createAuditController(createAuditService(database, config));

  router.use(authenticate(database, config));
  router.get(
    "/",
    requirePermission(PERMISSIONS.AUDIT_READ),
    validate({ query: auditListQuerySchema }),
    controller.list,
  );

  return router;
}
