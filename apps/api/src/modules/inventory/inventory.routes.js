import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { requireCsrf } from "../../middleware/requireCsrf.js";
import { validate } from "../../middleware/validate.js";
import { PERMISSIONS } from "../auth/auth.constants.js";
import {
  adjustInventorySchema,
  adjustmentListQuerySchema,
  inventoryListQuerySchema,
  productIdParamsSchema,
  updateInventoryThresholdSchema,
} from "../catalog/catalog.schemas.js";
import { createInventoryController } from "./inventory.controller.js";
import { createInventoryService } from "./inventory.service.js";

export function createInventoryRouter(database, config) {
  const router = Router();
  const controller = createInventoryController(createInventoryService(database));
  const verifyCsrf = requireCsrf(config);

  router.use(authenticate(database, config));

  router.get(
    "/",
    requirePermission(PERMISSIONS.INVENTORY_READ),
    validate({ query: inventoryListQuerySchema }),
    controller.list,
  );
  router.get(
    "/:productId",
    requirePermission(PERMISSIONS.INVENTORY_READ),
    validate({ params: productIdParamsSchema }),
    controller.get,
  );
  router.get(
    "/:productId/adjustments",
    requirePermission(PERMISSIONS.INVENTORY_READ),
    validate({ params: productIdParamsSchema, query: adjustmentListQuerySchema }),
    controller.listAdjustments,
  );
  router.post(
    "/:productId/adjustments",
    requirePermission(PERMISSIONS.INVENTORY_ADJUST),
    verifyCsrf,
    validate({ params: productIdParamsSchema, body: adjustInventorySchema }),
    controller.adjust,
  );
  router.patch(
    "/:productId",
    requirePermission(PERMISSIONS.INVENTORY_ADJUST),
    verifyCsrf,
    validate({ params: productIdParamsSchema, body: updateInventoryThresholdSchema }),
    controller.updateThreshold,
  );

  return router;
}
