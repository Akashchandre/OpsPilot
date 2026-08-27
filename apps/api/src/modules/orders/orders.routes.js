import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { requireCsrf } from "../../middleware/requireCsrf.js";
import { requireIdempotencyKey } from "../../middleware/idempotencyKey.js";
import { validate } from "../../middleware/validate.js";
import { PERMISSIONS } from "../auth/auth.constants.js";
import {
  cancelOrderSchema,
  createOrderSchema,
  emptyBodySchema,
  orderDetailQuerySchema,
  orderIdParamsSchema,
  orderListQuerySchema,
  updateOrderStatusSchema,
} from "../commerce/commerce.schemas.js";
import { createOrdersController } from "./orders.controller.js";
import { createOrdersService } from "./orders.service.js";

function requireManagementPermission(request, response, next) {
  if (request.validated.query.view !== "management") return next();
  return requirePermission(PERMISSIONS.ORDERS_READ)(request, response, next);
}

export function createOrdersRouter(database, config, paymentProvider) {
  const router = Router();
  const controller = createOrdersController(createOrdersService(database, config, paymentProvider));
  const requireAuthentication = authenticate(database, config);
  const verifyCsrf = requireCsrf(config);

  router.use(requireAuthentication);
  router.get(
    "/",
    validate({ query: orderListQuerySchema }),
    requireManagementPermission,
    controller.list,
  );
  router.post(
    "/",
    verifyCsrf,
    requireIdempotencyKey,
    validate({ body: createOrderSchema }),
    controller.create,
  );
  router.get(
    "/:orderId",
    validate({ params: orderIdParamsSchema, query: orderDetailQuerySchema }),
    requireManagementPermission,
    controller.get,
  );
  router.post(
    "/:orderId/payment-session",
    verifyCsrf,
    validate({ params: orderIdParamsSchema, body: emptyBodySchema }),
    controller.paymentSession,
  );
  router.post(
    "/:orderId/cancellation",
    verifyCsrf,
    validate({ params: orderIdParamsSchema, body: cancelOrderSchema }),
    controller.cancelOwn,
  );
  router.patch(
    "/:orderId/status",
    requirePermission(PERMISSIONS.ORDERS_MANAGE),
    verifyCsrf,
    validate({ params: orderIdParamsSchema, body: updateOrderStatusSchema }),
    controller.updateStatus,
  );

  return router;
}
