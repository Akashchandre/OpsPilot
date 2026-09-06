import { randomUUID } from "node:crypto";
import { JOB_ERROR_CODES, JOB_TYPES } from "../jobs/jobs.constants.js";
import { JobExecutionError } from "../jobs/jobs.errors.js";
import { AiInternalClientError } from "./ai.internalClient.js";
import { createAiWorkflowService } from "./ai.workflow.service.js";

const handled = new Set([JOB_TYPES.AI_WORKFLOW_ADVANCE, JOB_TYPES.AI_WORKFLOW_RETENTION_SWEEP]);

export function createAiWorkflowJobHandler(database, config, dependencies = {}) {
  const aiClient = dependencies.aiClient;
  const service = createAiWorkflowService(database, config, aiClient, {
    documentStore: dependencies.documentStore,
  });

  return Object.freeze({
    handles(type) {
      return handled.has(type);
    },
    async execute(job) {
      if (job.type === JOB_TYPES.AI_WORKFLOW_RETENTION_SWEEP) {
        const requestId = randomUUID();
        const result = await service.retentionSweep();
        let deletedCheckpoints = 0;
        for (const candidate of await service.checkpointCandidates()) {
          await aiClient.deleteWorkflowThread(candidate.threadId, randomUUID());
          await service.markCheckpointDeleted(candidate.id);
          deletedCheckpoints += 1;
        }
        const completed = { ...result, deletedCheckpoints };
        await service.recordRetention(completed, requestId);
        return completed;
      }

      const descriptor = await service.jobDescriptor(
        job.payload.workflowRunId,
        job.payload.operation,
      );
      if (!descriptor) return { terminal: true };
      const requestId = randomUUID();
      try {
        const result =
          job.payload.operation === "START"
            ? await aiClient.startWorkflow(descriptor, requestId)
            : await aiClient.resumeWorkflow(descriptor, requestId);
        return { status: result.status };
      } catch (error) {
        const internal =
          error instanceof AiInternalClientError
            ? error
            : new AiInternalClientError("AI_WORKFLOW_UNAVAILABLE");
        const unknown = internal.costDisposition !== "RELEASE";
        await service.failRun(descriptor.workflowRunId, internal.code, unknown, requestId);
        throw new JobExecutionError(
          unknown
            ? JOB_ERROR_CODES.AI_WORKFLOW_STATE_INVALID
            : JOB_ERROR_CODES.AI_WORKFLOW_UNAVAILABLE,
          { terminal: true },
        );
      }
    },
  });
}
