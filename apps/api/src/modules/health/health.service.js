import { AppError } from "../../errors/AppError.js";

export function createHealthService(database, config = {}, aiClient = null) {
  return {
    async check() {
      try {
        await database.$queryRawUnsafe("SELECT 1");
      } catch {
        throw new AppError({
          statusCode: 503,
          code: "SERVICE_UNAVAILABLE",
          message: "The service is temporarily unavailable",
        });
      }

      let ai = "disabled";
      if (config.ai?.enabled) {
        try {
          const health = await aiClient.health();
          ai = health.status === "ready" && health.provider === "ready" ? "ready" : "unavailable";
        } catch {
          ai = "unavailable";
        }
      }

      return {
        status: "ok",
        service: "opspilot-api",
        database: "reachable",
        ai,
        timestamp: new Date().toISOString(),
      };
    },
  };
}
