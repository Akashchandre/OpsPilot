import { Buffer } from "node:buffer";
import { z } from "zod";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_KINDS,
  AUDIT_OUTCOMES,
  AUDIT_TARGET_TYPES,
  MAX_AUDIT_METADATA_BYTES,
} from "./audit.constants.js";

const auditFilterNames = Object.freeze([
  "action",
  "actorKind",
  "actorUserId",
  "from",
  "outcome",
  "targetId",
  "targetType",
  "to",
]);

const auditReadMetadataSchema = z.strictObject({
  filterNames: z
    .array(z.enum(auditFilterNames))
    .max(auditFilterNames.length)
    .transform((names) => [...new Set(names)].sort()),
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(100),
  returnedCount: z.number().int().min(0).max(100),
  total: z.number().int().min(0),
});

const supportTicketCreatedMetadataSchema = z.strictObject({
  category: z.enum(["GENERAL", "ORDER", "PAYMENT", "PRODUCT", "ACCOUNT"]),
  orderLinked: z.boolean(),
});

const supportMessageAddedMetadataSchema = z.strictObject({
  visibility: z.enum(["CUSTOMER_VISIBLE", "INTERNAL"]),
  automaticReopen: z.boolean(),
});

const supportTicketClosedMetadataSchema = z.strictObject({
  fromStatus: z.enum(["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED"]),
  toStatus: z.literal("CLOSED"),
});

const nullableSupportStatus = z
  .enum(["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"])
  .nullable();
const nullableSupportPriority = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).nullable();

const supportTicketUpdatedMetadataSchema = z.strictObject({
  changeKinds: z
    .array(z.enum(["STATUS", "PRIORITY", "ASSIGNEE"]))
    .min(1)
    .max(3),
  fromStatus: nullableSupportStatus,
  toStatus: nullableSupportStatus,
  fromPriority: nullableSupportPriority,
  toPriority: nullableSupportPriority,
  previousAssigneeSet: z.boolean().nullable(),
  nextAssigneeSet: z.boolean().nullable(),
});

