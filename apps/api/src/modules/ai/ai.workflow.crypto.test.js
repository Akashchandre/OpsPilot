import { describe, expect, it, vi } from "vitest";
import { createWorkflowArtifactStore, workflowDigest } from "./ai.workflow.crypto.js";

const workflowRunId = "10000000-0000-4000-8000-000000000001";
const artifactId = "20000000-0000-4000-8000-000000000001";
const key = Buffer.alloc(32, 0x41).toString("base64");
const config = {
  ai: { workflows: { artifactKey: key, artifactKeyId: "workflow-artifacts-v1" } },
};

describe("AI workflow artifact encryption", () => {
  it("encrypts deterministic canonical JSON with authenticated context and detects tampering", async () => {
    let artifact;
    const transaction = {
      aiWorkflowArtifact: {
        create: vi.fn(async ({ data }) => {
          artifact = { ...data, clearedAt: null };
          return artifact;
        }),
      },
    };
    const store = createWorkflowArtifactStore(config, {
      idFactory: () => artifactId,
      randomBytes: () => Buffer.alloc(12, 0x12),
    });
    const value = { nested: { z: 1, a: true }, label: "safe" };

    await store.stage(transaction, {
      workflowRunId,
      kind: "FINAL_RESULT",
      value,
      expiresAt: new Date("2026-09-07T00:00:00.000Z"),
    });

    expect(artifact.ciphertext.toString("utf8")).not.toContain("safe");
    expect(artifact.plaintextSha256).toBe(workflowDigest(value));
    await expect(store.read(transaction, artifact)).resolves.toEqual(value);

    const tampered = { ...artifact, ciphertext: Buffer.from(artifact.ciphertext) };
    tampered.ciphertext[0] ^= 0xff;
    await expect(store.read(transaction, tampered)).rejects.toMatchObject({
      code: "AI_WORKFLOW_ARTIFACT_UNAVAILABLE",
    });
    await expect(
      store.read(transaction, { ...artifact, workflowRunId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: "AI_WORKFLOW_ARTIFACT_UNAVAILABLE" });
  });

  it("clears expired ciphertext and rejects oversized artifacts", async () => {
    const updateMany = vi.fn(async () => ({ count: 2 }));
    const store = createWorkflowArtifactStore(config, { idFactory: () => artifactId });
    const timestamp = new Date("2026-09-07T00:00:00.000Z");
    await expect(
      store.clearExpired({ aiWorkflowArtifact: { updateMany } }, timestamp),
    ).resolves.toEqual({ count: 2 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { clearedAt: null, expiresAt: { lte: timestamp } },
      data: { ciphertext: null, clearedAt: timestamp },
    });
    await expect(
      store.stage(
        { aiWorkflowArtifact: { create: vi.fn() } },
        {
          workflowRunId,
          kind: "TOOL_OUTPUT",
          value: { content: "x".repeat(70_000) },
          expiresAt: timestamp,
        },
      ),
    ).rejects.toMatchObject({ code: "AI_WORKFLOW_ARTIFACT_UNAVAILABLE" });
  });
});
