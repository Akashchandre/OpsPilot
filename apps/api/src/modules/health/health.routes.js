import { Router } from "express";
import { createHealthController } from "./health.controller.js";
import { createHealthService } from "./health.service.js";

export function createHealthRouter(database, config, aiClient, documentStore) {
  const router = Router();
  const service = createHealthService(database, config, aiClient, documentStore);

  router.get("/", createHealthController(service));

  return router;
}
