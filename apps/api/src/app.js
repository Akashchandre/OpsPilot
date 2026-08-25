import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { requestContext } from "./middleware/requestContext.js";
import { createApiRouter } from "./routes/index.js";

export function createApp({ config, database }) {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin,
      methods: ["GET"],
      allowedHeaders: ["Accept", "Content-Type"],
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(requestContext);

  app.use("/api/v1", createApiRouter(database));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
