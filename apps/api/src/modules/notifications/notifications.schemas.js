import { z } from "zod";
import { MAX_NOTIFICATION_CURSOR } from "./notifications.constants.js";

const cursor = z
  .string()
  .trim()
  .regex(/^\d{1,19}$/)
  .transform((value) => BigInt(value))
  .refine((value) => value <= MAX_NOTIFICATION_CURSOR, "Cursor is outside the supported range");

export const notificationListQuerySchema = z
  .strictObject({
    after: cursor.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .transform((query) => ({
    ...query,
    after: query.after ?? 0n,
    afterProvided: query.after !== undefined,
  }));

export const notificationIdParamsSchema = z.strictObject({ notificationId: z.uuid() });

export const readAllNotificationsBodySchema = z.strictObject({ highWaterCursor: cursor });
