import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { AI_WORKFLOW_ARTIFACT_KINDS } from "./ai.workflow.constants.js";
import { workflowArtifactUnavailable } from "./ai.workflow.errors.js";

const maximumArtifactBytes = 64 * 1024;

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

function encode(value) {
  const bytes = Buffer.from(JSON.stringify(canonicalize(value)), "utf8");
  if (bytes.length < 1 || bytes.length > maximumArtifactBytes) throw workflowArtifactUnavailable();
  return bytes;
}

function aad({ workflowRunId, artifactId, kind, keyId }) {
  return Buffer.from(
    `opspilot-workflow-v1\n${workflowRunId}\n${artifactId}\n${kind}\n${keyId}`,
    "utf8",
  );
}

export function workflowDigest(value) {
  return createHash("sha256").update(encode(value)).digest("hex");
}

export function createWorkflowArtifactStore(config, dependencies = {}) {
  const now = dependencies.now ?? (() => new Date());
  const idFactory = dependencies.idFactory ?? randomUUID;
  const random = dependencies.randomBytes ?? randomBytes;

  function keyMaterial() {
    const encodedKey = config.ai?.workflows?.artifactKey;
    if (!encodedKey) throw workflowArtifactUnavailable();
    const key = Buffer.from(encodedKey, "base64");
    if (key.length !== 32) throw workflowArtifactUnavailable();
    return { key, keyId: config.ai.workflows.artifactKeyId };
  }

  return Object.freeze({
    async stage(transaction, { workflowRunId, kind, value, expiresAt }) {
      if (!Object.values(AI_WORKFLOW_ARTIFACT_KINDS).includes(kind)) {
        throw workflowArtifactUnavailable();
      }
      const { key, keyId } = keyMaterial();
      const artifactId = idFactory();
      const plaintext = encode(value);
      const initializationVector = random(12);
      const cipher = createCipheriv("aes-256-gcm", key, initializationVector);
      cipher.setAAD(aad({ workflowRunId, artifactId, kind, keyId }));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const authenticationTag = cipher.getAuthTag();
      return transaction.aiWorkflowArtifact.create({
        data: {
          id: artifactId,
          workflowRunId,
          kind,
          keyId,
          initializationVector,
          authenticationTag,
          ciphertext,
          plaintextSha256: createHash("sha256").update(plaintext).digest("hex"),
          byteLength: plaintext.length,
          expiresAt,
        },
      });
    },

    async read(transaction, artifact) {
      const { key, keyId } = keyMaterial();
      if (!artifact?.ciphertext || artifact.clearedAt || artifact.keyId !== keyId) {
        throw workflowArtifactUnavailable();
      }
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, artifact.initializationVector);
        decipher.setAAD(
          aad({
            workflowRunId: artifact.workflowRunId,
            artifactId: artifact.id,
            kind: artifact.kind,
            keyId,
          }),
        );
        decipher.setAuthTag(artifact.authenticationTag);
        const plaintext = Buffer.concat([decipher.update(artifact.ciphertext), decipher.final()]);
        if (
          plaintext.length !== artifact.byteLength ||
          createHash("sha256").update(plaintext).digest("hex") !== artifact.plaintextSha256
        ) {
          throw new Error("artifact integrity mismatch");
        }
        return JSON.parse(plaintext.toString("utf8"));
      } catch {
        throw workflowArtifactUnavailable();
      }
    },

    async clearExpired(transaction, timestamp = now()) {
      return transaction.aiWorkflowArtifact.updateMany({
        where: { clearedAt: null, expiresAt: { lte: timestamp } },
        data: { ciphertext: null, clearedAt: timestamp },
      });
    },
  });
}
