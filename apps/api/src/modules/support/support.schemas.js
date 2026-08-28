import { z } from "zod";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_MESSAGE_VISIBILITIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  SUPPORT_VIEWS,
} from "./support.constants.js";

function normalizeSubject(value) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function normalizeMessage(value) {
  return value.normalize("NFKC").replace(/\r\n?/g, "\n").trim();
}

function containsForbiddenControlCharacter(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint === 0x7f ||
      (codePoint >= 0 && codePoint <= 0x08) ||
      codePoint === 0x0b ||
      codePoint === 0x0c ||
      (codePoint >= 0x0e && codePoint <= 0x1f)
    );
  });
}

const safePlainText = (minimum, maximum, normalize) =>
  z
    .string()
    .transform(normalize)
    .pipe(
      z
        .string()
        .min(minimum)
        .max(maximum)
        .refine((value) => !containsForbiddenControlCharacter(value), {
          message: "Control characters are not allowed",
        }),
    );

const subjectSchema = safePlainText(5, 160, normalizeSubject);
const messageSchema = safePlainText(1, 4000, normalizeMessage);
const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const supportTicketIdParamsSchema = z.strictObject({ ticketId: z.uuid() });

export const createSupportTicketSchema = z.strictObject({
  category: z.enum(Object.values(SUPPORT_CATEGORIES)),
  subject: subjectSchema,
  message: messageSchema,
  orderId: z.uuid().optional(),
});

export const supportTicketListQuerySchema = z
  .strictObject({
    ...pagination,
    view: z.enum(Object.values(SUPPORT_VIEWS)).default(SUPPORT_VIEWS.SELF),
    status: z.enum(["ALL", ...Object.values(SUPPORT_STATUSES)]).default("ALL"),
    priority: z.enum(["ALL", ...Object.values(SUPPORT_PRIORITIES)]).default("ALL"),
    category: z.enum(["ALL", ...Object.values(SUPPORT_CATEGORIES)]).default("ALL"),
    assignee: z.union([z.uuid(), z.literal("UNASSIGNED")]).optional(),
    requester: z.uuid().optional(),
    search: z.string().trim().min(1).max(160).optional(),
    sort: z
      .enum(["createdAt", "updatedAt", "ticketNumber", "status", "priority"])
      .default("updatedAt"),
    direction: z.enum(["asc", "desc"]).default("desc"),
  })
  .superRefine((query, context) => {
    if (
      query.view !== SUPPORT_VIEWS.MANAGEMENT &&
      (query.assignee !== undefined || query.requester !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: [query.assignee !== undefined ? "assignee" : "requester"],
        message: "This filter is available only in the management view",
      });
    }
  });

export const supportTicketDetailQuerySchema = z.strictObject({
  view: z.enum(Object.values(SUPPORT_VIEWS)).default(SUPPORT_VIEWS.SELF),
});

export const createSupportMessageSchema = z.strictObject({
  body: messageSchema,
  visibility: z
    .enum(Object.values(SUPPORT_MESSAGE_VISIBILITIES))
    .default(SUPPORT_MESSAGE_VISIBILITIES.CUSTOMER_VISIBLE),
});

export const closeSupportTicketSchema = z.strictObject({
  version: z.number().int().min(0),
});

export const updateSupportTicketSchema = z
  .strictObject({
    version: z.number().int().min(0),
    status: z.enum(Object.values(SUPPORT_STATUSES)).optional(),
    priority: z.enum(Object.values(SUPPORT_PRIORITIES)).optional(),
    assigneeId: z.uuid().nullable().optional(),
  })
  .refine(
    (input) =>
      input.status !== undefined || input.priority !== undefined || input.assigneeId !== undefined,
    { message: "At least one ticket change is required" },
  );
