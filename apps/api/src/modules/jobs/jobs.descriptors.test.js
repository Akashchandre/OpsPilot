import { describe, expect, it } from "vitest";
import { JOB_ERROR_CODES, JOB_TYPES } from "./jobs.constants.js";
import {
  canonicalJobPayload,
  dayScheduleBucket,
  minuteScheduleBucket,
  validateJobDescriptor,
  validateJobPayload,
} from "./jobs.descriptors.js";

describe("background-job descriptors", () => {
  it("accepts strict registered payloads and canonicalizes key order", () => {
    const descriptor = validateJobDescriptor({
      type: JOB_TYPES.NOTIFICATION_ORDER_PLACED,
      dedupeKey: "order:placed:event-1",
      payload: {
        orderId: "10000000-0000-4000-8000-000000000001",
        sourceEventId: "20000000-0000-4000-8000-000000000001",
      },
    });

    expect(descriptor.schemaVersion).toBe(1);
    expect(canonicalJobPayload({ z: 1, a: 2 })).toBe('{"a":2,"z":1}');
  });

  it("rejects unknown fields and unsupported versions with safe codes", () => {
    expect(() =>
      validateJobPayload(JOB_TYPES.AUDIT_CHAIN_VERIFY, 1, {
        bucket: "2026-08-28",
        secret: "not-allowed",
      }),
    ).toThrow(expect.objectContaining({ code: JOB_ERROR_CODES.PAYLOAD_INVALID }));
    expect(() =>
      validateJobPayload(JOB_TYPES.AUDIT_CHAIN_VERIFY, 2, { bucket: "2026-08-28" }),
    ).toThrow(expect.objectContaining({ code: JOB_ERROR_CODES.SCHEMA_UNSUPPORTED }));
  });

  it("generates stable UTC schedule buckets", () => {
    const time = new Date("2026-08-28T12:34:56.789Z");
    expect(minuteScheduleBucket(time)).toBe("2026-08-28T12:34:00.000Z");
    expect(dayScheduleBucket(time)).toBe("2026-08-28");
  });
});
