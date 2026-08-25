import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { requireCsrf } from "../../middleware/requireCsrf.js";
import { validate } from "../../middleware/validate.js";
import { PERMISSIONS } from "../auth/auth.constants.js";
import {
  assignRoleSchema,
  updateUserStatusSchema,
  userIdParamsSchema,
  userListQuerySchema,
  userRoleParamsSchema,
} from "../auth/auth.schemas.js";
import { createUsersController } from "./users.controller.js";
import { createUsersService } from "./users.service.js";

export function createUsersRouter(database, config) {
  const router = Router();
  const controller = createUsersController(createUsersService(database));
  const verifyCsrf = requireCsrf(config);

  router.use(authenticate(database, config));

  router.get(
    "/",
    requirePermission(PERMISSIONS.USERS_READ),
    validate({ query: userListQuerySchema }),
    controller.list,
  );
  router.get(
    "/:userId",
    requirePermission(PERMISSIONS.USERS_READ),
    validate({ params: userIdParamsSchema }),
    controller.get,
  );
  router.patch(
    "/:userId/status",
    requirePermission(PERMISSIONS.USERS_STATUS_MANAGE),
    verifyCsrf,
    validate({ params: userIdParamsSchema, body: updateUserStatusSchema }),
    controller.updateStatus,
  );
  router.post(
    "/:userId/roles",
    requirePermission(PERMISSIONS.USERS_ROLES_MANAGE),
    verifyCsrf,
    validate({ params: userIdParamsSchema, body: assignRoleSchema }),
    controller.assignRole,
  );
  router.delete(
    "/:userId/roles/:roleCode",
    requirePermission(PERMISSIONS.USERS_ROLES_MANAGE),
    verifyCsrf,
    validate({ params: userRoleParamsSchema }),
    controller.removeRole,
  );

  return router;
}
