import { z } from "zod";
import { DOCUMENT_AUDIENCES, DOCUMENT_STATUSES } from "./document.constants.js";

// This metadata boundary intentionally rejects every ASCII/C1 control character.
// eslint-disable-next-line no-control-regex
const unsafeMetadata = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const normalizedText = (maximum) =>
  z
    .string()
    .transform((value) => value.normalize("NFC").trim())
    .pipe(
      z
        .string()
        .min(1)
        .max(maximum)
        .refine((value) => !unsafeMetadata.test(value)),
    );
const filename = normalizedText(255).refine(
  (value) => !value.includes("/") && !value.includes("\\") && value !== "." && value !== "..",
);
const audienceList = z
  .array(z.enum(Object.values(DOCUMENT_AUDIENCES)))
  .min(1)
  .max(2)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", message: "Document audiences must be unique" });
    }
  })
  .transform((values) => [...values].sort());
const documentFileMetadata = z
  .strictObject({
    filename,
    mediaType: z.enum(["text/plain", "text/markdown"]),
    language: z.literal("en"),
    audiences: audienceList,
  })
  .superRefine((value, context) => {
    const extension = value.filename.toLowerCase().endsWith(".txt")
      ? ".txt"
      : value.filename.toLowerCase().endsWith(".md")
        ? ".md"
        : null;
    const expected =
      extension === ".txt" ? "text/plain" : extension === ".md" ? "text/markdown" : null;
    if (expected !== value.mediaType) {
      context.addIssue({
        code: "custom",
        path: ["mediaType"],
        message: "Filename extension and media type must identify an approved text format",
      });
    }
  });

export const documentIdParamsSchema = z.strictObject({ documentId: z.uuid() });
export const documentVersionParamsSchema = z.strictObject({
  documentId: z.uuid(),
  versionId: z.uuid(),
});

export const documentListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["ALL", ...Object.values(DOCUMENT_STATUSES)]).default("ALL"),
});

export const createDocumentSchema = documentFileMetadata.extend({
  title: normalizedText(160),
});

export const createDocumentVersionSchema = documentFileMetadata.extend({
  version: z.number().int().min(0),
});

export const updateDocumentStatusSchema = z.strictObject({
  status: z.enum([DOCUMENT_STATUSES.ACTIVE, DOCUMENT_STATUSES.ARCHIVED]),
  version: z.number().int().min(0),
});

export const documentVersionActionSchema = z.strictObject({
  version: z.number().int().min(0),
});
