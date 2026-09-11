import "dotenv/config";
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { createDatabaseAvailabilitySupervisor } from "./db/databaseAvailability.js";
import { createDatabase } from "./db/prisma.js";
import { createJsonLogger } from "./logging/logger.js";
import { attachNotificationGateway } from "./realtime/notifications.gateway.js";
import { createConfiguredDocumentStore } from "./modules/documents/document.store.factory.js";

const config = loadEnvironment();
const database = createDatabase(config.databaseUrl);
const logger = createJsonLogger(config);
let realtime = null;
let server = null;
let shutdownPromise = null;

const databaseAvailability = createDatabaseAvailabilitySupervisor({
  database,
  config,
  logger,
  onFatal: () => shutdown("DATABASE_UNAVAILABLE", 1),
});

function shutdown(signal, exitCode = 0) {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    logger.log("warn", "service.shutdown_requested", { signal });
    databaseAvailability.stop();
    try {
      await realtime?.close();
    } catch (error) {
      logger.log("error", "service.realtime_shutdown_failed", {
        errorClass: error?.constructor?.name ?? "Error",
        errorCode: typeof error?.code === "string" ? error.code : "REALTIME_SHUTDOWN_FAILED",
      });
    }
    try {
      if (server?.listening) await new Promise((resolve) => server.close(resolve));
    } catch (error) {
      logger.log("error", "service.http_shutdown_failed", {
        errorClass: error?.constructor?.name ?? "Error",
        errorCode: typeof error?.code === "string" ? error.code : "HTTP_SHUTDOWN_FAILED",
      });
    }
    await database.$disconnect().catch(() => {});
    process.exit(exitCode);
  })();
  return shutdownPromise;
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await databaseAvailability.start();
  const documentStore = await createConfiguredDocumentStore(config);
  const app = createApp({ config, database, documentStore, databaseAvailability, logger });
  server = createServer(app);
  realtime = await attachNotificationGateway({ httpServer: server, database, config, logger });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, resolve);
  });
  logger.log("info", "service.started", { host: config.host, port: config.port });
} catch (error) {
  logger.log("error", "service.start_failed", {
    errorClass: error?.constructor?.name ?? "Error",
    errorCode: typeof error?.code === "string" ? error.code : "SERVICE_START_FAILED",
  });
  databaseAvailability.stop();
  await realtime?.close().catch(() => {});
  await database.$disconnect().catch(() => {});
  process.exitCode = 1;
}
