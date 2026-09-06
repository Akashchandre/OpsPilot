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
import { AI_DOCUMENT_CONSENT_NOTICES, AI_DOCUMENT_NOTICE_VERSION } from "./ai.constants.js";
import { createAiConsentService } from "./ai.consent.service.js";
import { createAiController } from "./ai.controller.js";
import {
  aiAssistantParamsSchema,
  aiConsentBodySchema,
  aiDocumentConsentBodySchema,
  aiDocumentCitationParamsSchema,
  aiUsageQuerySchema,
  customerAiResponseBodySchema,
  documentAiResponseBodySchema,
  ownerAiResponseBodySchema,
} from "./ai.schemas.js";
import { createAiService, requireAiEnabled, requireAssistantPermission } from "./ai.service.js";

export function createAiRouter(database, config, internalClient, documentStore = null) {
  const router = Router();
  const controller = createAiController(
    createAiConsentService(database, config),
    createAiConsentService(database, config, {
      noticeVersion: AI_DOCUMENT_NOTICE_VERSION,
      notices: AI_DOCUMENT_CONSENT_NOTICES,
    }),
    createAiService(database, config, internalClient, { documentStore }),
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
  router.get(
    "/document-consents/:assistant",
    validate({ params: aiAssistantParamsSchema }),
    controller.getDocumentConsent,
  );
  router.put(
    "/document-consents/:assistant",
    validate({ params: aiAssistantParamsSchema, body: aiDocumentConsentBodySchema }),
    requireAssistantPermission,
    verifyCsrf,
    controller.acceptDocumentConsent,
  );
  router.delete(
    "/document-consents/:assistant",
    validate({ params: aiAssistantParamsSchema }),
    verifyCsrf,
    controller.revokeDocumentConsent,
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
  router.post(
    "/customer/document-responses",
    requirePermission(PERMISSIONS.AI_CUSTOMER_USE),
    ensureEnabled,
    createAiCustomerRateLimiter(config),
    verifyCsrf,
    requireIdempotencyKey,
    validate({ body: documentAiResponseBodySchema }),
    controller.customerDocumentResponse,
  );
  router.post(
    "/owner/document-responses",
    requirePermission(PERMISSIONS.AI_OWNER_USE),
    ensureEnabled,
    createAiOwnerRateLimiter(config),
    verifyCsrf,
    requireIdempotencyKey,
    validate({ body: documentAiResponseBodySchema }),
    controller.ownerDocumentResponse,
  );
  router.get(
    "/document-citations/:citationId",
    ensureEnabled,
    validate({ params: aiDocumentCitationParamsSchema }),
    controller.documentCitation,
  );
  router.get(
    "/usage",
    requirePermission(PERMISSIONS.AI_USAGE_READ),
    validate({ query: aiUsageQuerySchema }),
    controller.usage,
  );

  return router;
}
