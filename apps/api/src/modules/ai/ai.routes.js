import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { requireCsrf } from "../../middleware/requireCsrf.js";
import { requireIdempotencyKey } from "../../middleware/idempotencyKey.js";
import {
  createAiCustomerRateLimiter,
  createAiOwnerRateLimiter,
} from "../../middleware/rateLimits.js";
import { validate } from "../../middleware/validate.js";
import { PERMISSIONS } from "../auth/auth.constants.js";
import { createAiConsentService } from "./ai.consent.service.js";
import { createAiController } from "./ai.controller.js";
import {
  aiAssistantParamsSchema,
  aiConsentBodySchema,
  aiUsageQuerySchema,
  customerAiResponseBodySchema,
  ownerAiResponseBodySchema,
} from "./ai.schemas.js";
import { createAiService, requireAiEnabled, requireAssistantPermission } from "./ai.service.js";

export function createAiRouter(database, config, internalClient) {
  const router = Router();
  const controller = createAiController(
    createAiConsentService(database, config),
    createAiService(database, config, internalClient),
  );
  const verifyCsrf = requireCsrf(config);
  const ensureEnabled = requireAiEnabled(config);

  router.use(authenticate(database, config));
  router.get(
    "/consents/:assistant",
    validate({ params: aiAssistantParamsSchema }),
    controller.getConsent,
  );
  router.put(
    "/consents/:assistant",
    validate({ params: aiAssistantParamsSchema, body: aiConsentBodySchema }),
    requireAssistantPermission,
    verifyCsrf,
    controller.acceptConsent,
  );
  router.delete(
    "/consents/:assistant",
    validate({ params: aiAssistantParamsSchema }),
    verifyCsrf,
    controller.revokeConsent,
  );
  router.post(
    "/customer/responses",
    requirePermission(PERMISSIONS.AI_CUSTOMER_USE),
    ensureEnabled,
    createAiCustomerRateLimiter(config),
    verifyCsrf,
    requireIdempotencyKey,
    validate({ body: customerAiResponseBodySchema }),
    controller.customerResponse,
  );
  router.post(
    "/owner/overview-responses",
    requirePermission(PERMISSIONS.AI_OWNER_USE),
    requirePermission(PERMISSIONS.REPORTS_READ),
    ensureEnabled,
    createAiOwnerRateLimiter(config),
    verifyCsrf,
    requireIdempotencyKey,
    validate({ body: ownerAiResponseBodySchema }),
    controller.ownerOverviewResponse,
  );
  router.get(
    "/usage",
    requirePermission(PERMISSIONS.AI_USAGE_READ),
    validate({ query: aiUsageQuerySchema }),
    controller.usage,
  );

  return router;
}
