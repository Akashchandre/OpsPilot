import { z } from "zod";

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

const overviewQueryShape = z.strictObject({
  from: utcTimestampSchema.optional(),
  to: utcTimestampSchema.optional(),
});

export function createOverviewQuerySchema(now = () => new Date()) {
  return overviewQueryShape
    .transform((query) => {
      const to = query.to ? new Date(query.to) : now();
      const from = query.from
        ? new Date(query.from)
        : new Date(to.getTime() - defaultRangeMilliseconds);
      return { from, to };
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
          message: "The report range cannot exceed 366 days",
        });
      }
    });
}

export const overviewQuerySchema = createOverviewQuerySchema();
