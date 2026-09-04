import { describe, expect, it } from "vitest";
import {
  aiAssistantParamsSchema,
  aiConsentBodySchema,
  customerAiResponseBodySchema,
  ownerAiResponseBodySchema,
} from "./ai.schemas.js";

describe("AI public schemas", () => {
  it("normalizes bounded customer questions", () => {
    expect(customerAiResponseBodySchema.parse({ question: "  How\n do I get support?  " })).toEqual(
      { question: "How do I get support?" },
    );
    expect(customerAiResponseBodySchema.safeParse({ question: "a".repeat(2001) }).success).toBe(
      false,
    );
    expect(customerAiResponseBodySchema.safeParse({ question: "bad\u0000value" }).success).toBe(
      false,
    );
    expect(customerAiResponseBodySchema.safeParse({ question: "", extra: true }).success).toBe(
      false,
    );
  });

  it("accepts only current assistant and notice scopes", () => {
    expect(aiAssistantParamsSchema.parse({ assistant: "customer" })).toEqual({
      assistant: "CUSTOMER",
    });
    expect(aiAssistantParamsSchema.safeParse({ assistant: "admin" }).success).toBe(false);
    expect(aiConsentBodySchema.parse({ noticeVersion: "groq-zdr-v1" })).toEqual({
      noticeVersion: "groq-zdr-v1",
    });
    expect(aiConsentBodySchema.safeParse({ noticeVersion: "old" }).success).toBe(false);
  });

  it("reuses strict bounded UTC overview ranges", () => {
    const parsed = ownerAiResponseBodySchema.parse({
      question: "Summarize this range.",
      range: {
        from: "2026-08-01T00:00:00Z",
        to: "2026-09-01T00:00:00Z",
      },
    });
    expect(parsed.range.from).toEqual(new Date("2026-08-01T00:00:00.000Z"));
    expect(parsed.range.to).toEqual(new Date("2026-09-01T00:00:00.000Z"));
    expect(
      ownerAiResponseBodySchema.safeParse({
        question: "Summarize.",
        range: {
          from: "2026-08-01T00:00:00+05:30",
          to: "2026-09-01T00:00:00Z",
        },
      }).success,
    ).toBe(false);
  });
});
