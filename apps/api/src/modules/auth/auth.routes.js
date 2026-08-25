import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { createAuthRateLimiter } from "../../middleware/authRateLimit.js";
import { requireCsrf } from "../../middleware/requireCsrf.js";
import { validate } from "../../middleware/validate.js";
import { createAuthController } from "./auth.controller.js";
import { loginSchema, registerSchema } from "./auth.schemas.js";
import { createAuthService } from "./auth.service.js";

export function createAuthRouter(database, config) {
  const router = Router();
  const service = createAuthService(database, config);
  const controller = createAuthController(service, config);
  const authRateLimiter = createAuthRateLimiter(config);
  const requireAuthentication = authenticate(database, config);
  const verifyCsrf = requireCsrf(config);

  router.post(
    "/register",
    authRateLimiter,
    validate({ body: registerSchema }),
    controller.register,
  );
  router.post("/login", authRateLimiter, validate({ body: loginSchema }), controller.login);
  router.get("/me", requireAuthentication, controller.currentUser);
  router.post("/logout", requireAuthentication, verifyCsrf, controller.logout);

  return router;
}
