import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { createDatabaseAvailabilityGuard } from "./db/databaseAvailability.js";
import { createJsonLogger } from "./logging/logger.js";
import { resolveRateLimitIdentity } from "./middleware/authenticate.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { createApiRateLimiter, createWebhookRateLimiter } from "./middleware/rateLimits.js";
import { rejectUrlEncoded } from "./middleware/rejectUrlEncoded.js";
import { createRequestContext } from "./middleware/requestContext.js";
import { requireTrustedOrigin } from "./middleware/trustedOrigin.js";
import { createRazorpayWebhookController } from "./modules/payments/payments.controller.js";
import { createRazorpayAdapter } from "./modules/payments/razorpay.adapter.js";
import { createRazorpayWebhookService } from "./modules/payments/payments.webhook.js";
import { createAiInternalClient } from "./modules/ai/ai.internalClient.js";
import { createAiWorkflowGatewayRouter } from "./modules/ai/ai.workflow.gateway.js";
import { createApiRouter } from "./routes/index.js";

export function createApp({
  config,
  database,
  paymentProvider = createRazorpayAdapter(config),
  aiClient,
  documentStore = null,
  databaseAvailability = null,
  logger = createJsonLogger(config),
}) {
  const app = express();
  const selectedAiClient = aiClient ?? createAiInternalClient(config);

  app.disable("x-powered-by");
  app.set("trust proxy", config.proxy.trustProxyHops);
  app.use(createRequestContext(logger));
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Accept", "Content-Type", "Idempotency-Key", "X-CSRF-Token"],
    }),
  );
  app.use(createDatabaseAvailabilityGuard(databaseAvailability));
  app.use(rejectUrlEncoded);
  app.post(
    "/api/v1/payments/webhooks/razorpay",
    createWebhookRateLimiter(config),
    express.raw({ type: "application/json", limit: "64kb" }),
    createRazorpayWebhookController(createRazorpayWebhookService(database, config)),
  );
  app.use(
    "/internal/v1/ai",
    createAiWorkflowGatewayRouter(database, config, selectedAiClient, documentStore),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use("/api/v1", resolveRateLimitIdentity(database, config));
  app.use("/api/v1", createApiRateLimiter(config));
  app.use(requireTrustedOrigin(config.corsOrigin));

  app.use(
    "/api/v1",
    createApiRouter(database, config, paymentProvider, selectedAiClient, documentStore),
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