const userStatusMetadataSchema = z.strictObject({
  fromStatus: z.enum(["ACTIVE", "DISABLED"]),
  toStatus: z.enum(["ACTIVE", "DISABLED"]),
});
const userRoleMetadataSchema = z.strictObject({ roleCode: z.enum(["OWNER", "ADMIN", "CUSTOMER"]) });
const productCreatedMetadataSchema = z.strictObject({
  categoryCount: z.number().int().min(0).max(100),
  initialQuantity: z.number().int().min(0).max(2_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
const changedProductFieldsSchema = z.strictObject({
  changedFields: z
    .array(z.enum(["name", "description", "price", "categoryIds"]))
    .min(1)
    .max(4)
    .transform((fields) => [...new Set(fields)].sort()),
});
const productStatusMetadataSchema = z.strictObject({
  fromStatus: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
  toStatus: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
});
const categoryCreatedMetadataSchema = z.strictObject({});
const changedCategoryFieldsSchema = z.strictObject({
  changedFields: z
    .array(z.enum(["slug", "name", "description"]))
    .min(1)
    .max(3)
    .transform((fields) => [...new Set(fields)].sort()),
});
const categoryStatusMetadataSchema = z.strictObject({
  fromStatus: z.enum(["ACTIVE", "INACTIVE"]),
  toStatus: z.enum(["ACTIVE", "INACTIVE"]),
});
const inventoryAdjustedMetadataSchema = z.strictObject({
  delta: z.number().int().min(-2_000_000_000).max(2_000_000_000),
  quantityBefore: z.number().int().min(0).max(2_000_000_000),
  quantityAfter: z.number().int().min(0).max(2_000_000_000),
  reason: z.enum([
    "INITIAL",
    "RESTOCK",
    "CORRECTION",
    "DAMAGE",
    "ORDER_RESERVATION",
    "ORDER_RELEASE",
  ]),
});
const inventoryThresholdMetadataSchema = z.strictObject({
  fromThreshold: z.number().int().min(0).max(2_000_000_000),
  toThreshold: z.number().int().min(0).max(2_000_000_000),
});
const orderCreatedMetadataSchema = z.strictObject({
  itemCount: z.number().int().min(1).max(1000),
  totalQuantity: z.number().int().min(1).max(100_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
const orderTransitionMetadataSchema = z.strictObject({
  fromStatus: z.enum([
    "PENDING_PAYMENT",
    "CONFIRMED",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
    "EXPIRED",
    "PAYMENT_REVIEW",
  ]),
  toStatus: z.enum([
    "PENDING_PAYMENT",
    "CONFIRMED",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
    "EXPIRED",
    "PAYMENT_REVIEW",
  ]),
  reasonCode: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
});
const paymentProviderOrderMetadataSchema = z.strictObject({
  paymentStatus: z.enum([
    "CREATING",
    "OPEN",
    "CAPTURED",
    "REFUND_PENDING",
    "REFUNDED",
    "REVIEW_REQUIRED",
  ]),
  providerOrderStatus: z.enum(["created", "attempted", "paid"]),
});
const nullablePaymentStatus = z
  .enum(["CREATING", "OPEN", "CAPTURED", "REFUND_PENDING", "REFUNDED", "REVIEW_REQUIRED"])
  .nullable();
const nullableOrderStatus = z
  .enum([
    "PENDING_PAYMENT",
    "CONFIRMED",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
    "EXPIRED",
    "PAYMENT_REVIEW",
  ])
  .nullable();
const paymentProviderStateMetadataSchema = z.strictObject({
  source: z.enum(["PROVIDER", "RECONCILIATION"]),
  paymentStatus: nullablePaymentStatus,
  orderStatus: nullableOrderStatus,
});
const refundRequestedMetadataSchema = z.strictObject({
  paymentStatus: z.enum(["REFUND_PENDING", "REVIEW_REQUIRED"]),
  orderStatus: z.enum(["CANCELLED", "PAYMENT_REVIEW"]),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
const refundProviderStateMetadataSchema = z.strictObject({
  source: z.enum(["PROVIDER", "RECONCILIATION"]),
  refundStatus: z.enum(["PENDING", "PROCESSED", "FAILED"]).nullable(),
});
const paymentReconciledMetadataSchema = z.strictObject({
  paymentStatus: nullablePaymentStatus,
  orderStatus: nullableOrderStatus,
  observedPaymentCount: z.number().int().min(0).max(10_000),
  observedRefundCount: z.number().int().min(0).max(10_000),
});
const paymentWebhookMetadataSchema = z.strictObject({
  eventType: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z][A-Za-z0-9._-]*$/),
  status: z.enum(["PROCESSED", "IGNORED", "REVIEW_REQUIRED"]),
  safeCode: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
    .nullable(),
  paymentMatched: z.boolean(),
});
const backgroundJobsReadMetadataSchema = z.strictObject({
  view: z.enum(["LIST", "DETAIL", "HEALTH"]),
  page: z.number().int().min(1).nullable(),
  limit: z.number().int().min(1).max(100).nullable(),
  returnedCount: z.number().int().min(0).max(100),
  total: z.number().int().min(0),
  statusFilterSet: z.boolean(),
  typeFilterSet: z.boolean(),
});
const backgroundJobReplayMetadataSchema = z.strictObject({
  replayedJobId: z.uuid(),
  originalAttemptCount: z.number().int().min(0).max(20),
  originalErrorCode: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
    .nullable(),
});
const aiProviderSchema = z.literal("GROQ");
const aiAssistantSchema = z.enum(["CUSTOMER", "OWNER"]);
const aiIntentSchema = z.enum([
  "CUSTOMER_HELP",
  "OWNER_OVERVIEW_EXPLAIN",
  "CUSTOMER_DOCUMENT_QA",
  "OWNER_DOCUMENT_QA",
]);
const aiPromptVersionSchema = z.enum([
  "customer-help-v1",
  "owner-overview-v1",
  "customer-documents-v1",
  "owner-documents-v1",
]);
const aiModelSchema = z.literal("openai/gpt-oss-120b");
const aiConsentMetadataSchema = z.strictObject({
  provider: aiProviderSchema,
  assistant: aiAssistantSchema,
  noticeVersion: z.enum(["groq-zdr-v1", "groq-zdr-documents-v1"]),
});
const aiRequestIdentityShape = {
  provider: aiProviderSchema,
  assistant: aiAssistantSchema,
  intent: aiIntentSchema,
  promptVersion: aiPromptVersionSchema,
  model: aiModelSchema,
};
const aiRequestStartedMetadataSchema = z.strictObject({
  ...aiRequestIdentityShape,
  status: z.literal("PENDING"),
  reservedCostTicks: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
const aiRequestCompletedMetadataSchema = z.strictObject({
  ...aiRequestIdentityShape,
  status: z.literal("SUCCEEDED"),
  outcome: z.enum(["ANSWER", "INSUFFICIENT_EVIDENCE", "REFUSAL", "ESCALATE"]),
  inputTokens: z.number().int().min(0).max(100000),
  outputTokens: z.number().int().min(0).max(500),
  totalTokens: z.number().int().min(0).max(100500),
  costInUsdTicks: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  durationMs: z.number().int().min(0).max(60000),
  zeroDataRetention: z.literal(true),
});
const aiRequestFailedMetadataSchema = z.strictObject({
  ...aiRequestIdentityShape,
  status: z.enum(["FAILED", "UNKNOWN"]),
  safeErrorCode: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
  durationMs: z.number().int().min(0).max(60000),
});
const aiUsageReadMetadataSchema = z.strictObject({
  from: z.iso.datetime({ offset: false }),
  to: z.iso.datetime({ offset: false }),
  requestCount: z.number().int().min(0),
});
const documentAudienceSchema = z.enum(["CUSTOMER", "OWNER"]);
const documentVersionMetadataSchema = z.strictObject({
  versionNumber: z.number().int().min(1),
  audiences: z.array(documentAudienceSchema).min(1).max(2),
  mediaType: z.enum(["text/plain", "text/markdown"]),
  language: z.literal("en"),
});
const documentContentMetadataSchema = z.strictObject({
  versionNumber: z.number().int().min(1),
  byteLength: z.number().int().min(1).max(262144),
  jobCreated: z.boolean(),
});
const documentContentReadMetadataSchema = z.strictObject({
  versionNumber: z.number().int().min(1),
  byteLength: z.number().int().min(1).max(262144),
});
const documentStatusMetadataSchema = z.strictObject({
  fromStatus: z.enum(["ACTIVE", "ARCHIVED"]),
  toStatus: z.enum(["ACTIVE", "ARCHIVED"]),
});
const documentDeleteMetadataSchema = z.strictObject({
  versionCount: z.number().int().min(1),
  jobCreated: z.boolean(),
});
const documentReindexMetadataSchema = z.strictObject({
  fromIndexVersion: z.number().int().min(1),
  toIndexVersion: z.number().int().min(2),
  jobCreated: z.boolean(),
});
const documentIngestionCompletedMetadataSchema = z.strictObject({
  indexVersion: z.number().int().min(1),
  chunkCount: z.number().int().min(1),
});
const documentIngestionFailedMetadataSchema = z.strictObject({
  indexVersion: z.number().int().min(1),
  safeErrorCode: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
});
const documentDeletionCompletedMetadataSchema = z.strictObject({
  deletedVersionCount: z.number().int().min(1),
});
const documentRecoveryMetadataSchema = z.strictObject({
  clean: z.boolean(),
  orphanObjectCount: z.number().int().min(0),
  missingObjectCount: z.number().int().min(0),
  unexpectedStorageEntryCount: z.number().int().min(0),
  orphanVectorVersionCount: z.number().int().min(0),
  orphanVectorPointCount: z.number().int().min(0),
  missingVectorVersionCount: z.number().int().min(0),
  vectorPointCountMismatchVersionCount: z.number().int().min(0),
});
const aiDocumentCitationReadMetadataSchema = z.strictObject({
  assistant: aiAssistantSchema,
  sourceLabel: z.string().regex(/^S[1-5]$/),
});

export const AUDIT_ACTION_DEFINITIONS = Object.freeze({
  [AUDIT_ACTIONS.AUDIT_EVENTS_READ]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.AUDIT_STREAM,
    targetIdRequired: false,
    metadataSchema: auditReadMetadataSchema,
  }),
  [AUDIT_ACTIONS.SUPPORT_TICKET_CREATED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.SUPPORT_TICKET,
    targetIdRequired: true,
    metadataSchema: supportTicketCreatedMetadataSchema,
  }),
  [AUDIT_ACTIONS.SUPPORT_MESSAGE_ADDED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.SUPPORT_TICKET,
    targetIdRequired: true,
    metadataSchema: supportMessageAddedMetadataSchema,
  }),
  [AUDIT_ACTIONS.SUPPORT_TICKET_CLOSED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.SUPPORT_TICKET,
    targetIdRequired: true,
    metadataSchema: supportTicketClosedMetadataSchema,
  }),
  [AUDIT_ACTIONS.SUPPORT_TICKET_UPDATED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.SUPPORT_TICKET,
    targetIdRequired: true,
    metadataSchema: supportTicketUpdatedMetadataSchema,
  }),
  [AUDIT_ACTIONS.USER_STATUS_CHANGED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.USER,
    targetIdRequired: true,
    metadataSchema: userStatusMetadataSchema,
  }),
  [AUDIT_ACTIONS.USER_ROLE_ASSIGNED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.USER,
    targetIdRequired: true,
    metadataSchema: userRoleMetadataSchema,
  }),
  [AUDIT_ACTIONS.USER_ROLE_REMOVED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.USER,
    targetIdRequired: true,
    metadataSchema: userRoleMetadataSchema,
  }),
  [AUDIT_ACTIONS.PRODUCT_CREATED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.PRODUCT,
    targetIdRequired: true,
    metadataSchema: productCreatedMetadataSchema,
  }),
  [AUDIT_ACTIONS.PRODUCT_UPDATED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.PRODUCT,
    targetIdRequired: true,
    metadataSchema: changedProductFieldsSchema,
  }),
  [AUDIT_ACTIONS.PRODUCT_STATUS_CHANGED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.PRODUCT,
    targetIdRequired: true,
    metadataSchema: productStatusMetadataSchema,
  }),
  [AUDIT_ACTIONS.CATEGORY_CREATED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.CATEGORY,
    targetIdRequired: true,
    metadataSchema: categoryCreatedMetadataSchema,
  }),
  [AUDIT_ACTIONS.CATEGORY_UPDATED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.CATEGORY,
    targetIdRequired: true,
    metadataSchema: changedCategoryFieldsSchema,
  }),
  [AUDIT_ACTIONS.CATEGORY_STATUS_CHANGED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.CATEGORY,
    targetIdRequired: true,
    metadataSchema: categoryStatusMetadataSchema,
  }),
  [AUDIT_ACTIONS.INVENTORY_ADJUSTED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.INVENTORY,
    targetIdRequired: true,
    metadataSchema: inventoryAdjustedMetadataSchema,
  }),
  [AUDIT_ACTIONS.INVENTORY_THRESHOLD_UPDATED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.INVENTORY,
    targetIdRequired: true,
    metadataSchema: inventoryThresholdMetadataSchema,
  }),
  [AUDIT_ACTIONS.ORDER_CREATED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.ORDER,
    targetIdRequired: true,
    metadataSchema: orderCreatedMetadataSchema,
  }),
  [AUDIT_ACTIONS.ORDER_CANCELLED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.ORDER,
    targetIdRequired: true,
    metadataSchema: orderTransitionMetadataSchema,
  }),
  [AUDIT_ACTIONS.ORDER_STATUS_CHANGED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.ORDER,
    targetIdRequired: true,
    metadataSchema: orderTransitionMetadataSchema,
  }),
  [AUDIT_ACTIONS.PAYMENT_PROVIDER_ORDER_LINKED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.PAYMENT,
    targetIdRequired: true,
    metadataSchema: paymentProviderOrderMetadataSchema,
  }),
  [AUDIT_ACTIONS.PAYMENT_PROVIDER_STATE_APPLIED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.PAYMENT,
    targetIdRequired: true,
    metadataSchema: paymentProviderStateMetadataSchema,
  }),
  [AUDIT_ACTIONS.REFUND_REQUESTED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.REFUND,
    targetIdRequired: true,
    metadataSchema: refundRequestedMetadataSchema,
  }),
  [AUDIT_ACTIONS.REFUND_PROVIDER_STATE_APPLIED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.REFUND,
    targetIdRequired: true,
    metadataSchema: refundProviderStateMetadataSchema,
  }),
  [AUDIT_ACTIONS.PAYMENT_RECONCILED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.PAYMENT,
    targetIdRequired: true,
    metadataSchema: paymentReconciledMetadataSchema,
  }),
  [AUDIT_ACTIONS.PAYMENT_WEBHOOK_PROCESSED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.PROVIDER_WEBHOOK_EVENT,
    targetIdRequired: true,
    metadataSchema: paymentWebhookMetadataSchema,
  }),
  [AUDIT_ACTIONS.BACKGROUND_JOBS_READ]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.BACKGROUND_JOB_QUEUE,
    targetIdRequired: false,
    metadataSchema: backgroundJobsReadMetadataSchema,
  }),
  [AUDIT_ACTIONS.BACKGROUND_JOB_REPLAYED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.BACKGROUND_JOB,
    targetIdRequired: true,
    metadataSchema: backgroundJobReplayMetadataSchema,
  }),
  [AUDIT_ACTIONS.AI_CONSENT_ACCEPTED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.AI_CONSENT,
    targetIdRequired: true,
    metadataSchema: aiConsentMetadataSchema,
  }),
  [AUDIT_ACTIONS.AI_CONSENT_REVOKED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.AI_CONSENT,
    targetIdRequired: true,
    metadataSchema: aiConsentMetadataSchema,
  }),
  [AUDIT_ACTIONS.AI_REQUEST_STARTED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.AI_USAGE_EVENT,
    targetIdRequired: true,
    metadataSchema: aiRequestStartedMetadataSchema,
  }),
  [AUDIT_ACTIONS.AI_REQUEST_COMPLETED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.AI_USAGE_EVENT,
    targetIdRequired: true,
    metadataSchema: aiRequestCompletedMetadataSchema,
  }),
  [AUDIT_ACTIONS.AI_REQUEST_FAILED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.AI_USAGE_EVENT,
    targetIdRequired: true,
    metadataSchema: aiRequestFailedMetadataSchema,
  }),
  [AUDIT_ACTIONS.AI_USAGE_READ]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.AI_USAGE_STREAM,
    targetIdRequired: false,
    metadataSchema: aiUsageReadMetadataSchema,
  }),
  [AUDIT_ACTIONS.DOCUMENT_CREATED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT,
    targetIdRequired: true,
    metadataSchema: documentVersionMetadataSchema,
  }),
  [AUDIT_ACTIONS.DOCUMENT_VERSION_CREATED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT_VERSION,
    targetIdRequired: true,
    metadataSchema: documentVersionMetadataSchema,
  }),
  [AUDIT_ACTIONS.DOCUMENT_CONTENT_UPLOADED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT_VERSION,
    targetIdRequired: true,
    metadataSchema: documentContentMetadataSchema,
  }),
  [AUDIT_ACTIONS.DOCUMENT_CONTENT_READ]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT_VERSION,
    targetIdRequired: true,
    metadataSchema: documentContentReadMetadataSchema,
  }),
  [AUDIT_ACTIONS.DOCUMENT_STATUS_CHANGED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT,
    targetIdRequired: true,
    metadataSchema: documentStatusMetadataSchema,
  }),
  [AUDIT_ACTIONS.DOCUMENT_DELETE_REQUESTED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT,
    targetIdRequired: true,
    metadataSchema: documentDeleteMetadataSchema,
  }),
  [AUDIT_ACTIONS.DOCUMENT_REINDEX_REQUESTED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT_VERSION,
    targetIdRequired: true,
    metadataSchema: documentReindexMetadataSchema,
  }),
  [AUDIT_ACTIONS.DOCUMENT_INGESTION_COMPLETED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT_VERSION,
    targetIdRequired: true,
    metadataSchema: documentIngestionCompletedMetadataSchema,
  }),
  [AUDIT_ACTIONS.DOCUMENT_INGESTION_FAILED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT_VERSION,
    targetIdRequired: true,
    metadataSchema: documentIngestionFailedMetadataSchema,
  }),
  [AUDIT_ACTIONS.DOCUMENT_DELETION_COMPLETED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.COMPANY_DOCUMENT,
    targetIdRequired: true,
    metadataSchema: documentDeletionCompletedMetadataSchema,
  }),
  [AUDIT_ACTIONS.DOCUMENT_RECOVERY_SCANNED]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.DOCUMENT_RECOVERY,
    targetIdRequired: false,
    metadataSchema: documentRecoveryMetadataSchema,
  }),
  [AUDIT_ACTIONS.AI_DOCUMENT_CITATION_READ]: Object.freeze({
    targetType: AUDIT_TARGET_TYPES.AI_DOCUMENT_CITATION,
    targetIdRequired: true,
    metadataSchema: aiDocumentCitationReadMetadataSchema,
  }),
});

