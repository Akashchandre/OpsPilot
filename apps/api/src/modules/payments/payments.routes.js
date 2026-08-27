import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { requireCsrf } from "../../middleware/requireCsrf.js";
import { requireIdempotencyKey } from "../../middleware/idempotencyKey.js";
import { validate } from "../../middleware/validate.js";
import { PERMISSIONS } from "../auth/auth.constants.js";
import {
  confirmPaymentSchema,
  emptyBodySchema,
  paymentIdParamsSchema,
} from "../commerce/commerce.schemas.js";
import { createPaymentsController } from "./payments.controller.js";
import { createPaymentsService } from "./payments.service.js";

export function createPaymentsRouter(database, config, paymentProvider) {
  const router = Router();
  const controller = createPaymentsController(
    createPaymentsService(database, config, paymentProvider),
  );
  const verifyCsrf = requireCsrf(config);

  router.use(authenticate(database, config));
  router.post("/confirm", verifyCsrf, validate({ body: confirmPaymentSchema }), controller.confirm);
  router.get("/:paymentId", validate({ params: paymentIdParamsSchema }), controller.get);
  router.post(
    "/:paymentId/refunds",
    requirePermission(PERMISSIONS.PAYMENTS_REFUND),
    verifyCsrf,
    requireIdempotencyKey,
    validate({ params: paymentIdParamsSchema, body: emptyBodySchema }),
    controller.refund,
  );
  router.post(
    "/:paymentId/reconcile",
    requirePermission(PERMISSIONS.PAYMENTS_RECONCILE),
    verifyCsrf,
    validate({ params: paymentIdParamsSchema, body: emptyBodySchema }),
    controller.reconcile,
  );

  return router;
}
