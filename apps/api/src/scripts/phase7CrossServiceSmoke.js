import { randomUUID } from "node:crypto";
import { createAiInternalClient } from "../modules/ai/ai.internalClient.js";

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the Phase 7 cross-service smoke`);
  return value;
}

const signingKey = requiredEnvironment("AI_SERVICE_SIGNING_KEY");
const signingKeyId = requiredEnvironment("AI_SERVICE_SIGNING_KEY_ID");
const serviceUrl = process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8017";
const decodedKey = Buffer.from(signingKey, "base64");
if (decodedKey.length < 32 || decodedKey.toString("base64") !== signingKey) {
  throw new Error("AI_SERVICE_SIGNING_KEY must be canonical Base64 containing at least 32 bytes");
}

const client = createAiInternalClient({
  ai: {
    enabled: true,
    serviceUrl,
    signingKey,
    signingKeyId,
    timeoutMs: 5_000,
  },
});
const health = await client.health();
if (health.status !== "ready" || health.provider !== "ready") {
  throw new Error("The cross-service mock provider is not ready");
}

const requestId = randomUUID();
const result = await client.respond(
  {
    contractVersion: 1,
    subjectId: randomUUID(),
    assistant: "CUSTOMER",
    intent: "CUSTOMER_HELP",
    question: "How do I create a support ticket?",
    context: null,
  },
  requestId,
);
if (
  result.model !== "openai/gpt-oss-120b" ||
  result.promptVersion !== "customer-help-v1" ||
  result.zeroDataRetention !== true ||
  result.outcome !== "ANSWER"
) {
  throw new Error("The cross-service response contract did not match Phase 7 policy");
}

console.log(
  JSON.stringify({
    success: true,
    health,
    model: result.model,
    promptVersion: result.promptVersion,
    outcome: result.outcome,
    zeroDataRetention: result.zeroDataRetention,
    contentRecorded: false,
    secretValuesEmitted: false,
  }),
);
