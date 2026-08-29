import { z } from "zod";
import { JOB_STATUSES, JOB_TYPES } from "./jobs.constants.js";

export const jobListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(Object.values(JOB_STATUSES)).optional(),
  type: z.enum(Object.values(JOB_TYPES)).optional(),
});

export const jobIdParamsSchema = z.strictObject({ jobId: z.uuid() });

export const replayJobBodySchema = z.strictObject({ idempotencyKey: z.uuid() });
