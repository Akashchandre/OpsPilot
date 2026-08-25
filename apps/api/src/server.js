import "dotenv/config";
import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";

const config = loadEnvironment();
const database = createDatabase(config.databaseUrl);
const app = createApp({ config, database });

const server = app.listen(config.port, config.host, () => {
  console.log(`OpsPilot API listening on http://${config.host}:${config.port}`);
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  server.close(async () => {
    await database.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
