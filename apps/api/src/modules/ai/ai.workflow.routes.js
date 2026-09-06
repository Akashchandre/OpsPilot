import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { requireCsrf } from "../../middleware/requireCsrf.js";
import { requireIdempotencyKey } from "../../middleware/idempotencyKey.js";
import { createAiWorkflowRateLimiter } from "../../middleware/rateLimits.js";
import { validate } from "../../middleware/validate.js";
import { PERMISSIONS } from "../auth/auth.constants.js";
import { createAiConsentService } from "./ai.consent.service.js";
import {
  AI_WORKFLOW_CONSENT_NOTICES,
  AI_WORKFLOW_NOTICE_VERSION,
} from "./ai.workflow.constants.js";
import { createAiWorkflowController } from "./ai.workflow.controller.js";
import {
  businessBriefRunBodySchema,
  supportReplyRunBodySchema,
  workflowCancellationBodySchema,
  workflowConsentBodySchema,
  workflowConsentScopeParamsSchema,
  workflowDecisionBodySchema,
  workflowRunListQuerySchema,
  workflowRunParamsSchema,
} from "./ai.workflow.schemas.js";
import { createAiWorkflowService } from "./ai.workflow.service.js";

function requireScopePermission(request, response, next) {
  const permission =
    request.validated.params.scope === "OWNER"
      ? PERMISSIONS.AI_WORKFLOWS_BUSINESS_USE
      : PERMISSIONS.AI_WORKFLOWS_SUPPORT_USE;
  return requirePermission(permission)(request, response, next);
}

export function createAiWorkflowRouter(database, config, aiClient, documentStore) {
  const router = Router();
  const service = createAiWorkflowService(database, config, aiClient, { documentStore });
  const consent = createAiConsentService(database, config, {
    noticeVersion: AI_WORKFLOW_NOTICE_VERSION,
    notices: AI_WORKFLOW_CONSENT_NOTICES,
  });
  const controller = createAiWorkflowController(service, consent);
  const csrf = requireCsrf(config);
  const limit = createAiWorkflowRateLimiter(config);
  router.use(authenticate(database, config));

  router.get(
    "/workflow-consents/:scope",
    validate({ params: workflowConsentScopeParamsSchema }),
    controller.getConsent,
  );
  router.put(
    "/workflow-consents/:scope",
    validate({ params: workflowConsentScopeParamsSchema, body: workflowConsentBodySchema }),
    requireScopePermission,
    csrf,
    controller.acceptConsent,
  );
  router.delete(
    "/workflow-consents/:scope",
    validate({ params: workflowConsentScopeParamsSchema }),
    csrf,
    controller.revokeConsent,
  );
  router.post(
    "/workflows/owner-business-brief/runs",
    requirePermission(PERMISSIONS.AI_WORKFLOWS_BUSINESS_USE),
    requirePermission(PERMISSIONS.AI_OWNER_USE),
    requirePermission(PERMISSIONS.REPORTS_READ),
    requirePermission(PERMISSIONS.INVENTORY_READ),
    requirePermission(PERMISSIONS.SUPPORT_TICKETS_READ),
    limit,
    csrf,
    requireIdempotencyKey,
    validate({ body: businessBriefRunBodySchema }),
    controller.businessBrief,
  );
  router.post(
    "/workflows/support-reply/runs",
    requirePermission(PERMISSIONS.AI_WORKFLOWS_SUPPORT_USE),
    requirePermission(PERMISSIONS.SUPPORT_TICKETS_READ),
    requirePermission(PERMISSIONS.SUPPORT_TICKETS_MANAGE),
    requirePermission(PERMISSIONS.ORDERS_READ),
    limit,
    csrf,
    requireIdempotencyKey,
    validate({ body: supportReplyRunBodySchema }),
    controller.supportReply,
  );
  router.get("/workflow-runs", validate({ query: workflowRunListQuerySchema }), controller.list);
  router.get(
    "/workflow-runs/:workflowRunId",
    validate({ params: workflowRunParamsSchema }),
    controller.get,
  );
  router.post(
    "/workflow-runs/:workflowRunId/decisions",
    requirePermission(PERMISSIONS.AI_WORKFLOWS_SUPPORT_USE),
    requirePermission(PERMISSIONS.AI_WORKFLOWS_SUPPORT_APPROVE),
    requirePermission(PERMISSIONS.SUPPORT_TICKETS_READ),
    requirePermission(PERMISSIONS.SUPPORT_TICKETS_MANAGE),
    requirePermission(PERMISSIONS.ORDERS_READ),
    csrf,
    requireIdempotencyKey,
    validate({ params: workflowRunParamsSchema, body: workflowDecisionBodySchema }),
    controller.decide,
  );
  router.post(
    "/workflow-runs/:workflowRunId/cancellation",
    csrf,
    requireIdempotencyKey,
    validate({ params: workflowRunParamsSchema, body: workflowCancellationBodySchema }),
    controller.cancel,
  );
  return router;
}
