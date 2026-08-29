import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireCsrf } from "../../middleware/requireCsrf.js";
import { validate } from "../../middleware/validate.js";
import { createNotificationsController } from "./notifications.controller.js";
import {
  notificationIdParamsSchema,
  notificationListQuerySchema,
  readAllNotificationsBodySchema,
} from "./notifications.schemas.js";
import { createNotificationsService } from "./notifications.service.js";

export function createNotificationsRouter(database, config) {
  const router = Router();
  const controller = createNotificationsController(createNotificationsService(database));
  const verifyCsrf = requireCsrf(config);
  router.use(authenticate(database, config));
  router.get("/", validate({ query: notificationListQuerySchema }), controller.list);
  router.get("/unread-count", controller.unreadCount);
  router.patch(
    "/:notificationId/read",
    verifyCsrf,
    validate({ params: notificationIdParamsSchema }),
    controller.markRead,
  );
  router.post(
    "/read-all",
    verifyCsrf,
    validate({ body: readAllNotificationsBodySchema }),
    controller.markThrough,
  );
  return router;
}
