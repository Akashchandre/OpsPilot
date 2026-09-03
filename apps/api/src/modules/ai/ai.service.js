import { randomUUID } from "node:crypto";
import { AppError } from "../../errors/AppError.js";
import { authorizationInclude } from "../auth/auth.presenter.js";
import { USER_STATUSES } from "../auth/auth.constants.js";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_KINDS,
  AUDIT_OUTCOMES,
  AUDIT_TARGET_TYPES,
} from "../audit/audit.constants.js";
import { createAuditService } from "../audit/audit.service.js";
import { createReportsService } from "../reports/reports.service.js";
import {
  AI_ASSISTANTS,
  AI_COST_TICKS_PER_USD_CENT,
  AI_INTERNAL_CONTRACT_VERSION,
  AI_MODEL,
  AI_NOTICE_VERSION,
  AI_PROVIDER,
  AI_USAGE_STATUSES,
  policyForAssistant,
} from "./ai.constants.js";
import {
  aiAuthorizationChanged,
  aiConsentRequired,
  aiCostPolicyExceeded,
  aiContextUnavailable,
  aiCostCeilingReached,
  aiDailyQuotaReached,
  aiDisabled,
  aiProviderUnavailable,
  aiRecordingFailed,
  aiRequestInFlight,
  aiSubmissionConsumed,
} from "./ai.errors.js";
import { InFlightGate } from "./ai.gate.js";
import { AiInternalClientError } from "./ai.internalClient.js";

const safeErrorCodePattern = /^[A-Z][A-Z0-9_]{0,63}$/;

function startOfUtcDay(timestamp) {
  return new Date(
    Date.UTC(timestamp.getUTCFullYear(), timestamp.getUTCMonth(), timestamp.getUTCDate()),
  );
}

function permissionSet(user) {
  return new Set(
    user?.roles.flatMap((assignment) =>
      assignment.role.rolePermissions.map((entry) => entry.permission.code),
    ) ?? [],
  );
}

function requiredPermissions(policy) {
  return [policy.permission, ...(policy.additionalPermissions ?? [])];
}

function isAuthorized(user, policy) {
  if (!user || user.status !== USER_STATUSES.ACTIVE) return false;
  const permissions = permissionSet(user);
  return requiredPermissions(policy).every((permission) => permissions.has(permission));
}

async function lockUser(transaction, userId) {
  await transaction.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
}

async function currentUser(transaction, userId) {
  return transaction.user.findUnique({
    where: { id: userId },
    include: authorizationInclude,
  });
}

async function hasCurrentConsent(transaction, userId, assistant) {
  const consent = await transaction.aiProviderConsent.findUnique({
    where: {
      userId_provider_assistant_noticeVersion: {
        userId,
        provider: AI_PROVIDER,
        assistant,
        noticeVersion: AI_NOTICE_VERSION,
      },
    },
    select: { revokedAt: true },
  });
  return Boolean(consent && !consent.revokedAt);
}

function auditIdentity(event) {
  return {
    provider: event.provider,
    assistant: event.assistant,
    intent: event.intent,
    promptVersion: event.promptVersion,
    model: event.model,
  };
}

function durationSince(startedAt) {
  return Math.min(60_000, Math.max(0, Date.now() - startedAt));
}

function safeErrorCode(code) {
  return typeof code === "string" && safeErrorCodePattern.test(code)
    ? code
    : "AI_SERVICE_UNAVAILABLE";
}

function sumBigInt(value) {
  return value ?? 0n;
}

function formatUsdTicks(value) {
  const ticksPerUsd = 10_000_000_000n;
  const whole = value / ticksPerUsd;
  const fraction = (value % ticksPerUsd).toString().padStart(10, "0");
  return `${whole}.${fraction}`;
}

