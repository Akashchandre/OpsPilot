import { randomUUID } from "node:crypto";
import { PERMISSIONS, USER_STATUSES } from "../auth/auth.constants.js";
import { authorizationInclude } from "../auth/auth.presenter.js";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_KINDS,
  AUDIT_OUTCOMES,
  AUDIT_TARGET_TYPES,
} from "../audit/audit.constants.js";
import { createAuditService } from "../audit/audit.service.js";
import { digestRequest } from "../commerce/commerce.money.js";
import { createDocumentRetrievalService } from "../documents/document.retrieval.js";
import { JOB_TYPES } from "../jobs/jobs.constants.js";
import { enqueueJob } from "../jobs/jobs.queue.js";
import { createReportsService } from "../reports/reports.service.js";
import { SUPPORT_MESSAGE_VISIBILITIES, SUPPORT_STATUSES } from "../support/support.constants.js";
import { createSupportService } from "../support/support.service.js";
import {
  AI_COST_TICKS_PER_USD_CENT,
  AI_MODEL,
  AI_PROVIDER,
  AI_USAGE_STATUSES,
} from "./ai.constants.js";
import {
  AI_WORKFLOW_APPROVAL_STATUSES,
  AI_WORKFLOW_ARTIFACT_KINDS,
  AI_WORKFLOW_CODES,
  AI_WORKFLOW_DECISIONS,
  AI_WORKFLOW_GRAPH_VERSION,
  AI_WORKFLOW_NOTICE_VERSION,
  AI_WORKFLOW_REQUIRED_PERMISSIONS,
  AI_WORKFLOW_STATUSES,
  AI_WORKFLOW_TERMINAL_STATUSES,
  AI_WORKFLOW_TOOL_CODES,
  AI_WORKFLOW_TOOL_SEQUENCES,
  AI_WORKFLOW_TOOL_STATUSES,
} from "./ai.workflow.constants.js";
import { createWorkflowArtifactStore, workflowDigest } from "./ai.workflow.crypto.js";
import {
  workflowConflict,
  workflowConsentRequired,
  workflowContextChanged,
  workflowCostCeilingReached,
  workflowDisabled,
  workflowIdempotencyConflict,
  workflowLimitReached,
  workflowNotFound,
} from "./ai.workflow.errors.js";

const workflowRunInclude = Object.freeze({
  toolCalls: { orderBy: { ordinal: "asc" } },
  approval: true,
  publishedMessage: { select: { id: true, createdAt: true } },
});
const supportReviewPermissions = Object.freeze([
  PERMISSIONS.AI_WORKFLOWS_SUPPORT_USE,
  PERMISSIONS.AI_WORKFLOWS_SUPPORT_APPROVE,
  PERMISSIONS.SUPPORT_TICKETS_READ,
  PERMISSIONS.SUPPORT_TICKETS_MANAGE,
  PERMISSIONS.ORDERS_READ,
]);

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function sumBigInt(value) {
  return value ?? 0n;
}

function permissionsFor(user) {
  return new Set(
    user.roles.flatMap((assignment) =>
      assignment.role.rolePermissions.map((entry) => entry.permission.code),
    ),
  );
}

function assistantFor(code) {
  return code === AI_WORKFLOW_CODES.BUSINESS_BRIEF ? "OWNER" : "SUPPORT";
}

function intentFor(code) {
  return code === AI_WORKFLOW_CODES.BUSINESS_BRIEF ? "OWNER_BUSINESS_BRIEF" : "SUPPORT_REPLY_DRAFT";
}

function promptVersionFor(code) {
  return code === AI_WORKFLOW_CODES.BUSINESS_BRIEF
    ? "owner-business-brief-v1"
    : "support-reply-draft-v1";
}

function workflowFeatureEnabled(config, code) {
  const workflows = config.ai?.workflows;
  return Boolean(
    workflows?.enabled &&
    (code === AI_WORKFLOW_CODES.BUSINESS_BRIEF
      ? workflows.businessBriefEnabled
      : workflows.supportEnabled && workflows.supportDataProcessingConfirmed),
  );
}

function presentRun(run, additions = {}) {
  return {
    id: run.id,
    workflowCode: run.workflowCode,
    graphVersion: run.graphVersion,
    status: run.status,
    ticketId: run.ticketId,
    range:
      run.rangeFrom && run.rangeTo
        ? { from: run.rangeFrom.toISOString(), to: run.rangeTo.toISOString() }
        : null,
    focus: run.focus,
    version: run.version,
    approval:
      run.approval === null || run.approval === undefined
        ? null
        : {
            status: run.approval.status,
            version: run.approval.version,
            draftDigest: run.approval.draftDigest,
            contextDigest: run.approval.contextDigest,
            expiresAt: run.approval.expiresAt.toISOString(),
            decidedAt: run.approval.decidedAt?.toISOString() ?? null,
          },
    publishedMessageId: run.publishedMessage?.id ?? null,
    safeErrorCode: run.safeErrorCode,
    expiresAt: run.expiresAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    ...additions,
  };
}

function isUniqueViolation(error) {
  return error?.code === "P2002";
}