const auditDescriptorSchema = z
  .strictObject({
    action: z.enum(Object.values(AUDIT_ACTIONS)),
    outcome: z.enum(Object.values(AUDIT_OUTCOMES)),
    actorKind: z.enum(Object.values(AUDIT_ACTOR_KINDS)),
    actorUserId: z.uuid().nullable().default(null),
    targetType: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Z][A-Z0-9_]*$/),
    targetId: z.string().trim().min(1).max(100).nullable().default(null),
    requestId: z.uuid().nullable().default(null),
    metadata: z.unknown().optional().default({}),
  })
  .superRefine((descriptor, context) => {
    if (descriptor.actorKind === AUDIT_ACTOR_KINDS.USER && !descriptor.actorUserId) {
      context.addIssue({
        code: "custom",
        path: ["actorUserId"],
        message: "A user actor requires an actor user ID",
      });
    }
    if (descriptor.actorKind !== AUDIT_ACTOR_KINDS.USER && descriptor.actorUserId) {
      context.addIssue({
        code: "custom",
        path: ["actorUserId"],
        message: "Only user actors may include an actor user ID",
      });
    }
  });

const allowedUsageCounterKeys = new Set(["inputTokens", "outputTokens", "totalTokens"]);
const forbiddenMetadataKey =
  /(password|passwd|secret|token|cookie|authorization|csrf|signature|headers?|raw.*body|request.*body|response.*body|card|cvv|cvc|paymentinstrument|address|email|phone|contact|ticket.*(?:body|content)|message.*(?:body|content))/i;

