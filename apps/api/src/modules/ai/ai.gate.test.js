import { describe, expect, it } from "vitest";
import { InFlightGate } from "./ai.gate.js";

describe("AI in-flight gate", () => {
  it("rejects work above the local concurrency ceiling and releases every slot", async () => {
    const gate = new InFlightGate(1);
    let release;
    const blocked = new Promise((resolve) => {
      release = resolve;
    });
    const first = gate.run(() => blocked);
    await Promise.resolve();

    await expect(gate.run(async () => "second")).rejects.toMatchObject({
      statusCode: 429,
      code: "AI_CONCURRENCY_LIMIT_REACHED",
    });

    release("first");
    await expect(first).resolves.toBe("first");
    await expect(gate.run(async () => "after")).resolves.toBe("after");
  });
});
