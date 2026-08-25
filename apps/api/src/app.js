import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { requestContext } from "./middleware/requestContext.js";
import { requireTrustedOrigin } from "./middleware/trustedOrigin.js";
import { createApiRouter } from "./routes/index.js";

export function createApp({ config, database }) {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE"],
      allowedHeaders: ["Accept", "Content-Type", "X-CSRF-Token"],
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(requestContext);
  app.use(requireTrustedOrigin(config.corsOrigin));

  app.use("/api/v1", createApiRouter(database, config));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
