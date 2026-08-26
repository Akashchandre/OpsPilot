import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { requireCsrf } from "../../middleware/requireCsrf.js";
import { validate } from "../../middleware/validate.js";
import { PERMISSIONS } from "../auth/auth.constants.js";
import { CATALOG_VIEWS } from "./catalog.constants.js";
import { createCatalogController } from "./catalog.controller.js";
import {
  categoryIdParamsSchema,
  categoryListQuerySchema,
  createCategorySchema,
  createProductSchema,
  productIdParamsSchema,
  productListQuerySchema,
  updateCategorySchema,
  updateCategoryStatusSchema,
  updateProductSchema,
  updateProductStatusSchema,
} from "./catalog.schemas.js";
import { createCatalogService } from "./catalog.service.js";

function protectManagementView(database, config, permission) {
  const authenticateRequest = authenticate(database, config);
  const authorizeRequest = requirePermission(permission);

  return function protectConditionalView(request, response, next) {
    if (request.validated.query.view !== CATALOG_VIEWS.MANAGEMENT) return next();
    return authenticateRequest(request, response, (authenticationError) => {
      if (authenticationError) return next(authenticationError);
      return authorizeRequest(request, response, next);
    });
  };
}

export function createCatalogRouter(database, config) {
  const router = Router();
  const controller = createCatalogController(createCatalogService(database, config));
  const authenticateRequest = authenticate(database, config);
  const verifyCsrf = requireCsrf(config);

  router.get(
    "/products",
    validate({ query: productListQuerySchema }),
    protectManagementView(database, config, PERMISSIONS.PRODUCTS_MANAGE),
    controller.listProducts,
  );
  router.get(
    "/products/:productId",
    validate({ params: productIdParamsSchema }),
    controller.getProduct,
  );
  router.post(
    "/products",
    authenticateRequest,
    requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
    verifyCsrf,
    validate({ body: createProductSchema }),
    controller.createProduct,
  );
  router.patch(
    "/products/:productId",
    authenticateRequest,
    requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
    verifyCsrf,
    validate({ params: productIdParamsSchema, body: updateProductSchema }),
    controller.updateProduct,
  );
  router.patch(
    "/products/:productId/status",
    authenticateRequest,
    requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
    verifyCsrf,
    validate({ params: productIdParamsSchema, body: updateProductStatusSchema }),
    controller.updateProductStatus,
  );

  router.get(
    "/categories",
    validate({ query: categoryListQuerySchema }),
    protectManagementView(database, config, PERMISSIONS.CATEGORIES_MANAGE),
    controller.listCategories,
  );
  router.post(
    "/categories",
    authenticateRequest,
    requirePermission(PERMISSIONS.CATEGORIES_MANAGE),
    verifyCsrf,
    validate({ body: createCategorySchema }),
    controller.createCategory,
  );
  router.patch(
    "/categories/:categoryId",
    authenticateRequest,
    requirePermission(PERMISSIONS.CATEGORIES_MANAGE),
    verifyCsrf,
    validate({ params: categoryIdParamsSchema, body: updateCategorySchema }),
    controller.updateCategory,
  );
  router.patch(
    "/categories/:categoryId/status",
    authenticateRequest,
    requirePermission(PERMISSIONS.CATEGORIES_MANAGE),
    verifyCsrf,
    validate({ params: categoryIdParamsSchema, body: updateCategoryStatusSchema }),
    controller.updateCategoryStatus,
  );

  return router;
}
