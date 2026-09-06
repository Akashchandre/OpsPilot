import { describe, expect, it } from "vitest";
import {
  businessBriefRunBodySchema,
  workflowDecisionBodySchema,
  workflowRunListQuerySchema,
} from "./ai.workflow.schemas.js";

describe("AI workflow public schemas", () => {
  it("accepts only bounded UTC business ranges and fixed focuses", () => {
    const parsed = businessBriefRunBodySchema.parse({
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
      focus: "INVENTORY",
    });
    expect(parsed.focus).toBe("INVENTORY");
    expect(parsed.from).toBeInstanceOf(Date);
    expect(
      businessBriefRunBodySchema.safeParse({
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-09-01T00:00:00.000Z",
        focus: "FORECAST",
      }).success,
    ).toBe(false);
    expect(
      businessBriefRunBodySchema.safeParse({
        from: "2026-09-01T00:00:00Z",
        to: "2026-09-02T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("binds edited text only to edit-and-approve and normalizes safe plain text", () => {
    expect(
      workflowDecisionBodySchema.parse({
        decision: "EDIT_AND_APPROVE",
        version: 2,
        body: "  Customer reply\r\nline two  ",
      }),
    ).toEqual({ decision: "EDIT_AND_APPROVE", version: 2, body: "Customer reply\nline two" });
    expect(
      workflowDecisionBodySchema.safeParse({
        decision: "APPROVE",
        version: 2,
        body: "hidden override",
      }).success,
    ).toBe(false);
    expect(
      workflowDecisionBodySchema.safeParse({ decision: "EDIT_AND_APPROVE", version: 2 }).success,
    ).toBe(false);
  });

  it("rejects unknown list controls and caps result pages", () => {
    expect(workflowRunListQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(workflowRunListQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(workflowRunListQuerySchema.safeParse({ ownerId: crypto.randomUUID() }).success).toBe(
      false,
    );
  });
});
