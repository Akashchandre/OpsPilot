import { z } from "zod";
import { NOTIFICATION_TYPES } from "./notifications.constants.js";

const reference = z.string().trim().min(1).max(64);
const status = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
  .max(64);
const supportMetadata = z.strictObject({
  reference,
  status,
  view: z.enum(["SELF", "MANAGEMENT"]),
});

const metadataSchemas = Object.freeze({
  [NOTIFICATION_TYPES.ORDER_PLACED]: z.strictObject({ reference, status }),
  [NOTIFICATION_TYPES.ORDER_STATUS_CHANGED]: z.strictObject({ reference, status }),
  [NOTIFICATION_TYPES.PAYMENT_STATUS_CHANGED]: z.strictObject({ reference, status }),
  [NOTIFICATION_TYPES.REFUND_STATUS_CHANGED]: z.strictObject({ reference, status }),
  [NOTIFICATION_TYPES.SUPPORT_TICKET_CREATED]: supportMetadata,
  [NOTIFICATION_TYPES.SUPPORT_PUBLIC_REPLY_CREATED]: supportMetadata,
  [NOTIFICATION_TYPES.SUPPORT_ASSIGNMENT_CHANGED]: supportMetadata,
  [NOTIFICATION_TYPES.SUPPORT_STATUS_CHANGED]: supportMetadata,
  [NOTIFICATION_TYPES.INVENTORY_LOW]: z.strictObject({
    reference,
    stockState: z.enum(["LOW", "OUT_OF_STOCK"]),
  }),
});

export class NotificationMetadataError extends Error {
  constructor() {
    super("Notification metadata is invalid");
    this.name = "NotificationMetadataError";
    this.code = "NOTIFICATION_METADATA_INVALID";
  }
}

export function validateNotificationMetadata(type, input) {
  const result = metadataSchemas[type]?.safeParse(input);
  if (!result?.success) throw new NotificationMetadataError();
  return result.data;
}
