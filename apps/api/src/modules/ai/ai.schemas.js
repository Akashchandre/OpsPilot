import { z } from "zod";
import { overviewQuerySchema } from "../reports/reports.schemas.js";
import {
  AI_ASSISTANTS,
  AI_DOCUMENT_NOTICE_VERSION,
  AI_NOTICE_VERSION,
  AI_SAFE_NOTICES,
} from "./ai.constants.js";

const forbiddenControlCharacter = /\p{C}/u;

const normalizedQuestionSchema = z
  .string()
  .max(4000)
  .transform((value) => value.normalize("NFC").replace(/\s+/gu, " ").trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(2000)
      .refine((value) => !forbiddenControlCharacter.test(value), {
        message: "The question contains unsupported characters",
      }),
  );

export const aiAssistantParamsSchema = z.strictObject({
  assistant: z.enum(["customer", "owner"]).transform((value) => value.toUpperCase()),
});

export const aiConsentBodySchema = z.strictObject({
  noticeVersion: z.literal(AI_NOTICE_VERSION),
});

export const aiDocumentConsentBodySchema = z.strictObject({
  noticeVersion: z.literal(AI_DOCUMENT_NOTICE_VERSION),
});

export const documentAiResponseBodySchema = z.strictObject({
  question: normalizedQuestionSchema,
});

export const aiDocumentCitationParamsSchema = z.strictObject({ citationId: z.uuid() });

export const customerAiResponseBodySchema = z.strictObject({
  question: normalizedQuestionSchema,
});

export const ownerAiResponseBodySchema = z.strictObject({
  question: normalizedQuestionSchema,
  range: overviewQuerySchema.optional().default({}),
});

export const aiUsageQuerySchema = overviewQuerySchema;

export const aiAssistantSchema = z.enum(Object.values(AI_ASSISTANTS));
export const aiSafeNoticeSchema = z.enum(Object.values(AI_SAFE_NOTICES));
