import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireCsrf } from "../../middleware/requireCsrf.js";
import { validate } from "../../middleware/validate.js";
import {
  cartVersionSchema,
  productIdParamsSchema,
  setCartItemSchema,
} from "../commerce/commerce.schemas.js";
import { createCartController } from "./cart.controller.js";
import { createCartService } from "./cart.service.js";

export function createCartRouter(database, config) {
  const router = Router();
  const controller = createCartController(createCartService(database, config));
  const requireAuthentication = authenticate(database, config);
  const verifyCsrf = requireCsrf(config);

  router.use(requireAuthentication);
  router.get("/", controller.get);
  router.put(
    "/items/:productId",
    verifyCsrf,
    validate({ params: productIdParamsSchema, body: setCartItemSchema }),
    controller.setItem,
  );
  router.delete(
    "/items/:productId",
    verifyCsrf,
    validate({ params: productIdParamsSchema, body: cartVersionSchema }),
    controller.removeItem,
  );
  router.delete("/items", verifyCsrf, validate({ body: cartVersionSchema }), controller.clear);

  return router;
}
