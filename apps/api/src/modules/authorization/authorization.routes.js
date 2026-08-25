import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { PERMISSIONS } from "../auth/auth.constants.js";
import { createAuthorizationController } from "./authorization.controller.js";
import { createAuthorizationService } from "./authorization.service.js";

export function createAuthorizationRouter(database, config) {
  const router = Router();
  const controller = createAuthorizationController(createAuthorizationService(database));
  const requireAuthentication = authenticate(database, config);

  router.get(
    "/roles",
    requireAuthentication,
    requirePermission(PERMISSIONS.ROLES_READ),
    controller.listRoles,
  );
  router.get(
    "/permissions",
    requireAuthentication,
    requirePermission(PERMISSIONS.PERMISSIONS_READ),
    controller.listPermissions,
  );

  return router;
}
