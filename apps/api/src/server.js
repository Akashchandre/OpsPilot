import "dotenv/config";
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import { createJsonLogger } from "./logging/logger.js";
import { attachNotificationGateway } from "./realtime/notifications.gateway.js";

const config = loadEnvironment();
const database = createDatabase(config.databaseUrl);
const logger = createJsonLogger(config);
const app = createApp({ config, database, logger });
const server = createServer(app);
const realtime = await attachNotificationGateway({ httpServer: server, database, config, logger });

server.listen(config.port, config.host, () => {
  logger.log("info", "service.started", { host: config.host, port: config.port });
});

async function shutdown(signal) {
  logger.log("warn", "service.shutdown_requested", { signal });
  await realtime.close();
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  await database.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
