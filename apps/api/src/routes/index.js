import { Router } from "express";
import { createHealthRouter } from "../modules/health/health.routes.js";

export function createApiRouter(database) {
  const router = Router();

  router.use("/health", createHealthRouter(database));

  return router;
}
