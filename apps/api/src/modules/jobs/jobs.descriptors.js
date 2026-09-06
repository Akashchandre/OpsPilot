import { Buffer } from "node:buffer";
import { z } from "zod";
import {
  JOB_ERROR_CODES,
  JOB_SCHEMA_VERSION,
  JOB_TYPES,
  MAX_JOB_PAYLOAD_BYTES,
} from "./jobs.constants.js";
import { JobDescriptorError } from "./jobs.errors.js";

const uuid = z.uuid();
const minuteBucket = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/)
  .refine((value) => !Number.isNaN(new Date(value).getTime()));
const dayBucket = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()));

const resourceEvent = (resourceName) =>
  z.strictObject({ sourceEventId: uuid, [resourceName]: uuid });

export const JOB_PAYLOAD_SCHEMAS = Object.freeze({
  [JOB_TYPES.NOTIFICATION_ORDER_PLACED]: resourceEvent("orderId"),
  [JOB_TYPES.NOTIFICATION_ORDER_STATUS_CHANGED]: resourceEvent("orderId"),
  [JOB_TYPES.NOTIFICATION_PAYMENT_STATUS_CHANGED]: resourceEvent("paymentId"),
  [JOB_TYPES.NOTIFICATION_REFUND_STATUS_CHANGED]: resourceEvent("refundId"),
  [JOB_TYPES.NOTIFICATION_SUPPORT_TICKET_CREATED]: resourceEvent("supportTicketId"),
  [JOB_TYPES.NOTIFICATION_SUPPORT_PUBLIC_REPLY_CREATED]: z.strictObject({
    sourceEventId: uuid,
    supportTicketId: uuid,
    messageId: uuid,
  }),
  [JOB_TYPES.NOTIFICATION_SUPPORT_ASSIGNMENT_CHANGED]: resourceEvent("supportTicketId"),
  [JOB_TYPES.NOTIFICATION_SUPPORT_STATUS_CHANGED]: resourceEvent("supportTicketId"),
  [JOB_TYPES.NOTIFICATION_INVENTORY_LOW]: z.strictObject({
    sourceEventId: uuid,
    productId: uuid,
  }),
  [JOB_TYPES.ORDER_RESERVATION_EXPIRY_SWEEP]: z.strictObject({ bucket: minuteBucket }),
  [JOB_TYPES.AUDIT_CHAIN_VERIFY]: z.strictObject({ bucket: dayBucket }),
  [JOB_TYPES.DOCUMENT_VERSION_INGEST]: z.strictObject({
    documentVersionId: uuid,
    indexVersion: z.number().int().min(1).max(2_147_483_647),
  }),
  [JOB_TYPES.DOCUMENT_VERSION_DELETE]: z.strictObject({ documentId: uuid }),
  [JOB_TYPES.DOCUMENT_VERSION_REINDEX]: z.strictObject({
    documentVersionId: uuid,
    indexVersion: z.number().int().min(1).max(2_147_483_647),
  }),
  [JOB_TYPES.AI_WORKFLOW_ADVANCE]: z.strictObject({
    workflowRunId: uuid,
    operation: z.enum(["START", "RESUME"]),
  }),
  [JOB_TYPES.AI_WORKFLOW_RETENTION_SWEEP]: z.strictObject({ bucket: minuteBucket }),
});

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function canonicalJobPayload(value) {
  return JSON.stringify(canonicalize(value));
}

export function validateJobPayload(type, schemaVersion, input) {
  if (schemaVersion !== JOB_SCHEMA_VERSION) {
    throw new JobDescriptorError(JOB_ERROR_CODES.SCHEMA_UNSUPPORTED);
  }
  const schema = JOB_PAYLOAD_SCHEMAS[type];
  if (!schema) throw new JobDescriptorError(JOB_ERROR_CODES.HANDLER_NOT_REGISTERED);
  const result = schema.safeParse(input);
  if (!result.success) throw new JobDescriptorError(JOB_ERROR_CODES.PAYLOAD_INVALID);
  if (Buffer.byteLength(canonicalJobPayload(result.data), "utf8") > MAX_JOB_PAYLOAD_BYTES) {
    throw new JobDescriptorError(JOB_ERROR_CODES.PAYLOAD_INVALID);
  }
  return Object.freeze(result.data);
}

export function validateJobDescriptor(input) {
  const type = input?.type;
  const schemaVersion = input?.schemaVersion ?? JOB_SCHEMA_VERSION;
  const dedupeKey = typeof input?.dedupeKey === "string" ? input.dedupeKey.trim() : "";
  if (!Object.values(JOB_TYPES).includes(type) || dedupeKey.length < 1 || dedupeKey.length > 191) {
    throw new JobDescriptorError(JOB_ERROR_CODES.PAYLOAD_INVALID);
  }
  return Object.freeze({
    type,
    schemaVersion,
    dedupeKey,
    payload: validateJobPayload(type, schemaVersion, input.payload),
  });
}

export function minuteScheduleBucket(date = new Date()) {
  const bucket = new Date(date);
  bucket.setUTCSeconds(0, 0);
  return bucket.toISOString();
}

export function dayScheduleBucket(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
