import "dotenv/config";
import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import { createJsonLogger } from "./logging/logger.js";

const config = loadEnvironment();
const database = createDatabase(config.databaseUrl);
const logger = createJsonLogger(config);
const app = createApp({ config, database, logger });

const server = app.listen(config.port, config.host, () => {
  logger.log("info", "service.started", { host: config.host, port: config.port });
});

async function shutdown(signal) {
  logger.log("warn", "service.shutdown_requested", { signal });
  server.close(async () => {
    await database.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
