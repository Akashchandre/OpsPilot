import { Router } from "express";
import { createHealthController } from "./health.controller.js";
import { createHealthService } from "./health.service.js";

export function createHealthRouter(database) {
  const router = Router();
  const service = createHealthService(database);

  router.get("/", createHealthController(service));

  return router;
}
