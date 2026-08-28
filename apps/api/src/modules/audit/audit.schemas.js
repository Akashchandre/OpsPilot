import { z } from "zod";
import { AUDIT_ACTOR_KINDS, AUDIT_OUTCOMES } from "./audit.constants.js";

const dayMilliseconds = 24 * 60 * 60 * 1000;
const defaultRangeMilliseconds = 30 * dayMilliseconds;
const maximumRangeMilliseconds = 366 * dayMilliseconds;
const utcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,3}))?Z$/;

function isValidUtcTimestamp(value) {
  const match = utcTimestampPattern.exec(value);
  if (!match) return false;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return false;
  const milliseconds = (match[1] ?? "").padEnd(3, "0");
  return timestamp.toISOString() === `${value.slice(0, 19)}.${milliseconds}Z`;
}

const utcTimestampSchema = z
  .string()
  .trim()
  .max(30)
  .refine(isValidUtcTimestamp, "Enter a valid RFC 3339 UTC timestamp");

const auditListQueryShape = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  from: utcTimestampSchema.optional(),
  to: utcTimestampSchema.optional(),
  action: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Z][A-Z0-9_]*$/)
    .optional(),
  outcome: z.enum(Object.values(AUDIT_OUTCOMES)).optional(),
  actorKind: z.enum(Object.values(AUDIT_ACTOR_KINDS)).optional(),
  actorUserId: z.uuid().optional(),
  targetType: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Z][A-Z0-9_]*$/)
    .optional(),
  targetId: z.string().trim().min(1).max(100).optional(),
});

export function createAuditListQuerySchema(now = () => new Date()) {
  return auditListQueryShape
    .transform((query) => {
      const to = query.to ? new Date(query.to) : now();
      const from = query.from
        ? new Date(query.from)
        : new Date(to.getTime() - defaultRangeMilliseconds);
      const filterNames = [
        "from",
        "to",
        "action",
        "outcome",
        "actorKind",
        "actorUserId",
        "targetType",
        "targetId",
      ].filter((name) => query[name] !== undefined);
      return { ...query, from, to, filterNames };
    })
    .superRefine((query, context) => {
      if (query.from >= query.to) {
        context.addIssue({
          code: "custom",
          path: ["to"],
          message: "The end timestamp must be later than the start timestamp",
        });
      } else if (query.to.getTime() - query.from.getTime() > maximumRangeMilliseconds) {
        context.addIssue({
          code: "custom",
          path: ["from"],
          message: "The audit range cannot exceed 366 days",
        });
      }
    });
}

export const auditListQuerySchema = createAuditListQuerySchema();
