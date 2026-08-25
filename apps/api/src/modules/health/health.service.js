import { AppError } from "../../errors/AppError.js";

export function createHealthService(database) {
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

      return {
        status: "ok",
        service: "opspilot-api",
        database: "reachable",
        timestamp: new Date().toISOString(),
      };
    },
  };
}
