import { z } from "zod";
import {
  AI_WORKFLOW_CODES,
  AI_WORKFLOW_DECISIONS,
  AI_WORKFLOW_FOCUS,
  AI_WORKFLOW_NOTICE_VERSION,
  AI_WORKFLOW_STATUSES,
} from "./ai.workflow.constants.js";

const utcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const normalizedBody = z
  .string()
  .transform((value) => value.normalize("NFKC").replace(/\r\n?/g, "\n").trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(4000)
      .refine(
        (value) =>
          ![...value].some((character) => {
            const codePoint = character.codePointAt(0);
            return (
              codePoint === 0x7f ||
              (codePoint >= 0 && codePoint <= 0x08) ||
              codePoint === 0x0b ||
              codePoint === 0x0c ||
              (codePoint >= 0x0e && codePoint <= 0x1f)
            );
          }),
      ),
  );

const utcTimestamp = z
  .string()
  .regex(utcTimestampPattern)
  .transform((value) => new Date(value))
  .refine((value) => !Number.isNaN(value.getTime()));

export const workflowConsentScopeParamsSchema = z.strictObject({
  scope: z
    .enum(["business", "support"])
    .transform((value) => (value === "business" ? "OWNER" : "SUPPORT")),
});

export const workflowConsentBodySchema = z.strictObject({
  noticeVersion: z.literal(AI_WORKFLOW_NOTICE_VERSION),
});

export const businessBriefRunBodySchema = z
  .strictObject({
    from: utcTimestamp,
    to: utcTimestamp,
    focus: z.enum(Object.values(AI_WORKFLOW_FOCUS)).default(AI_WORKFLOW_FOCUS.GENERAL),
  })
  .superRefine((value, context) => {
    if (!(value.from instanceof Date) || !(value.to instanceof Date)) return;
    const duration = value.to.getTime() - value.from.getTime();
    if (duration < 24 * 60 * 60 * 1000) {
      context.addIssue({ code: "custom", path: ["to"], message: "range must be at least one day" });
    } else if (duration > 90 * 24 * 60 * 60 * 1000) {
      context.addIssue({ code: "custom", path: ["from"], message: "range cannot exceed 90 days" });
    }
  });

export const supportReplyRunBodySchema = z.strictObject({ ticketId: z.uuid() });

export const workflowRunParamsSchema = z.strictObject({ workflowRunId: z.uuid() });

export const workflowRunListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(Object.values(AI_WORKFLOW_STATUSES)).optional(),
  workflowCode: z.enum(Object.values(AI_WORKFLOW_CODES)).optional(),
});

export const workflowDecisionBodySchema = z
  .strictObject({
    decision: z.enum(Object.values(AI_WORKFLOW_DECISIONS)),
    version: z.number().int().min(0),
    body: normalizedBody.optional(),
  })
  .superRefine((value, context) => {
    if (value.decision === AI_WORKFLOW_DECISIONS.EDIT_AND_APPROVE && !value.body) {
      context.addIssue({ code: "custom", path: ["body"], message: "an edited body is required" });
    }
    if (value.decision !== AI_WORKFLOW_DECISIONS.EDIT_AND_APPROVE && value.body !== undefined) {
      context.addIssue({ code: "custom", path: ["body"], message: "body is not allowed" });
    }
  });

export const workflowCancellationBodySchema = z.strictObject({
  version: z.number().int().min(0),
});
