import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { requireCsrf } from "../../middleware/requireCsrf.js";
import { requireIdempotencyKey } from "../../middleware/idempotencyKey.js";
import { createSupportWriteRateLimiter } from "../../middleware/rateLimits.js";
import { validate } from "../../middleware/validate.js";
import { PERMISSIONS } from "../auth/auth.constants.js";
import { SUPPORT_VIEWS } from "./support.constants.js";
import { createSupportController } from "./support.controller.js";
import {
  closeSupportTicketSchema,
  createSupportMessageSchema,
  createSupportTicketSchema,
  supportTicketDetailQuerySchema,
  supportTicketIdParamsSchema,
  supportTicketListQuerySchema,
  updateSupportTicketSchema,
} from "./support.schemas.js";
import { createSupportService } from "./support.service.js";

function requireManagementRead(request, response, next) {
  if (request.validated.query.view !== SUPPORT_VIEWS.MANAGEMENT) return next();
  return requirePermission(PERMISSIONS.SUPPORT_TICKETS_READ)(request, response, next);
}

export function createSupportRouter(database, config) {
  const router = Router();
  const controller = createSupportController(createSupportService(database, config));
  const requireAuthentication = authenticate(database, config);
  const verifyCsrf = requireCsrf(config);
  const limitWrites = createSupportWriteRateLimiter(config);

  router.use(requireAuthentication);
  router.post(
    "/tickets",
    limitWrites,
    verifyCsrf,
    requireIdempotencyKey,
    validate({ body: createSupportTicketSchema }),
    controller.create,
  );
  router.get(
    "/tickets",
    validate({ query: supportTicketListQuerySchema }),
    requireManagementRead,
    controller.list,
  );
  router.get(
    "/tickets/:ticketId",
    validate({ params: supportTicketIdParamsSchema, query: supportTicketDetailQuerySchema }),
    requireManagementRead,
    controller.get,
  );
  router.post(
    "/tickets/:ticketId/messages",
    limitWrites,
    verifyCsrf,
    requireIdempotencyKey,
    validate({ params: supportTicketIdParamsSchema, body: createSupportMessageSchema }),
    controller.addMessage,
  );
  router.post(
    "/tickets/:ticketId/closure",
    limitWrites,
    verifyCsrf,
    validate({ params: supportTicketIdParamsSchema, body: closeSupportTicketSchema }),
    controller.close,
  );
  router.patch(
    "/tickets/:ticketId",
    requirePermission(PERMISSIONS.SUPPORT_TICKETS_MANAGE),
    limitWrites,
    verifyCsrf,
    validate({ params: supportTicketIdParamsSchema, body: updateSupportTicketSchema }),
    controller.update,
  );

  return router;
}
