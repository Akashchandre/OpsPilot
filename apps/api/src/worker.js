import "dotenv/config";
import { loadEnvironment } from "./config/env.js";
import { createDatabaseAvailabilitySupervisor } from "./db/databaseAvailability.js";
import { createDatabase } from "./db/prisma.js";
import { createJsonLogger } from "./logging/logger.js";
import { createAiInternalClient } from "./modules/ai/ai.internalClient.js";
import { createConfiguredDocumentStore } from "./modules/documents/document.store.factory.js";
import { createBackgroundWorker } from "./modules/jobs/jobs.worker.js";
import { createJobHandlers } from "./modules/jobs/jobs.handlers.js";

const config = loadEnvironment();
const database = createDatabase(config.databaseUrl);
const logger = createJsonLogger(config, { service: "opspilot-worker" });
let worker = null;
let requestedExitCode = null;

let shutdownStarted = false;
async function shutdown(signal, exitCode = 0) {
  requestedExitCode = Math.max(requestedExitCode ?? 0, exitCode);
  if (shutdownStarted) return worker?.stop(signal);
  shutdownStarted = true;
  await worker?.stop(signal);
}

const databaseAvailability = createDatabaseAvailabilitySupervisor({
  database,
  config,
  logger,
  onFatal: () => shutdown("DATABASE_UNAVAILABLE", 1),
});

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await databaseAvailability.start();
  const documentStore = await createConfiguredDocumentStore(config);
  const aiClient = createAiInternalClient(config);
  worker = createBackgroundWorker({
    database,
    config,
    logger,
    handlers: createJobHandlers(database, config, { documentStore, aiClient }),
    dependencies: { databaseAvailability },
  });
  await worker.start();
} catch (error) {
  logger.log("error", "worker.fatal", {
    errorClass: error?.constructor?.name ?? "Error",
    errorCode: typeof error?.code === "string" ? error.code : "WORKER_FATAL",
  });
  requestedExitCode = 1;
} finally {
  databaseAvailability.stop();
  await database.$disconnect().catch(() => {});
}

process.exit(requestedExitCode ?? 1);