export class AuditMetadataError extends Error {
  constructor(code = "AUDIT_METADATA_REJECTED") {
    super("Audit metadata was rejected by the registered action schema");
    this.name = "AuditMetadataError";
    this.code = code;
  }
}

function assertSafeMetadataValue(value, depth = 0) {
  if (depth > 5) throw new AuditMetadataError();
  if (value === null || typeof value === "boolean" || typeof value === "string") return;
  if (typeof value === "number" && Number.isFinite(value)) return;

  if (Array.isArray(value)) {
    if (value.length > 100) throw new AuditMetadataError();
    for (const entry of value) assertSafeMetadataValue(entry, depth + 1);
    return;
  }

  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value);
    if (entries.length > 50) throw new AuditMetadataError();
    for (const [key, entry] of entries) {
      if (!allowedUsageCounterKeys.has(key) && forbiddenMetadataKey.test(key)) {
        throw new AuditMetadataError();
      }
      assertSafeMetadataValue(entry, depth + 1);
    }
    return;
  }

  throw new AuditMetadataError();
}

export function validateAuditDescriptor(input) {
  const descriptorResult = auditDescriptorSchema.safeParse(input);
  if (!descriptorResult.success) throw new AuditMetadataError("AUDIT_DESCRIPTOR_REJECTED");

  const descriptor = descriptorResult.data;
  const definition = AUDIT_ACTION_DEFINITIONS[descriptor.action];
  if (!definition || descriptor.targetType !== definition.targetType) {
    throw new AuditMetadataError("AUDIT_ACTION_TARGET_REJECTED");
  }
  if (definition.targetIdRequired !== Boolean(descriptor.targetId)) {
    throw new AuditMetadataError("AUDIT_ACTION_TARGET_REJECTED");
  }

  assertSafeMetadataValue(descriptor.metadata);
  const metadataResult = definition.metadataSchema.safeParse(descriptor.metadata);
  if (!metadataResult.success) throw new AuditMetadataError();

  const serializedMetadata = JSON.stringify(metadataResult.data);
  if (Buffer.byteLength(serializedMetadata, "utf8") > MAX_AUDIT_METADATA_BYTES) {
    throw new AuditMetadataError();
  }

  return Object.freeze({ ...descriptor, metadata: metadataResult.data });
}
