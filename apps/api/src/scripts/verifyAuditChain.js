import dotenv from "dotenv";
import { loadEnvironment } from "../config/env.js";
import { createDatabase } from "../db/prisma.js";
import { createAuditService } from "../modules/audit/audit.service.js";

const environmentFile = process.argv.includes("--test") ? ".env.test" : ".env";
dotenv.config({ path: environmentFile, override: true, quiet: true });

const config = loadEnvironment();
const database = createDatabase(config.databaseUrl);

try {
  const result = await createAuditService(database, config).verifyChain();
  console.log(JSON.stringify({ event: "audit.verification_completed", ...result }));
  if (!result.valid) process.exitCode = 1;
} finally {
  await database.$disconnect();
}
