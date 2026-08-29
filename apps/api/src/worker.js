import "dotenv/config";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import { createJsonLogger } from "./logging/logger.js";
import { createBackgroundWorker } from "./modules/jobs/jobs.worker.js";
import { createJobHandlers } from "./modules/jobs/jobs.handlers.js";

const config = loadEnvironment();
const database = createDatabase(config.databaseUrl);
const logger = createJsonLogger(config, { service: "opspilot-worker" });
const worker = createBackgroundWorker({
  database,
  config,
  logger,
  handlers: createJobHandlers(database, config),
});

let shutdownStarted = false;
async function shutdown(signal) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  await worker.stop(signal);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await worker.start();
  await database.$disconnect();
} catch (error) {
  logger.log("error", "worker.fatal", {
    errorClass: error?.constructor?.name ?? "Error",
    errorCode: typeof error?.code === "string" ? error.code : "WORKER_FATAL",
  });
  await database.$disconnect();
  process.exitCode = 1;
}
