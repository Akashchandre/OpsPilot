import { AppError } from "../../errors/AppError.js";

export function createHealthService(database, config = {}, aiClient = null, documentStore = null) {
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
      let aiWorkflows = "disabled";
      let internalHealth = null;
      if (config.ai?.enabled) {
        try {
          internalHealth = await aiClient.health();
          ai =
            internalHealth.status === "ready" && internalHealth.provider === "ready"
              ? "ready"
              : "unavailable";
        } catch {
          ai = "unavailable";
        }
      }
      if (config.ai?.workflows?.enabled) {
        aiWorkflows = ai === "ready" ? "ready" : "unavailable";
      }

      const documents = {
        storage: "disabled",
        embedding: "disabled",
        vectorIndex: "disabled",
      };
      if (config.documents?.enabled) {
        try {
          documents.storage = (await documentStore?.health()) ?? "unavailable";
        } catch {
          documents.storage = "unavailable";
        }
        documents.embedding = config.ai?.enabled
          ? (internalHealth?.embedding ?? "unavailable")
          : "disabled";
        documents.vectorIndex = config.ai?.enabled
          ? (internalHealth?.vectorIndex ?? "unavailable")
          : "disabled";
      }

      return {
        status: "ok",
        service: "opspilot-api",
        database: "reachable",
        ai,
        aiWorkflows,
        documents,
        timestamp: new Date().toISOString(),
      };
    },
  };
}