export function createAiWorkflowService(
  database,
  config,
  aiClient,
  { documentStore = null, now = () => new Date(), idFactory = randomUUID } = {},
) {
  const audit = createAuditService(database, config);
  const artifacts = createWorkflowArtifactStore(config, { now, idFactory });
  const reports = createReportsService(database, config, { now });
  const support = createSupportService(database, config);
  const documents = createDocumentRetrievalService(database, config, documentStore, aiClient);

  async function currentUser(transaction, userId) {
    const user = await transaction.user.findFirst({
      where: { id: userId, status: USER_STATUSES.ACTIVE },
      include: authorizationInclude,
    });
    if (!user) throw workflowNotFound();
    return user;
  }

  async function assertRunPermission(transaction, run) {
    const user = await currentUser(transaction, run.initiatedById);
    const currentPermissions = permissionsFor(user);
    if (
      AI_WORKFLOW_REQUIRED_PERMISSIONS[run.workflowCode].some(
        (permission) => !currentPermissions.has(permission),
      )
    ) {
      throw workflowNotFound();
    }
    return user;
  }

  async function assertAuthorized(transaction, run) {
    const user = await assertRunPermission(transaction, run);
    const assistant = assistantFor(run.workflowCode);
    const consent = await transaction.aiProviderConsent.findUnique({
      where: {
        userId_provider_assistant_noticeVersion: {
          userId: run.initiatedById,
          provider: AI_PROVIDER,
          assistant,
          noticeVersion: AI_WORKFLOW_NOTICE_VERSION,
        },
      },
    });
    if (!consent || consent.revokedAt) throw workflowConsentRequired();
    if (!workflowFeatureEnabled(config, run.workflowCode)) throw workflowDisabled();
    return user;
  }

  async function assertReviewerPermission(transaction, userId) {
    const user = await currentUser(transaction, userId);
    const currentPermissions = permissionsFor(user);
    if (supportReviewPermissions.some((permission) => !currentPermissions.has(permission))) {
      throw workflowNotFound();
    }
    return user;
  }

  async function assertReviewerAuthorized(transaction, userId) {
    const user = await assertReviewerPermission(transaction, userId);
    const consent = await transaction.aiProviderConsent.findUnique({
      where: {
        userId_provider_assistant_noticeVersion: {
          userId,
          provider: AI_PROVIDER,
          assistant: "SUPPORT",
          noticeVersion: AI_WORKFLOW_NOTICE_VERSION,
        },
      },
    });
    if (!consent || consent.revokedAt) throw workflowConsentRequired();
    if (!workflowFeatureEnabled(config, AI_WORKFLOW_CODES.SUPPORT_REPLY)) {
      throw workflowDisabled();
    }
    return user;
  }

  async function supportContext(transaction, ticketId) {
    const ticket = await transaction.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        ticketNumber: true,
        category: true,
        priority: true,
        status: true,
        subject: true,
        version: true,
        requesterId: true,
        order: { select: { status: true } },
        messages: {
          where: { visibility: SUPPORT_MESSAGE_VISIBILITIES.CUSTOMER_VISIBLE },
          select: { id: true, authorUserId: true, body: true, createdAt: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 8,
        },
      },
    });
    if (!ticket) throw workflowNotFound();
    const messages = [...ticket.messages].reverse();
    const digest = workflowDigest({
      ticketId: ticket.id,
      version: ticket.version,
      status: ticket.status,
      priority: ticket.priority,
      orderStatus: ticket.order?.status ?? null,
      messages: messages.map((message) => ({
        id: message.id,
        createdAt: message.createdAt.toISOString(),
        bodyDigest: digestRequest({ body: message.body }),
      })),
    });
    return {
      digest,
      query: [ticket.subject, messages.at(-1)?.body ?? ""].join(" ").trim().slice(0, 2000),
      value: {
        ticketNumber: ticket.ticketNumber,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        subject: ticket.subject,
        order: ticket.order ? { status: ticket.order.status } : null,
        messages: messages.map((message) => ({
          role: message.authorUserId === ticket.requesterId ? "CUSTOMER" : "OPERATOR",
          body: message.body,
          createdAt: message.createdAt.toISOString(),
        })),
        asOf: now().toISOString(),
      },
    };
  }

  async function createRun({ actor, code, input, submissionKey, requestId }) {
    if (!workflowFeatureEnabled(config, code)) throw workflowDisabled();
    const normalizedInput =
      code === AI_WORKFLOW_CODES.BUSINESS_BRIEF
        ? { from: input.from.toISOString(), to: input.to.toISOString(), focus: input.focus }
        : { ticketId: input.ticketId };
    const requestHash = workflowDigest({ code, input: normalizedInput });
    const existing = await database.aiWorkflowRun.findUnique({
      where: { initiatedById_submissionKey: { initiatedById: actor.id, submissionKey } },
      include: workflowRunInclude,
    });
    if (existing) {
      if (existing.requestHash !== requestHash) throw workflowIdempotencyConflict();
      return { run: presentRun(existing, { canCancel: true }), replayed: true };
    }

    const timestamp = now();
    const expiresAt = addHours(timestamp, config.ai.workflows.runTtlHours);
    try {
      const run = await database.$transaction(
        async (transaction) => {
          const user = await currentUser(transaction, actor.id);
          const currentPermissions = permissionsFor(user);
          if (
            AI_WORKFLOW_REQUIRED_PERMISSIONS[code].some(
              (permission) => !currentPermissions.has(permission),
            )
          ) {
            throw workflowNotFound();
          }
          const consent = await transaction.aiProviderConsent.findUnique({
            where: {
              userId_provider_assistant_noticeVersion: {
                userId: actor.id,
                provider: AI_PROVIDER,
                assistant: assistantFor(code),
                noticeVersion: AI_WORKFLOW_NOTICE_VERSION,
              },
            },
          });
          if (!consent || consent.revokedAt) throw workflowConsentRequired();
          const [dailyCount, activeCount] = await Promise.all([
            transaction.aiWorkflowRun.count({
              where: { initiatedById: actor.id, createdAt: { gte: startOfUtcDay(timestamp) } },
            }),
            transaction.aiWorkflowRun.count({
              where: {
                initiatedById: actor.id,
                status: { notIn: AI_WORKFLOW_TERMINAL_STATUSES },
                expiresAt: { gt: timestamp },
              },
            }),
          ]);
          if (
            dailyCount >= config.ai.workflows.dailyMaximum ||
            activeCount >= config.ai.workflows.maximumActivePerUser
          ) {
            throw workflowLimitReached();
          }
          if (code === AI_WORKFLOW_CODES.SUPPORT_REPLY) {
            const ticket = await transaction.supportTicket.findUnique({
              where: { id: input.ticketId },
              select: { id: true, status: true },
            });
            if (!ticket || ticket.status === SUPPORT_STATUSES.CLOSED) throw workflowNotFound();
          }
          const runId = idFactory();
          const threadId = idFactory();
          const sequence = AI_WORKFLOW_TOOL_SEQUENCES[code];
          const created = await transaction.aiWorkflowRun.create({
            data: {
              id: runId,
              workflowCode: code,
              graphVersion: AI_WORKFLOW_GRAPH_VERSION,
              threadId,
              initiatedById: actor.id,
              submissionKey,
              requestHash,
              ticketId: input.ticketId ?? null,
              rangeFrom: input.from ?? null,
              rangeTo: input.to ?? null,
              focus: input.focus ?? null,
              expiresAt,
              toolCalls: {
                create: sequence.map((toolCode, index) => ({
                  id: idFactory(),
                  toolCode,
                  ordinal: index + 1,
                  inputDigest: workflowDigest({ runId, toolCode, input: normalizedInput }),
                })),
              },
            },
            include: workflowRunInclude,
          });
          await audit.append(transaction, {
            action: AUDIT_ACTIONS.AI_WORKFLOW_STARTED,
            outcome: AUDIT_OUTCOMES.SUCCESS,
            actorKind: AUDIT_ACTOR_KINDS.USER,
            actorUserId: actor.id,
            targetType: AUDIT_TARGET_TYPES.AI_WORKFLOW_RUN,
            targetId: runId,
            requestId,
            metadata: { workflowCode: code, graphVersion: AI_WORKFLOW_GRAPH_VERSION },
          });
          await enqueueJob(transaction, config, {
            type: JOB_TYPES.AI_WORKFLOW_ADVANCE,
            dedupeKey: `ai-workflow:${runId}:start`,
            payload: { workflowRunId: runId, operation: "START" },
            sourceRequestId: requestId,
            sourceActorUserId: actor.id,
          });
          return created;
        },
        { isolationLevel: "Serializable" },
      );
      return { run: presentRun(run, { canCancel: true }), replayed: false };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await database.aiWorkflowRun.findUnique({
          where: { initiatedById_submissionKey: { initiatedById: actor.id, submissionKey } },
          include: workflowRunInclude,
        });
        if (raced?.requestHash === requestHash) {
          return { run: presentRun(raced, { canCancel: true }), replayed: true };
        }
        if (raced) throw workflowIdempotencyConflict();
      }
      throw error;
    }
  }

  async function loadVisibleRun(actor, workflowRunId) {
    const run = await database.aiWorkflowRun.findUnique({
      where: { id: workflowRunId },
      include: workflowRunInclude,
    });
    if (!run) throw workflowNotFound();
    if (run.initiatedById === actor.id) {
      await assertRunPermission(database, run);
    } else if (run.workflowCode === AI_WORKFLOW_CODES.SUPPORT_REPLY) {
      await assertReviewerPermission(database, actor.id);
    } else {
      throw workflowNotFound();
    }
    return run;
  }

  async function readArtifactForRun(run, kind) {
    const artifact = await database.aiWorkflowArtifact.findFirst({
      where: { workflowRunId: run.id, kind, clearedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return artifact ? artifacts.read(database, artifact) : null;
  }

  async function readBusinessSources(run) {
    const sources = [];
    for (const toolCall of run.toolCalls) {
      if (!toolCall.outputArtifactId) continue;
      const artifact = await database.aiWorkflowArtifact.findUnique({
        where: { id: toolCall.outputArtifactId },
      });
      if (!artifact || artifact.clearedAt) continue;
      sources.push({
        toolCode: toolCall.toolCode,
        output: await artifacts.read(database, artifact),
      });
    }
    return sources;
  }

  async function readSupportFreshness(run) {
    const sources = [];
    for (const toolCall of run.toolCalls.slice(0, 2)) {
      if (!toolCall.outputArtifactId) continue;
      const artifact = await database.aiWorkflowArtifact.findUnique({
        where: { id: toolCall.outputArtifactId },
      });
      if (!artifact || artifact.clearedAt) continue;
      const output = await artifacts.read(database, artifact);
      if (typeof output.asOf === "string") {
        sources.push({ toolCode: toolCall.toolCode, asOf: output.asOf });
      }
    }
    return sources;
  }

  async function businessToolOutput(run, toolCode) {
    if (toolCode === AI_WORKFLOW_TOOL_CODES.REPORTS_OVERVIEW) {
      return reports.overview({ from: run.rangeFrom, to: run.rangeTo });
    }
    if (toolCode === AI_WORKFLOW_TOOL_CODES.INVENTORY_ATTENTION) {
      const rows = await database.$queryRaw`
        SELECT
          p.id AS productId,
          p.sku AS sku,
          p.name AS name,
          inventory.on_hand AS onHand,
          inventory.low_stock_threshold AS lowStockThreshold
        FROM inventory_balances AS inventory
        INNER JOIN products AS p ON p.id = inventory.product_id
        WHERE p.status = 'ACTIVE'
          AND inventory.on_hand <= inventory.low_stock_threshold
        ORDER BY inventory.on_hand ASC, inventory.product_id ASC
        LIMIT 20
      `;
      return {
        asOf: now().toISOString(),
        items: rows.map((row) => ({
          productId: row.productId,
          sku: row.sku,
          name: row.name,
          onHand: row.onHand,
          lowStockThreshold: row.lowStockThreshold,
        })),
      };
    }
    const timestamp = now();
    const day = 24 * 60 * 60 * 1000;
    const [status, priority, age0, age1, age4, age8] = await Promise.all([
      database.supportTicket.groupBy({ by: ["status"], _count: { _all: true } }),
      database.supportTicket.groupBy({ by: ["priority"], _count: { _all: true } }),
      database.supportTicket.count({
        where: {
          status: { not: SUPPORT_STATUSES.CLOSED },
          updatedAt: { gt: new Date(timestamp - day) },
        },
      }),
      database.supportTicket.count({
        where: {
          status: { not: SUPPORT_STATUSES.CLOSED },
          updatedAt: { gt: new Date(timestamp - 4 * day), lte: new Date(timestamp - day) },
        },
      }),
      database.supportTicket.count({
        where: {
          status: { not: SUPPORT_STATUSES.CLOSED },
          updatedAt: { gt: new Date(timestamp - 8 * day), lte: new Date(timestamp - 4 * day) },
        },
      }),
      database.supportTicket.count({
        where: {
          status: { not: SUPPORT_STATUSES.CLOSED },
          updatedAt: { lte: new Date(timestamp - 8 * day) },
        },
      }),
    ]);
    return {
      asOf: timestamp.toISOString(),
      status: Object.fromEntries(status.map((entry) => [entry.status, entry._count._all])),
      priority: Object.fromEntries(priority.map((entry) => [entry.priority, entry._count._all])),
      openAgeBuckets: { HOURS_0_24: age0, DAYS_1_3: age1, DAYS_4_7: age4, DAYS_8_PLUS: age8 },
    };
  }

  async function supportAction(run, requestId) {
    const approval = await database.aiWorkflowApproval.findUnique({
      where: { workflowRunId: run.id },
      include: { draftArtifact: true, decisionArtifact: true, reviewer: true },
    });
    if (
      !approval ||
      approval.status !== AI_WORKFLOW_APPROVAL_STATUSES.APPROVED ||
      !approval.reviewer
    ) {
      throw workflowConflict();
    }
    await assertReviewerAuthorized(database, approval.reviewer.id);
    const current = await supportContext(database, run.ticketId);
    if (current.digest !== approval.contextDigest) throw workflowContextChanged();
    const selected = approval.decisionArtifact ?? approval.draftArtifact;
    const stored = await artifacts.read(database, selected);
    const body = stored.draft;
    if (typeof body !== "string" || body.length < 1 || body.length > 4000) throw workflowConflict();
    const result = await support.addMessage({
      actor: approval.reviewer,
      ticketId: run.ticketId,
      input: { body, visibility: SUPPORT_MESSAGE_VISIBILITIES.CUSTOMER_VISIBLE },
      idempotencyKey: run.id,
      requestId,
      management: true,
      origin: "AI_ASSISTED",
      workflowRunId: run.id,
    });
    return { messageId: result.messageId, published: true };
  }

  async function calculateToolOutput(run, toolCode, requestId) {
    if (run.workflowCode === AI_WORKFLOW_CODES.BUSINESS_BRIEF) {
      return businessToolOutput(run, toolCode);
    }
    if (toolCode === AI_WORKFLOW_TOOL_CODES.SUPPORT_TICKET_PUBLIC_CONTEXT) {
      const context = await supportContext(database, run.ticketId);
      await database.aiWorkflowRun.update({
        where: { id: run.id },
        data: { contextDigest: context.digest },
      });
      return context.value;
    }
    if (toolCode === AI_WORKFLOW_TOOL_CODES.DOCUMENTS_CUSTOMER_POLICY_CONTEXT) {
      const context = await supportContext(database, run.ticketId);
      const retrieved = await documents.retrieve({
        assistant: "CUSTOMER",
        question: context.query,
      });
      return {
        asOf: now().toISOString(),
        sources: retrieved.internalContext.sources.slice(0, 3),
      };
    }
    return supportAction(run, requestId);
  }

  async function executeTool({ toolCallId, workflowRunId, toolCode, requestId }) {
    let toolCall = await database.aiWorkflowToolCall.findFirst({
      where: { id: toolCallId, workflowRunId, toolCode },
      include: { workflowRun: true, outputArtifact: true },
    });
    if (!toolCall) throw workflowNotFound();
    if (toolCall.status === AI_WORKFLOW_TOOL_STATUSES.SUCCEEDED && toolCall.outputArtifact) {
      return artifacts.read(database, toolCall.outputArtifact);
    }
    const run = toolCall.workflowRun;
    await assertAuthorized(database, run);
    const action = toolCode === AI_WORKFLOW_TOOL_CODES.SUPPORT_PUBLIC_REPLY;
    if (
      (action && run.status !== AI_WORKFLOW_STATUSES.APPROVED) ||
      (!action && run.status !== AI_WORKFLOW_STATUSES.RUNNING)
    ) {
      throw workflowConflict();
    }
    const claimed = await database.aiWorkflowToolCall.updateMany({
      where: { id: toolCall.id, status: AI_WORKFLOW_TOOL_STATUSES.PENDING },
      data: { status: AI_WORKFLOW_TOOL_STATUSES.RUNNING, startedAt: now() },
    });
    if (claimed.count !== 1) throw workflowConflict("AI_WORKFLOW_TOOL_OUTCOME_UNKNOWN");
    try {
      const output = await calculateToolOutput(run, toolCode, requestId);
      const completed = await database.$transaction(async (transaction) => {
        const artifact = await artifacts.stage(transaction, {
          workflowRunId,
          kind: AI_WORKFLOW_ARTIFACT_KINDS.TOOL_OUTPUT,
          value: output,
          expiresAt: addHours(now(), config.ai.workflows.artifactTtlHours),
        });
        await transaction.aiWorkflowToolCall.update({
          where: { id: toolCall.id },
          data: {
            status: AI_WORKFLOW_TOOL_STATUSES.SUCCEEDED,
            outputArtifactId: artifact.id,
            completedAt: now(),
          },
        });
        if (action) {
          await transaction.aiWorkflowRun.update({
            where: { id: workflowRunId },
            data: {
              status: AI_WORKFLOW_STATUSES.SUCCEEDED,
              completedAt: now(),
              version: { increment: 1 },
            },
          });
          await audit.append(transaction, {
            action: AUDIT_ACTIONS.AI_WORKFLOW_COMPLETED,
            outcome: AUDIT_OUTCOMES.SUCCESS,
            actorKind: AUDIT_ACTOR_KINDS.SYSTEM,
            targetType: AUDIT_TARGET_TYPES.AI_WORKFLOW_RUN,
            targetId: workflowRunId,
            requestId,
            metadata: { workflowCode: run.workflowCode, graphVersion: run.graphVersion },
          });
        }
        await audit.append(transaction, {
          action: AUDIT_ACTIONS.AI_WORKFLOW_TOOL_EXECUTED,
          outcome: AUDIT_OUTCOMES.SUCCESS,
          actorKind: AUDIT_ACTOR_KINDS.SYSTEM,
          targetType: AUDIT_TARGET_TYPES.AI_WORKFLOW_TOOL_CALL,
          targetId: toolCall.id,
          requestId,
          metadata: { workflowRunId, toolCode, ordinal: toolCall.ordinal },
        });
        return artifact;
      });
      toolCall = { ...toolCall, outputArtifact: completed };
      return output;
    } catch (error) {
      await database.$transaction(async (transaction) => {
        const safeErrorCode = action ? "AI_WORKFLOW_ACTION_UNKNOWN" : "AI_WORKFLOW_TOOL_FAILED";
        await transaction.aiWorkflowToolCall.updateMany({
          where: { id: toolCall.id, status: AI_WORKFLOW_TOOL_STATUSES.RUNNING },
          data: {
            status: action ? AI_WORKFLOW_TOOL_STATUSES.UNKNOWN : AI_WORKFLOW_TOOL_STATUSES.FAILED,
            safeErrorCode,
            completedAt: now(),
          },
        });
        if (action) {
          await transaction.aiWorkflowRun.updateMany({
            where: { id: workflowRunId, status: AI_WORKFLOW_STATUSES.APPROVED },
            data: {
              status: AI_WORKFLOW_STATUSES.UNKNOWN,
              safeErrorCode,
              completedAt: now(),
              version: { increment: 1 },
            },
          });
        }
        await audit.append(transaction, {
          action: AUDIT_ACTIONS.AI_WORKFLOW_TOOL_EXECUTED,
          outcome: AUDIT_OUTCOMES.FAILURE,
          actorKind: AUDIT_ACTOR_KINDS.SYSTEM,
          targetType: AUDIT_TARGET_TYPES.AI_WORKFLOW_TOOL_CALL,
          targetId: toolCall.id,
          requestId,
          metadata: {
            workflowRunId,
            toolCode,
            ordinal: toolCall.ordinal,
            safeErrorCode,
            outcomeUnknown: action,
          },
        });
      });
      throw error;
    }
  }

  async function reserveModelStep({ workflowRunId, modelStepId, requestId }) {
    const timestamp = now();
    const dayStart = startOfUtcDay(timestamp);
    const reservedCostTicks =
      BigInt(config.ai.maximumRequestCostUsdCents) * AI_COST_TICKS_PER_USD_CENT;
    const costLimitTicks =
      BigInt(config.ai.globalDailyCostLimitUsdCents) * AI_COST_TICKS_PER_USD_CENT;

    return database.$transaction(
      async (transaction) => {
        const run = await transaction.aiWorkflowRun.findUnique({
          where: { id: workflowRunId },
        });
        if (!run) throw workflowNotFound();
        await transaction.$queryRaw`SELECT id FROM users WHERE id = ${run.initiatedById} FOR UPDATE`;
        await assertAuthorized(transaction, run);
        if (run.status !== AI_WORKFLOW_STATUSES.RUNNING) throw workflowConflict();
        const existing = await transaction.aiUsageEvent.findUnique({
          where: { workflowRunId_modelStepId: { workflowRunId, modelStepId } },
        });
        if (existing) return { status: existing.status };
        const event = {
          id: idFactory(),
          userId: run.initiatedById,
          workflowRunId,
          modelStepId,
          submissionKey: modelStepId,
          provider: AI_PROVIDER,
          assistant: assistantFor(run.workflowCode),
          intent: intentFor(run.workflowCode),
          status: AI_USAGE_STATUSES.PENDING,
          promptVersion: promptVersionFor(run.workflowCode),
          model: AI_MODEL,
          reservedCostTicks,
          startedAt: timestamp,
          createdAt: timestamp,
        };
        await audit.append(transaction, {
          action: AUDIT_ACTIONS.AI_REQUEST_STARTED,
          outcome: AUDIT_OUTCOMES.SUCCESS,
          actorKind: AUDIT_ACTOR_KINDS.USER,
          actorUserId: run.initiatedById,
          targetType: AUDIT_TARGET_TYPES.AI_USAGE_EVENT,
          targetId: event.id,
          requestId,
          metadata: {
            workflowRunId,
            provider: event.provider,
            assistant: event.assistant,
            intent: event.intent,
            promptVersion: event.promptVersion,
            model: event.model,
            status: event.status,
            reservedCostTicks: Number(reservedCostTicks),
          },
        });
        const [confirmed, exposure] = await Promise.all([
          transaction.aiUsageEvent.aggregate({
            where: { status: AI_USAGE_STATUSES.SUCCEEDED, createdAt: { gte: dayStart } },
            _sum: { exactCostTicks: true },
          }),
          transaction.aiUsageEvent.aggregate({
            where: {
              status: { in: [AI_USAGE_STATUSES.PENDING, AI_USAGE_STATUSES.UNKNOWN] },
              createdAt: { gte: dayStart },
            },
            _sum: { reservedCostTicks: true },
          }),
        ]);
        const committedCost =
          sumBigInt(confirmed._sum.exactCostTicks) + sumBigInt(exposure._sum.reservedCostTicks);
        if (committedCost + reservedCostTicks > costLimitTicks) {
          throw workflowCostCeilingReached();
        }
        await transaction.aiUsageEvent.create({ data: event });
        return { status: "RESERVED" };
      },
      { isolationLevel: "Serializable" },
    );
  }

  async function finalizeModelStep({ workflowRunId, modelStepId, result, requestId }) {
    return database.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM ai_workflow_runs WHERE id = ${workflowRunId} FOR UPDATE`;
        const run = await transaction.aiWorkflowRun.findUnique({ where: { id: workflowRunId } });
        const usage = await transaction.aiUsageEvent.findUnique({
          where: { workflowRunId_modelStepId: { workflowRunId, modelStepId } },
        });
        if (!run || !usage) throw workflowNotFound();
        await assertAuthorized(transaction, run);
        if (usage.status === "SUCCEEDED") {
          const existing = await transaction.aiWorkflowArtifact.findFirst({
            where: {
              workflowRunId,
              kind: {
                in: [
                  AI_WORKFLOW_ARTIFACT_KINDS.FINAL_RESULT,
                  AI_WORKFLOW_ARTIFACT_KINDS.MODEL_DRAFT,
                ],
              },
            },
            orderBy: { createdAt: "desc" },
          });
          return { status: run.status, artifactId: existing?.id ?? null };
        }
        if (usage.status !== "PENDING" || run.status !== AI_WORKFLOW_STATUSES.RUNNING) {
          throw workflowConflict();
        }
        if (result.status !== "SUCCEEDED") {
          const workflowStatus =
            result.status === "UNKNOWN" ? AI_USAGE_STATUSES.UNKNOWN : AI_USAGE_STATUSES.FAILED;
          await audit.append(transaction, {
            action: AUDIT_ACTIONS.AI_REQUEST_FAILED,
            outcome: AUDIT_OUTCOMES.FAILURE,
            actorKind: AUDIT_ACTOR_KINDS.USER,
            actorUserId: run.initiatedById,
            targetType: AUDIT_TARGET_TYPES.AI_USAGE_EVENT,
            targetId: usage.id,
            requestId,
            metadata: {
              workflowRunId,
              provider: usage.provider,
              assistant: usage.assistant,
              intent: usage.intent,
              promptVersion: usage.promptVersion,
              model: usage.model,
              status: workflowStatus,
              safeErrorCode: result.safeErrorCode,
              durationMs: result.durationMs,
            },
          });
          await transaction.aiUsageEvent.update({
            where: { id: usage.id },
            data: {
              status: workflowStatus,
              safeErrorCode: result.safeErrorCode,
              durationMs: result.durationMs,
              completedAt: now(),
            },
          });
          await transaction.aiWorkflowRun.update({
            where: { id: run.id },
            data: {
              status: workflowStatus,
              safeErrorCode: result.safeErrorCode,
              completedAt: now(),
              version: { increment: 1 },
            },
          });
          await audit.append(transaction, {
            action: AUDIT_ACTIONS.AI_WORKFLOW_FAILED,
            outcome: AUDIT_OUTCOMES.FAILURE,
            actorKind: AUDIT_ACTOR_KINDS.SYSTEM,
            targetType: AUDIT_TARGET_TYPES.AI_WORKFLOW_RUN,
            targetId: workflowRunId,
            requestId,
            metadata: {
              safeErrorCode: result.safeErrorCode,
              outcomeUnknown: workflowStatus === AI_USAGE_STATUSES.UNKNOWN,
            },
          });
          return { status: workflowStatus, artifactId: null };
        }
        const supportReady =
          run.workflowCode === AI_WORKFLOW_CODES.SUPPORT_REPLY &&
          result.output.status === "READY_FOR_REVIEW";
        const exactCostTicks = BigInt(result.usage.costInUsdTicks);
        const costPolicyExceeded = exactCostTicks > usage.reservedCostTicks;
        await audit.append(transaction, {
          action: AUDIT_ACTIONS.AI_REQUEST_COMPLETED,
          outcome: AUDIT_OUTCOMES.SUCCESS,
          actorKind: AUDIT_ACTOR_KINDS.USER,
          actorUserId: run.initiatedById,
          targetType: AUDIT_TARGET_TYPES.AI_USAGE_EVENT,
          targetId: usage.id,
          requestId,
          metadata: {
            workflowRunId,
            provider: usage.provider,
            assistant: usage.assistant,
            intent: usage.intent,
            promptVersion: usage.promptVersion,
            model: usage.model,
            status: AI_USAGE_STATUSES.SUCCEEDED,
            outcome: result.outcome,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            totalTokens: result.usage.totalTokens,
            costInUsdTicks: result.usage.costInUsdTicks,
            durationMs: result.durationMs,
            zeroDataRetention: true,
          },
        });
        await transaction.aiUsageEvent.update({
          where: { id: usage.id },
          data: {
            status: AI_USAGE_STATUSES.SUCCEEDED,
            providerRequestId: result.providerRequestId,
            outcome: result.outcome,
            exactCostTicks,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            totalTokens: result.usage.totalTokens,
            durationMs: result.durationMs,
            completedAt: now(),
          },
        });
        if (costPolicyExceeded) {
          const safeErrorCode = "AI_COST_POLICY_EXCEEDED";
          await transaction.aiWorkflowRun.update({
            where: { id: workflowRunId },
            data: {
              status: AI_WORKFLOW_STATUSES.FAILED,
              safeErrorCode,
              completedAt: now(),
              version: { increment: 1 },
            },
          });
          await audit.append(transaction, {
            action: AUDIT_ACTIONS.AI_WORKFLOW_FAILED,
            outcome: AUDIT_OUTCOMES.FAILURE,
            actorKind: AUDIT_ACTOR_KINDS.SYSTEM,
            targetType: AUDIT_TARGET_TYPES.AI_WORKFLOW_RUN,
            targetId: workflowRunId,
            requestId,
            metadata: { safeErrorCode, outcomeUnknown: false },
          });
          return { status: AI_WORKFLOW_STATUSES.FAILED, artifactId: null };
        }
        const artifactKind = supportReady
          ? AI_WORKFLOW_ARTIFACT_KINDS.MODEL_DRAFT
          : AI_WORKFLOW_ARTIFACT_KINDS.FINAL_RESULT;
        const artifact = await artifacts.stage(transaction, {
          workflowRunId,
          kind: artifactKind,
          value: result.output,
          expiresAt: addHours(now(), config.ai.workflows.artifactTtlHours),
        });
        let status = AI_WORKFLOW_STATUSES.SUCCEEDED;
        if (supportReady) {
          if (!run.contextDigest) throw workflowConflict();
          status = AI_WORKFLOW_STATUSES.AWAITING_APPROVAL;
          const expiresAt = addMinutes(now(), config.ai.workflows.approvalTtlMinutes);
          await transaction.aiWorkflowApproval.create({
            data: {
              id: idFactory(),
              workflowRunId,
              draftArtifactId: artifact.id,
              draftDigest: artifact.plaintextSha256,
              contextDigest: run.contextDigest,
              expiresAt,
            },
          });
          await audit.append(transaction, {
            action: AUDIT_ACTIONS.AI_WORKFLOW_AWAITING_APPROVAL,
            outcome: AUDIT_OUTCOMES.SUCCESS,
            actorKind: AUDIT_ACTOR_KINDS.SYSTEM,
            targetType: AUDIT_TARGET_TYPES.AI_WORKFLOW_RUN,
            targetId: workflowRunId,
            requestId,
            metadata: { workflowCode: run.workflowCode, graphVersion: run.graphVersion },
          });
          await transaction.aiWorkflowRun.update({
            where: { id: workflowRunId },
            data: { status, approvalExpiresAt: expiresAt, version: { increment: 1 } },
          });
        } else {
          await transaction.aiWorkflowRun.update({
            where: { id: workflowRunId },
            data: { status, completedAt: now(), version: { increment: 1 } },
          });
          await audit.append(transaction, {
            action: AUDIT_ACTIONS.AI_WORKFLOW_COMPLETED,
            outcome: AUDIT_OUTCOMES.SUCCESS,
            actorKind: AUDIT_ACTOR_KINDS.SYSTEM,
            targetType: AUDIT_TARGET_TYPES.AI_WORKFLOW_RUN,
            targetId: workflowRunId,
            requestId,
            metadata: { workflowCode: run.workflowCode, graphVersion: run.graphVersion },
          });
        }
        return { status, artifactId: artifact.id };
      },
      { isolationLevel: "Serializable" },
    );
  }

  async function decide({ actor, workflowRunId, input, decisionKey, requestId }) {
    const result = await database.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM ai_workflow_runs WHERE id = ${workflowRunId} FOR UPDATE`;
        const run = await transaction.aiWorkflowRun.findFirst({
          where: { id: workflowRunId },
          include: workflowRunInclude,
        });
        if (!run || run.workflowCode !== AI_WORKFLOW_CODES.SUPPORT_REPLY || !run.approval) {
          throw workflowNotFound();
        }
        await assertReviewerAuthorized(transaction, actor.id);
        if (run.approval.decisionKey === decisionKey) {
          if (run.approval.requestHash !== workflowDigest(input))
            throw workflowIdempotencyConflict();
          return run;
        }
        if (
          run.status !== AI_WORKFLOW_STATUSES.AWAITING_APPROVAL ||
          run.approval.status !== AI_WORKFLOW_APPROVAL_STATUSES.PENDING ||
          run.version !== input.version
        ) {
          throw workflowConflict();
        }
        if (run.approval.expiresAt <= now()) throw workflowConflict("AI_WORKFLOW_APPROVAL_EXPIRED");
        const current = await supportContext(transaction, run.ticketId);
        if (current.digest !== run.approval.contextDigest) throw workflowContextChanged();

        let decisionArtifactId = null;
        if (input.decision === AI_WORKFLOW_DECISIONS.EDIT_AND_APPROVE) {
          const artifact = await artifacts.stage(transaction, {
            workflowRunId,
            kind: AI_WORKFLOW_ARTIFACT_KINDS.REVIEWER_EDIT,
            value: { draft: input.body },
            expiresAt: addHours(now(), config.ai.workflows.artifactTtlHours),
          });
          decisionArtifactId = artifact.id;
        }
        const approved = [
          AI_WORKFLOW_DECISIONS.APPROVE,
          AI_WORKFLOW_DECISIONS.EDIT_AND_APPROVE,
        ].includes(input.decision);
        const approvalStatus = approved
          ? AI_WORKFLOW_APPROVAL_STATUSES.APPROVED
          : AI_WORKFLOW_APPROVAL_STATUSES.REJECTED;
        await transaction.aiWorkflowApproval.update({
          where: { id: run.approval.id },
          data: {
            status: approvalStatus,
            reviewerId: actor.id,
            decisionKey,
            requestHash: workflowDigest(input),
            decisionArtifactId,
            decidedAt: now(),
            version: { increment: 1 },
          },
        });
        const nextStatus = approved
          ? AI_WORKFLOW_STATUSES.APPROVED
          : AI_WORKFLOW_STATUSES.CANCELLED;
        const updated = await transaction.aiWorkflowRun.update({
          where: { id: run.id },
          data: {
            status: nextStatus,
            completedAt: approved ? null : now(),
            version: { increment: 1 },
          },
          include: workflowRunInclude,
        });
        await audit.append(transaction, {
          action: AUDIT_ACTIONS.AI_WORKFLOW_DECIDED,
          outcome: AUDIT_OUTCOMES.SUCCESS,
          actorKind: AUDIT_ACTOR_KINDS.USER,
          actorUserId: actor.id,
          targetType: AUDIT_TARGET_TYPES.AI_WORKFLOW_APPROVAL,
          targetId: run.approval.id,
          requestId,
          metadata: { workflowRunId, decision: input.decision },
        });
        if (approved) {
          await enqueueJob(transaction, config, {
            type: JOB_TYPES.AI_WORKFLOW_ADVANCE,
            dedupeKey: `ai-workflow:${run.id}:resume:${updated.version}`,
            payload: { workflowRunId: run.id, operation: "RESUME" },
            sourceRequestId: requestId,
            sourceActorUserId: actor.id,
          });
        }
        return updated;
      },
      { isolationLevel: "Serializable" },
    );
    return presentRun(result);
  }

  return Object.freeze({
    businessBrief(input) {
      return createRun({ ...input, code: AI_WORKFLOW_CODES.BUSINESS_BRIEF });
    },
    supportReply(input) {
      return createRun({ ...input, code: AI_WORKFLOW_CODES.SUPPORT_REPLY });
    },
    async list({ actor, query }) {
      const user = await currentUser(database, actor.id);
      const currentPermissions = permissionsFor(user);
      const scopes = [];
      if (
        AI_WORKFLOW_REQUIRED_PERMISSIONS[AI_WORKFLOW_CODES.BUSINESS_BRIEF].every((permission) =>
          currentPermissions.has(permission),
        )
      ) {
        scopes.push({
          workflowCode: AI_WORKFLOW_CODES.BUSINESS_BRIEF,
          initiatedById: actor.id,
        });
      }
      const supportStartAllowed = AI_WORKFLOW_REQUIRED_PERMISSIONS[
        AI_WORKFLOW_CODES.SUPPORT_REPLY
      ].every((permission) => currentPermissions.has(permission));
      const supportReviewAllowed = supportReviewPermissions.every((permission) =>
        currentPermissions.has(permission),
      );
      if (supportStartAllowed) {
        scopes.push(
          supportReviewAllowed
            ? { workflowCode: AI_WORKFLOW_CODES.SUPPORT_REPLY }
            : { workflowCode: AI_WORKFLOW_CODES.SUPPORT_REPLY, initiatedById: actor.id },
        );
      }
      const where = {
        AND: [
          scopes.length > 0 ? { OR: scopes } : { id: "00000000-0000-0000-0000-000000000000" },
          ...(query.workflowCode ? [{ workflowCode: query.workflowCode }] : []),
        ],
        ...(query.status ? { status: query.status } : {}),
      };
      const [runs, total] = await database.$transaction([
        database.aiWorkflowRun.findMany({
          where,
          include: workflowRunInclude,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        database.aiWorkflowRun.count({ where }),
      ]);
      return {
        runs: runs.map((run) => presentRun(run, { canCancel: run.initiatedById === actor.id })),
        meta: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      };
    },
    async get({ actor, workflowRunId }) {
      const run = await loadVisibleRun(actor, workflowRunId);
      const additions = {};
      additions.canCancel = run.initiatedById === actor.id;
      if (run.status === AI_WORKFLOW_STATUSES.SUCCEEDED) {
        additions.result = await readArtifactForRun(run, AI_WORKFLOW_ARTIFACT_KINDS.FINAL_RESULT);
        if (run.workflowCode === AI_WORKFLOW_CODES.BUSINESS_BRIEF) {
          additions.sources = await readBusinessSources(run);
        }
      }
      if (run.status === AI_WORKFLOW_STATUSES.AWAITING_APPROVAL) {
        additions.draft = await readArtifactForRun(run, AI_WORKFLOW_ARTIFACT_KINDS.MODEL_DRAFT);
        additions.sourceFreshness = await readSupportFreshness(run);
      }
      return presentRun(run, additions);
    },
    decide,
    async cancel({ actor, workflowRunId, version, decisionKey, requestId }) {
      const run = await database.$transaction(
        async (transaction) => {
          await transaction.$queryRaw`SELECT id FROM ai_workflow_runs WHERE id = ${workflowRunId} FOR UPDATE`;
          const current = await transaction.aiWorkflowRun.findFirst({
            where: { id: workflowRunId, initiatedById: actor.id },
            include: workflowRunInclude,
          });
          if (!current) throw workflowNotFound();
          await assertRunPermission(transaction, current);
          if (AI_WORKFLOW_TERMINAL_STATUSES.includes(current.status)) return current;
          if (current.version !== version) throw workflowConflict();
          if (current.approval?.status === AI_WORKFLOW_APPROVAL_STATUSES.PENDING) {
            await transaction.aiWorkflowApproval.update({
              where: { id: current.approval.id },
              data: {
                status: AI_WORKFLOW_APPROVAL_STATUSES.CANCELLED,
                reviewerId: actor.id,
                decisionKey,
                requestHash: workflowDigest({ version }),
                decidedAt: now(),
                version: { increment: 1 },
              },
            });
          }
          const updated = await transaction.aiWorkflowRun.update({
            where: { id: current.id },
            data: {
              status: AI_WORKFLOW_STATUSES.CANCELLED,
              completedAt: now(),
              version: { increment: 1 },
            },
            include: workflowRunInclude,
          });
          await audit.append(transaction, {
            action: AUDIT_ACTIONS.AI_WORKFLOW_CANCELLED,
            outcome: AUDIT_OUTCOMES.SUCCESS,
            actorKind: AUDIT_ACTOR_KINDS.USER,
            actorUserId: actor.id,
            targetType: AUDIT_TARGET_TYPES.AI_WORKFLOW_RUN,
            targetId: current.id,
            requestId,
            metadata: { workflowCode: current.workflowCode },
          });
          return updated;
        },
        { isolationLevel: "Serializable" },
      );
      return presentRun(run);
    },
    executeTool,
    reserveModelStep,
    finalizeModelStep,
    async jobDescriptor(workflowRunId, operation) {
      const run = await database.aiWorkflowRun.findUnique({
        where: { id: workflowRunId },
        include: { toolCalls: { orderBy: { ordinal: "asc" } } },
      });
      if (!run) throw workflowNotFound();
      await assertAuthorized(database, run);
      const expected =
        operation === "START" ? AI_WORKFLOW_STATUSES.QUEUED : AI_WORKFLOW_STATUSES.APPROVED;
      if (run.status !== expected) {
        if (
          AI_WORKFLOW_TERMINAL_STATUSES.includes(run.status) ||
          run.status === AI_WORKFLOW_STATUSES.AWAITING_APPROVAL
        ) {
          return null;
        }
        throw workflowConflict();
      }
      await database.aiWorkflowRun.update({
        where: { id: run.id },
        data: {
          status: operation === "START" ? AI_WORKFLOW_STATUSES.RUNNING : run.status,
          startedAt: run.startedAt ?? now(),
          version: { increment: 1 },
        },
      });
      return {
        contractVersion: 1,
        workflowRunId: run.id,
        workflowCode: run.workflowCode,
        graphVersion: run.graphVersion,
        threadId: run.threadId,
        modelStepId: run.id,
        toolCalls: run.toolCalls.map((call) => ({ id: call.id, code: call.toolCode })),
      };
    },
    async failRun(workflowRunId, code, unknown = false, requestId = randomUUID()) {
      const timestamp = now();
      await database.$transaction(async (transaction) => {
        const run = await transaction.aiWorkflowRun.findUnique({ where: { id: workflowRunId } });
        if (
          !run ||
          ![AI_WORKFLOW_STATUSES.RUNNING, AI_WORKFLOW_STATUSES.APPROVED].includes(run.status)
        ) {
          return;
        }
        const workflowStatus = unknown ? AI_WORKFLOW_STATUSES.UNKNOWN : AI_WORKFLOW_STATUSES.FAILED;
        const usageStatus = unknown ? AI_USAGE_STATUSES.UNKNOWN : AI_USAGE_STATUSES.FAILED;
        const pendingUsage = await transaction.aiUsageEvent.findMany({
          where: { workflowRunId, status: AI_USAGE_STATUSES.PENDING },
        });
        for (const usage of pendingUsage) {
          const durationMs = Math.min(
            60_000,
            Math.max(0, timestamp.getTime() - usage.startedAt.getTime()),
          );
          await transaction.aiUsageEvent.update({
            where: { id: usage.id },
            data: {
              status: usageStatus,
              safeErrorCode: code,
              durationMs,
              completedAt: timestamp,
            },
          });
          await audit.append(transaction, {
            action: AUDIT_ACTIONS.AI_REQUEST_FAILED,
            outcome: AUDIT_OUTCOMES.FAILURE,
            actorKind: AUDIT_ACTOR_KINDS.SYSTEM,
            targetType: AUDIT_TARGET_TYPES.AI_USAGE_EVENT,
            targetId: usage.id,
            requestId,
            metadata: {
              workflowRunId,
              provider: usage.provider,
              assistant: usage.assistant,
              intent: usage.intent,
              promptVersion: usage.promptVersion,
              model: usage.model,
              status: usageStatus,
              safeErrorCode: code,
              durationMs,
            },
          });
        }
        await transaction.aiWorkflowRun.update({
          where: { id: workflowRunId },
          data: {
            status: workflowStatus,
            safeErrorCode: code,
            completedAt: timestamp,
            version: { increment: 1 },
          },
        });
        await audit.append(transaction, {
          action: AUDIT_ACTIONS.AI_WORKFLOW_FAILED,
          outcome: AUDIT_OUTCOMES.FAILURE,
          actorKind: AUDIT_ACTOR_KINDS.SYSTEM,
          targetType: AUDIT_TARGET_TYPES.AI_WORKFLOW_RUN,
          targetId: workflowRunId,
          requestId,
          metadata: { safeErrorCode: code, outcomeUnknown: unknown },
        });
      });
    },
    async retentionSweep() {
      const timestamp = now();
      return database.$transaction(async (transaction) => {
        const expiredRuns = await transaction.aiWorkflowRun.updateMany({
          where: {
            status: { notIn: AI_WORKFLOW_TERMINAL_STATUSES },
            expiresAt: { lte: timestamp },
          },
          data: {
            status: AI_WORKFLOW_STATUSES.EXPIRED,
            completedAt: timestamp,
            version: { increment: 1 },
          },
        });
        const expiredApprovals = await transaction.aiWorkflowApproval.updateMany({
          where: { status: AI_WORKFLOW_APPROVAL_STATUSES.PENDING, expiresAt: { lte: timestamp } },
          data: {
            status: AI_WORKFLOW_APPROVAL_STATUSES.EXPIRED,
            decisionKey: idFactory(),
            requestHash: workflowDigest({ reason: "EXPIRED" }),
            decidedAt: timestamp,
            version: { increment: 1 },
          },
        });
        const clearedArtifacts = await artifacts.clearExpired(transaction, timestamp);
        return {
          expiredRuns: expiredRuns.count,
          expiredApprovals: expiredApprovals.count,
          clearedArtifacts: clearedArtifacts.count,
        };
      });
    },
    async recordRetention(result, requestId = randomUUID()) {
      await database.$transaction((transaction) =>
        audit.append(transaction, {
          action: AUDIT_ACTIONS.AI_WORKFLOW_RETENTION_APPLIED,
          outcome: AUDIT_OUTCOMES.SUCCESS,
          actorKind: AUDIT_ACTOR_KINDS.SYSTEM,
          targetType: AUDIT_TARGET_TYPES.AI_WORKFLOW_RUN,
          targetId: null,
          requestId,
          metadata: result,
        }),
      );
    },
    async checkpointCandidates() {
      const cutoff = new Date(now().getTime() - 60 * 60 * 1000);
      return database.aiWorkflowRun.findMany({
        where: {
          status: { in: AI_WORKFLOW_TERMINAL_STATUSES },
          completedAt: { lte: cutoff },
          checkpointDeletedAt: null,
        },
        select: { id: true, threadId: true },
        orderBy: { completedAt: "asc" },
        take: 10,
      });
    },
    async markCheckpointDeleted(workflowRunId) {
      await database.aiWorkflowRun.updateMany({
        where: { id: workflowRunId, checkpointDeletedAt: null },
        data: { checkpointDeletedAt: now() },
      });
    },
  });
}