export function createAiService(database, config, internalClient, dependencies = {}) {
  const audit = createAuditService(database, config);
  const reports = dependencies.reports ?? createReportsService(database, config);
  const now = dependencies.now ?? (() => new Date());
  const idFactory = dependencies.idFactory ?? randomUUID;
  const gate = dependencies.gate ?? new InFlightGate(config.ai?.maximumConcurrency ?? 4);

  function assertEnabled() {
    if (!config.ai?.enabled) throw aiDisabled();
  }

  async function recoverStalePending(transaction, userId, timestamp, requestId) {
    const staleBefore = new Date(timestamp.getTime() - config.ai.timeoutMs - 5_000);
    const staleEvents = await transaction.aiUsageEvent.findMany({
      where: {
        userId,
        status: AI_USAGE_STATUSES.PENDING,
        startedAt: { lte: staleBefore },
      },
    });
    for (const event of staleEvents) {
      const durationMs = Math.min(60_000, Math.max(0, timestamp - event.startedAt));
      await audit.append(transaction, {
        action: AUDIT_ACTIONS.AI_REQUEST_FAILED,
        outcome: AUDIT_OUTCOMES.FAILURE,
        actorKind: AUDIT_ACTOR_KINDS.USER,
        actorUserId: userId,
        targetType: AUDIT_TARGET_TYPES.AI_USAGE_EVENT,
        targetId: event.id,
        requestId,
        metadata: {
          ...auditIdentity(event),
          status: AI_USAGE_STATUSES.UNKNOWN,
          safeErrorCode: "AI_PENDING_RECOVERED",
          durationMs,
        },
      });
      await transaction.aiUsageEvent.update({
        where: { id: event.id },
        data: {
          status: AI_USAGE_STATUSES.UNKNOWN,
          safeErrorCode: "AI_PENDING_RECOVERED",
          durationMs,
          completedAt: timestamp,
        },
      });
    }
  }

  async function reserve({ userId, assistant, submissionKey, requestId }) {
    const policy = policyForAssistant(assistant);
    const timestamp = now();
    const dayStart = startOfUtcDay(timestamp);
    const reservedCostTicks =
      BigInt(config.ai.maximumRequestCostUsdCents) * AI_COST_TICKS_PER_USD_CENT;
    const costLimitTicks =
      BigInt(config.ai.globalDailyCostLimitUsdCents) * AI_COST_TICKS_PER_USD_CENT;
    const eventId = idFactory();

    return database.$transaction(
      async (transaction) => {
        await lockUser(transaction, userId);
        await recoverStalePending(transaction, userId, timestamp, requestId);

        const user = await currentUser(transaction, userId);
        if (!isAuthorized(user, policy)) throw aiAuthorizationChanged();

        const existing = await transaction.aiUsageEvent.findUnique({
          where: { userId_submissionKey: { userId, submissionKey } },
          select: { id: true },
        });
        if (existing) throw aiSubmissionConsumed();
        if (!(await hasCurrentConsent(transaction, userId, assistant))) {
          throw aiConsentRequired();
        }

        const dailyMaximum = config.ai[policy.configKey].dailyMaximum;
        const dailyCount = await transaction.aiUsageEvent.count({
          where: { userId, assistant, createdAt: { gte: dayStart } },
        });
        if (dailyCount >= dailyMaximum) throw aiDailyQuotaReached();

        const activeCount = await transaction.aiUsageEvent.count({
          where: { userId, status: AI_USAGE_STATUSES.PENDING },
        });
        if (activeCount > 0) throw aiRequestInFlight();

        const pendingEvent = {
          id: eventId,
          userId,
          submissionKey,
          provider: AI_PROVIDER,
          assistant,
          intent: policy.intent,
          status: AI_USAGE_STATUSES.PENDING,
          promptVersion: policy.promptVersion,
          model: AI_MODEL,
          reservedCostTicks,
          startedAt: timestamp,
          createdAt: timestamp,
        };

        // Appending first takes the existing global audit-chain lock. This serializes the
        // following cost check and reservation without adding a third Phase 7 table.
        await audit.append(transaction, {
          action: AUDIT_ACTIONS.AI_REQUEST_STARTED,
          outcome: AUDIT_OUTCOMES.SUCCESS,
          actorKind: AUDIT_ACTOR_KINDS.USER,
          actorUserId: userId,
          targetType: AUDIT_TARGET_TYPES.AI_USAGE_EVENT,
          targetId: eventId,
          requestId,
          metadata: {
            ...auditIdentity(pendingEvent),
            status: AI_USAGE_STATUSES.PENDING,
            reservedCostTicks: Number(reservedCostTicks),
          },
        });

        const [confirmed, exposure] = await Promise.all([
          transaction.aiUsageEvent.aggregate({
            where: {
              status: AI_USAGE_STATUSES.SUCCEEDED,
              createdAt: { gte: dayStart },
            },
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
          throw aiCostCeilingReached();
        }

        return transaction.aiUsageEvent.create({ data: pendingEvent });
      },
      { isolationLevel: "Serializable" },
    );
  }

  async function finalizeFailure(event, code, costDisposition, durationMs, requestId) {
    const status =
      costDisposition === "HOLD" ? AI_USAGE_STATUSES.UNKNOWN : AI_USAGE_STATUSES.FAILED;
    const normalizedCode = safeErrorCode(code);
    const completedAt = now();
    return database.$transaction(
      async (transaction) => {
        await lockUser(transaction, event.userId);
        const current = await transaction.aiUsageEvent.findUnique({ where: { id: event.id } });
        if (!current || current.status !== AI_USAGE_STATUSES.PENDING) return false;
        await audit.append(transaction, {
          action: AUDIT_ACTIONS.AI_REQUEST_FAILED,
          outcome: AUDIT_OUTCOMES.FAILURE,
          actorKind: AUDIT_ACTOR_KINDS.USER,
          actorUserId: event.userId,
          targetType: AUDIT_TARGET_TYPES.AI_USAGE_EVENT,
          targetId: event.id,
          requestId,
          metadata: {
            ...auditIdentity(event),
            status,
            safeErrorCode: normalizedCode,
            durationMs,
          },
        });
        await transaction.aiUsageEvent.update({
          where: { id: event.id },
          data: {
            status,
            safeErrorCode: normalizedCode,
            durationMs,
            completedAt,
          },
        });
        return true;
      },
      { isolationLevel: "Serializable" },
    );
  }

  async function finalizeSuccess(event, providerResult, durationMs, requestId) {
    const completedAt = now();
    const policy = policyForAssistant(event.assistant);
    return database.$transaction(
      async (transaction) => {
        await lockUser(transaction, event.userId);
        const current = await transaction.aiUsageEvent.findUnique({ where: { id: event.id } });
        if (!current || current.status !== AI_USAGE_STATUSES.PENDING) {
          throw new Error("AI usage event is not pending");
        }
        const user = await currentUser(transaction, event.userId);
        const consentActive = await hasCurrentConsent(transaction, event.userId, event.assistant);
        const authorizedToReturn = isAuthorized(user, policy) && consentActive;
        const usage = providerResult.usage;

        await audit.append(transaction, {
          action: AUDIT_ACTIONS.AI_REQUEST_COMPLETED,
          outcome: AUDIT_OUTCOMES.SUCCESS,
          actorKind: AUDIT_ACTOR_KINDS.USER,
          actorUserId: event.userId,
          targetType: AUDIT_TARGET_TYPES.AI_USAGE_EVENT,
          targetId: event.id,
          requestId,
          metadata: {
            ...auditIdentity(event),
            status: AI_USAGE_STATUSES.SUCCEEDED,
            outcome: providerResult.outcome,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            costInUsdTicks: usage.costInUsdTicks,
            durationMs,
            zeroDataRetention: providerResult.zeroDataRetention,
          },
        });
        await transaction.aiUsageEvent.update({
          where: { id: event.id },
          data: {
            status: AI_USAGE_STATUSES.SUCCEEDED,
            providerRequestId: providerResult.providerRequestId,
            outcome: providerResult.outcome,
            exactCostTicks: BigInt(usage.costInUsdTicks),
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            durationMs,
            completedAt,
          },
        });
        return authorizedToReturn;
      },
      { isolationLevel: "Serializable" },
    );
  }

  async function bestEffortUnknown(event, durationMs, requestId) {
    try {
      await finalizeFailure(event, "AI_RESULT_RECORDING_FAILED", "HOLD", durationMs, requestId);
    } catch {
      // Leaving PENDING is fail-safe: the stale-request recovery path later marks it UNKNOWN.
    }
  }

  async function runAssistant({ userId, assistant, submissionKey, question, requestId, context }) {
    assertEnabled();
    return gate.run(async () => {
      const event = await reserve({ userId, assistant, submissionKey, requestId });
      const callStartedAt = Date.now();
      let resolvedContext;
      try {
        resolvedContext = context ? await context() : null;
      } catch {
        const durationMs = durationSince(callStartedAt);
        await finalizeFailure(event, "AI_CONTEXT_UNAVAILABLE", "RELEASE", durationMs, requestId);
        throw aiContextUnavailable();
      }

      let providerResult;
      try {
        providerResult = await internalClient.respond(
          {
            contractVersion: AI_INTERNAL_CONTRACT_VERSION,
            subjectId: userId,
            assistant,
            intent: event.intent,
            question,
            context: resolvedContext,
          },
          requestId,
        );
        if (
          providerResult.promptVersion !== event.promptVersion ||
          providerResult.model !== event.model
        ) {
          throw new AiInternalClientError("AI_SERVICE_INVALID_RESPONSE");
        }
      } catch (error) {
        const internalError =
          error instanceof AiInternalClientError
            ? error
            : new AiInternalClientError("AI_SERVICE_UNAVAILABLE");
        const durationMs = durationSince(callStartedAt);
        try {
          await finalizeFailure(
            event,
            internalError.code,
            internalError.costDisposition,
            durationMs,
            requestId,
          );
        } catch {
          await bestEffortUnknown(event, durationMs, requestId);
          throw aiRecordingFailed();
        }
        throw aiProviderUnavailable(internalError.code);
      }

      const durationMs = durationSince(callStartedAt);
      const costPolicyExceeded =
        BigInt(providerResult.usage.costInUsdTicks) > event.reservedCostTicks;
      let authorizedToReturn;
      try {
        authorizedToReturn = await finalizeSuccess(event, providerResult, durationMs, requestId);
      } catch {
        await bestEffortUnknown(event, durationMs, requestId);
        throw aiRecordingFailed();
      }
      if (costPolicyExceeded) throw aiCostPolicyExceeded();
      if (!authorizedToReturn) throw aiAuthorizationChanged();

      return {
        answer: providerResult.answer,
        outcome: providerResult.outcome,
        notices: providerResult.notices,
      };
    });
  }

  return Object.freeze({
    async customer({ userId, submissionKey, question, requestId }) {
      return runAssistant({
        userId,
        assistant: AI_ASSISTANTS.CUSTOMER,
        submissionKey,
        question,
        requestId,
      });
    },

    async owner({ userId, submissionKey, question, range, requestId }) {
      let overview;
      const response = await runAssistant({
        userId,
        assistant: AI_ASSISTANTS.OWNER,
        submissionKey,
        question,
        requestId,
        context: async () => {
          overview = await reports.overview(range);
          return { overview };
        },
      });
      return { overview, response };
    },

    async usage({ actor, range, requestId }) {
      const where = { createdAt: { gte: range.from, lt: range.to } };
      const [
        statusGroups,
        assistantGroups,
        tokenTotals,
        confirmed,
        exposure,
        latency,
        failureGroups,
      ] = await Promise.all([
        database.aiUsageEvent.groupBy({ by: ["status"], where, _count: { _all: true } }),
        database.aiUsageEvent.groupBy({
          by: ["assistant"],
          where,
          _count: { _all: true },
        }),
        database.aiUsageEvent.aggregate({
          where: { ...where, status: AI_USAGE_STATUSES.SUCCEEDED },
          _sum: { inputTokens: true, outputTokens: true, totalTokens: true },
        }),
        database.aiUsageEvent.aggregate({
          where: { ...where, status: AI_USAGE_STATUSES.SUCCEEDED },
          _sum: { exactCostTicks: true },
        }),
        database.aiUsageEvent.aggregate({
          where: {
            ...where,
            status: { in: [AI_USAGE_STATUSES.PENDING, AI_USAGE_STATUSES.UNKNOWN] },
          },
          _sum: { reservedCostTicks: true },
        }),
        database.aiUsageEvent.aggregate({
          where: { ...where, durationMs: { not: null } },
          _count: { durationMs: true },
          _avg: { durationMs: true },
          _max: { durationMs: true },
        }),
        database.aiUsageEvent.groupBy({
          by: ["safeErrorCode"],
          where: { ...where, safeErrorCode: { not: null } },
          _count: { _all: true },
        }),
      ]);
      const statusBreakdown = Object.fromEntries(
        Object.values(AI_USAGE_STATUSES).map((status) => [status, 0]),
      );
      for (const group of statusGroups) statusBreakdown[group.status] = group._count._all;
      const assistantBreakdown = Object.fromEntries(
        Object.values(AI_ASSISTANTS).map((assistant) => [assistant, 0]),
      );
      for (const group of assistantGroups) {
        assistantBreakdown[group.assistant] = group._count._all;
      }
      const requestCount = Object.values(statusBreakdown).reduce((sum, count) => sum + count, 0);
      const confirmedTicks = sumBigInt(confirmed._sum.exactCostTicks);
      const exposureTicks = sumBigInt(exposure._sum.reservedCostTicks);
      const safeErrorBreakdown = Object.fromEntries(
        failureGroups.map((group) => [group.safeErrorCode, group._count._all]),
      );
      const failureCount = Object.values(safeErrorBreakdown).reduce((sum, count) => sum + count, 0);

      await audit.appendStandalone({
        action: AUDIT_ACTIONS.AI_USAGE_READ,
        outcome: AUDIT_OUTCOMES.SUCCESS,
        actorKind: AUDIT_ACTOR_KINDS.USER,
        actorUserId: actor.id,
        targetType: AUDIT_TARGET_TYPES.AI_USAGE_STREAM,
        requestId,
        metadata: {
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          requestCount,
        },
      });

      return {
        asOf: now().toISOString(),
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        timeZone: "UTC",
        requests: { total: requestCount, statusBreakdown, assistantBreakdown },
        tokens: {
          input: tokenTotals._sum.inputTokens ?? 0,
          output: tokenTotals._sum.outputTokens ?? 0,
          total: tokenTotals._sum.totalTokens ?? 0,
        },
        latency: {
          completedCount: latency._count.durationMs,
          averageMs:
            latency._avg.durationMs === null
              ? null
              : Math.round(latency._avg.durationMs * 100) / 100,
          maximumMs: latency._max.durationMs,
        },
        failures: { total: failureCount, safeErrorBreakdown },
        cost: {
          currency: "USD",
          ticksPerUsd: "10000000000",
          confirmedInUsdTicks: confirmedTicks.toString(),
          confirmedUsd: formatUsdTicks(confirmedTicks),
          reservedExposureInUsdTicks: exposureTicks.toString(),
          reservedExposureUsd: formatUsdTicks(exposureTicks),
        },
      };
    },
  });
}

export function requireAiEnabled(config) {
  return function ensureAiEnabled(_request, _response, next) {
    return config.ai?.enabled ? next() : next(aiDisabled());
  };
}

export function requireAssistantPermission(request, _response, next) {
  const assistant = request.validated?.params?.assistant;
  const policy = policyForAssistant(assistant);
  if (policy && request.auth?.permissions.has(policy.permission)) return next();
  return next(
    new AppError({
      statusCode: 403,
      code: "FORBIDDEN",
      message: "You do not have permission to perform this action",
    }),
  );
}
