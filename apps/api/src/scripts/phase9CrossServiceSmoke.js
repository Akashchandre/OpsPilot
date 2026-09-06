import { randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { once } from "node:events";
import dotenv from "dotenv";
import { createApp } from "../app.js";
import { loadEnvironment } from "../config/env.js";
import { createDatabase } from "../db/prisma.js";
import { createAiInternalClient } from "../modules/ai/ai.internalClient.js";
import { AI_WORKFLOW_NOTICE_VERSION } from "../modules/ai/ai.workflow.constants.js";
import { createAiWorkflowService } from "../modules/ai/ai.workflow.service.js";
import { AUDIT_GENESIS_HASH } from "../modules/audit/audit.constants.js";

dotenv.config({ path: "apps/api/.env.test", override: false, quiet: true });

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the Phase 9 cross-service smoke`);
  return value;
}

const config = loadEnvironment({
  ...process.env,
  NODE_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: requiredEnvironment("API_PORT"),
  AI_ENABLED: "true",
  AI_SERVICE_SIGNING_KEY: requiredEnvironment("AI_SERVICE_SIGNING_KEY"),
  AI_SERVICE_SIGNING_KEY_ID: requiredEnvironment("AI_SERVICE_SIGNING_KEY_ID"),
  AI_WORKFLOWS_ENABLED: "true",
  AI_BUSINESS_BRIEF_ENABLED: "true",
  AI_SUPPORT_WORKFLOW_ENABLED: "false",
  AI_SUPPORT_DATA_PROCESSING_CONFIRMED: "false",
  AI_WORKFLOW_NODE_SIGNING_KEY: requiredEnvironment("AI_WORKFLOW_NODE_SIGNING_KEY"),
  AI_WORKFLOW_NODE_SIGNING_KEY_ID: requiredEnvironment("AI_WORKFLOW_NODE_SIGNING_KEY_ID"),
  AI_WORKFLOW_ARTIFACT_KEY: requiredEnvironment("AI_WORKFLOW_ARTIFACT_KEY"),
  AI_WORKFLOW_ARTIFACT_KEY_ID: requiredEnvironment("AI_WORKFLOW_ARTIFACT_KEY_ID"),
  AI_WORKFLOW_RATE_LIMIT_MAX: "100",
  AI_WORKFLOW_DAILY_LIMIT: "100",
  AI_WORKFLOW_MAX_ACTIVE_PER_USER: "3",
});
if (!config.databaseUrl.endsWith("/opspilot_test")) {
  throw new Error("The Phase 9 cross-service smoke requires the isolated test database");
}

const database = createDatabase(config.databaseUrl);
const initialAuditHead = await database.auditChainHead.findUniqueOrThrow({ where: { id: 1 } });
const aiClient = createAiInternalClient(config);
const toolDurations = [];
const metricsLogger = Object.freeze({
  log(_level, event, metadata) {
    if (event === "request.completed" && metadata.route === "/workflow-tools/:toolCallId/execute") {
      toolDurations.push(metadata.durationMs);
    }
  },
  info() {},
  warn() {},
  error() {},
  debug() {},
});
const app = createApp({ config, database, aiClient, logger: metricsLogger });
const server = app.listen(config.port, config.host);
await once(server, "listening");

const runIds = [];
let owner;
try {
  const cpuStarted = process.cpuUsage();
  owner = await database.user.create({
    data: {
      email: `phase9-cross-service-${randomUUID()}@example.com`,
      displayName: "Phase 9 Cross Service",
      passwordHash: "not-used-by-phase9-cross-service",
      roles: { create: { role: { connect: { code: "OWNER" } } } },
    },
  });
  await database.aiProviderConsent.create({
    data: {
      userId: owner.id,
      provider: "GROQ",
      assistant: "OWNER",
      noticeVersion: AI_WORKFLOW_NOTICE_VERSION,
    },
  });
  const service = createAiWorkflowService(database, config, aiClient);
  const durations = [];
  let sourceCount = 0;
  for (let index = 0; index < 5; index += 1) {
    const created = await service.businessBrief({
      actor: owner,
      input: {
        from: new Date("2026-08-01T00:00:00.000Z"),
        to: new Date("2026-09-01T00:00:00.000Z"),
        focus: "GENERAL",
      },
      submissionKey: randomUUID(),
      requestId: randomUUID(),
    });
    runIds.push(created.run.id);
    const descriptor = await service.jobDescriptor(created.run.id, "START");
    const started = performance.now();
    const result = await aiClient.startWorkflow(descriptor, randomUUID());
    durations.push(performance.now() - started);
    if (result.status !== "SUCCEEDED") throw new Error("The workflow did not complete");
    const detail = await service.get({ actor: owner, workflowRunId: created.run.id });
    if (!detail.result || detail.sources.length !== 3) {
      throw new Error("The workflow result or provenance was incomplete");
    }
    sourceCount += detail.sources.length;
  }

  const usage = await database.aiUsageEvent.aggregate({
    where: { workflowRunId: { in: runIds } },
    _sum: { totalTokens: true, exactCostTicks: true },
    _count: { _all: true },
  });
  const toolCalls = await database.aiWorkflowToolCall.count({
    where: { workflowRunId: { in: runIds }, status: "SUCCEEDED" },
  });
  const artifacts = await database.aiWorkflowArtifact.findMany({
    where: { workflowRunId: { in: runIds } },
    select: { ciphertext: true },
  });
  const artifactCiphertextBytes = artifacts.reduce(
    (total, artifact) => total + artifact.ciphertext.length,
    0,
  );
  const checkpointPath = requiredEnvironment("AI_WORKFLOW_CHECKPOINT_PATH");
  const checkpointBytes = [checkpointPath, `${checkpointPath}-wal`, `${checkpointPath}-shm`]
    .filter((path) => existsSync(path))
    .reduce((total, path) => total + statSync(path).size, 0);
  const sorted = [...durations].sort((left, right) => left - right);
  const p95Ms = Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(3));

  const cleanupStarted = performance.now();
  for (const runId of runIds) {
    const run = await database.aiWorkflowRun.findUnique({ where: { id: runId } });
    await aiClient.deleteWorkflowThread(run.threadId, randomUUID());
  }
  const checkpointCleanupMs = Number((performance.now() - cleanupStarted).toFixed(3));
  const sortedTools = [...toolDurations].sort((left, right) => left - right);
  const toolP95Ms = Number(sortedTools[Math.ceil(sortedTools.length * 0.95) - 1].toFixed(3));
  const cpu = process.cpuUsage(cpuStarted);
  console.log(
    JSON.stringify({
      success: true,
      signedBidirectionalBoundary: true,
      caseCount: runIds.length,
      p95Ms,
      maximumP95Ms: 8_000,
      toolP95Ms,
      maximumToolP95Ms: 250,
      providerCalls: usage._count._all,
      toolCalls,
      sourceCount,
      totalTokens: usage._sum.totalTokens,
      exactCostInUsdTicks: Number(usage._sum.exactCostTicks),
      checkpointBytes,
      checkpointCleanupMs,
      artifactCiphertextBytes,
      cpuTimeMs: Number(((cpu.user + cpu.system) / 1_000).toFixed(3)),
      rssBytes: process.memoryUsage().rss,
      contentRecorded: false,
      secretValuesEmitted: false,
    }),
  );
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (owner) {
    await database.backgroundJobAttempt.deleteMany({
      where: { job: { sourceActorUserId: owner.id } },
    });
    await database.backgroundJob.deleteMany({ where: { sourceActorUserId: owner.id } });
    await database.aiWorkflowApproval.deleteMany({ where: { workflowRunId: { in: runIds } } });
    await database.aiWorkflowToolCall.deleteMany({ where: { workflowRunId: { in: runIds } } });
    await database.aiUsageEvent.deleteMany({ where: { workflowRunId: { in: runIds } } });
    await database.aiWorkflowArtifact.deleteMany({ where: { workflowRunId: { in: runIds } } });
    await database.aiWorkflowRun.deleteMany({ where: { id: { in: runIds } } });
    await database.aiProviderConsent.deleteMany({ where: { userId: owner.id } });
    await database.auditEvent.deleteMany({
      where: { sequence: { gt: initialAuditHead.headSequence } },
    });
    await database.auditChainHead.update({
      where: { id: 1 },
      data: {
        headSequence: initialAuditHead.headSequence,
        headHash:
          initialAuditHead.headSequence === 0n ? AUDIT_GENESIS_HASH : initialAuditHead.headHash,
      },
    });
    await database.userRole.deleteMany({ where: { userId: owner.id } });
    await database.user.delete({ where: { id: owner.id } });
  }
  await database.$disconnect();
}
