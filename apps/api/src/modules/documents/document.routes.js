import express, { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { requireCsrf } from "../../middleware/requireCsrf.js";
import { requireIdempotencyKey } from "../../middleware/idempotencyKey.js";
import { validate } from "../../middleware/validate.js";
import { PERMISSIONS } from "../auth/auth.constants.js";
import { createDocumentController } from "./document.controller.js";
import { MAX_DOCUMENT_CONTENT_BYTES } from "./document.content.js";
import {
  createDocumentSchema,
  createDocumentVersionSchema,
  documentIdParamsSchema,
  documentListQuerySchema,
  documentVersionActionSchema,
  documentVersionParamsSchema,
  updateDocumentStatusSchema,
} from "./document.schemas.js";
import { createDocumentService } from "./document.service.js";

export function createDocumentRouter(database, config, documentStore, aiClient) {
  const router = Router();
  const controller = createDocumentController(
    createDocumentService(database, config, documentStore, aiClient),
  );
  const authenticateRequest = authenticate(database, config);
  const verifyCsrf = requireCsrf(config);
  const parseDocumentBody = express.raw({
    type: ["text/plain", "text/markdown"],
    limit: config.documents?.maximumUploadBytes ?? MAX_DOCUMENT_CONTENT_BYTES,
  });

  router.use(authenticateRequest);
  router.get(
    "/",
    requirePermission(PERMISSIONS.DOCUMENTS_READ),
    validate({ query: documentListQuerySchema }),
    controller.list,
  );
  router.post(
    "/",
    requirePermission(PERMISSIONS.DOCUMENTS_MANAGE),
    verifyCsrf,
    requireIdempotencyKey,
    validate({ body: createDocumentSchema }),
    controller.create,
  );
  router.get(
    "/recovery/orphans",
    requirePermission(PERMISSIONS.DOCUMENTS_DELETE),
    controller.recovery,
  );
  router.get(
    "/:documentId",
    requirePermission(PERMISSIONS.DOCUMENTS_READ),
    validate({ params: documentIdParamsSchema }),
    controller.get,
  );
  router.post(
    "/:documentId/versions",
    requirePermission(PERMISSIONS.DOCUMENTS_MANAGE),
    verifyCsrf,
    requireIdempotencyKey,
    validate({ params: documentIdParamsSchema, body: createDocumentVersionSchema }),
    controller.createVersion,
  );
  router.put(
    "/:documentId/versions/:versionId/content",
    requirePermission(PERMISSIONS.DOCUMENTS_MANAGE),
    verifyCsrf,
    requireIdempotencyKey,
    validate({ params: documentVersionParamsSchema }),
    parseDocumentBody,
    controller.uploadContent,
  );
  router.get(
    "/:documentId/versions/:versionId/content",
    requirePermission(PERMISSIONS.DOCUMENTS_READ),
    validate({ params: documentVersionParamsSchema }),
    controller.readContent,
  );
  router.patch(
    "/:documentId/status",
    requirePermission(PERMISSIONS.DOCUMENTS_MANAGE),
    verifyCsrf,
    requireIdempotencyKey,
    validate({ params: documentIdParamsSchema, body: updateDocumentStatusSchema }),
    controller.updateStatus,
  );
  router.post(
    "/:documentId/versions/:versionId/reindex",
    requirePermission(PERMISSIONS.DOCUMENTS_MANAGE),
    verifyCsrf,
    requireIdempotencyKey,
    validate({ params: documentVersionParamsSchema, body: documentVersionActionSchema }),
    controller.requestReindex,
  );
  router.delete(
    "/:documentId",
    requirePermission(PERMISSIONS.DOCUMENTS_DELETE),
    verifyCsrf,
    requireIdempotencyKey,
    validate({ params: documentIdParamsSchema, body: documentVersionActionSchema }),
    controller.requestDelete,
  );

  return router;
}
