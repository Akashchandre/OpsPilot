import { useCallback, useEffect, useState } from "react";
import { getAiUsage, requestOwnerOverviewAi } from "../api/ai.js";
import { AiConsentCard } from "../components/AiConsentCard.jsx";
import { AiQuestionForm } from "../components/AiQuestionForm.jsx";
import { AiResponsePanel } from "../components/AiResponsePanel.jsx";
import { Money } from "../components/Money.jsx";
import { useAiConsent } from "../hooks/useAiConsent.js";
import { newSubmissionKey, presentAiError } from "./aiPresentation.js";

function utcInputValue(date) {
  return date.toISOString().slice(0, 16);
}

function initialRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: utcInputValue(from), to: utcInputValue(to) };
}

function requestRange(range) {
  return {
    from: new Date(`${range.from}:00.000Z`).toISOString(),
    to: new Date(`${range.to}:00.000Z`).toISOString(),
  };
}

function OwnerOverview({ overview }) {
  if (!overview) return null;
  return (
    <section className="panel ai-overview" aria-labelledby="ai-overview-title">
      <div className="ai-card-heading">
        <div>
          <p className="eyebrow">AUTHORITATIVE DATA</p>
          <h2 id="ai-overview-title">Overview sent for explanation</h2>
        </div>
        <span className="badge">UTC</span>
      </div>
      <p className="muted">
        Snapshot as of {new Date(overview.asOf).toLocaleString()}. These values come from OpsPilot,
        not from the generated answer.
      </p>
      <dl className="ai-overview-metrics">
        <div>
          <dt>Orders created</dt>
          <dd>{overview.orders.createdCount}</dd>
        </div>
        <div>
          <dt>Net payment flow</dt>
          <dd>
            <Money amount={overview.paymentFlow.netAmount} currency={overview.currency} />
          </dd>
        </div>
        <div>
          <dt>New customers</dt>
          <dd>{overview.customers.newAccountCount}</dd>
        </div>
        <div>
          <dt>Open tickets</dt>
          <dd>{overview.tickets.currentOpenCount}</dd>
        </div>
        <div>
          <dt>Low stock</dt>
          <dd>{overview.inventory.lowStockProductCount}</dd>
        </div>
        <div>
          <dt>Out of stock</dt>
          <dd>{overview.inventory.outOfStockProductCount}</dd>
        </div>
      </dl>
    </section>
  );
}

function UsagePanel({ state, onRefresh }) {
  const usage = state.usage;
  return (
    <section className="panel ai-usage" aria-labelledby="ai-usage-title">
      <div className="ai-card-heading">
        <div>
          <p className="eyebrow">METADATA ONLY</p>
          <h2 id="ai-usage-title">AI usage</h2>
        </div>
        <button
          className="button button--quiet"
          type="button"
          onClick={onRefresh}
          disabled={state.status === "loading"}
        >
          Refresh usage
        </button>
      </div>
      {state.status === "loading" && !usage ? <p role="status">Loading AI usage...</p> : null}
      {state.error ? (
        <p className="global-alert" role="alert">
          {state.error}
        </p>
      ) : null}
      {usage ? (
        <>
          <dl className="ai-usage-metrics">
            <div>
              <dt>Requests</dt>
              <dd>{usage.requests.total}</dd>
            </div>
            <div>
              <dt>Total tokens</dt>
              <dd>{usage.tokens.total}</dd>
            </div>
            <div>
              <dt>Average latency</dt>
              <dd>{usage.latency.averageMs === null ? "—" : `${usage.latency.averageMs} ms`}</dd>
            </div>
            <div>
              <dt>Safe failures</dt>
              <dd>{usage.failures.total}</dd>
            </div>
            <div>
              <dt>Confirmed cost</dt>
              <dd>${usage.cost.confirmedUsd}</dd>
            </div>
            <div>
              <dt>Reserved exposure</dt>
              <dd>${usage.cost.reservedExposureUsd}</dd>
            </div>
          </dl>
          <div className="ai-usage-breakdowns">
            <div>
              <h3>Status</h3>
              <ul>
                {Object.entries(usage.requests.statusBreakdown).map(([label, count]) => (
                  <li key={label}>
                    <span>{label}</span>
                    <strong>{count}</strong>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Safe failure codes</h3>
              {Object.keys(usage.failures.safeErrorBreakdown).length === 0 ? (
                <p className="muted">No recorded failures in this range.</p>
              ) : (
                <ul>
                  {Object.entries(usage.failures.safeErrorBreakdown).map(([label, count]) => (
                    <li key={label}>
                      <span>{label}</span>
                      <strong>{count}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

export function OwnerAssistantPage() {
  const consent = useAiConsent("owner");
  const [range, setRange] = useState(initialRange);
  const [question, setQuestion] = useState("");
  const [responseState, setResponseState] = useState({
    status: "idle",
    response: null,
    overview: null,
    error: "",
  });
  const [usageState, setUsageState] = useState({ status: "loading", usage: null, error: "" });

  const loadUsage = useCallback(async (explicitRange, signal) => {
    setUsageState((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const usage = await getAiUsage(explicitRange, { signal });
      setUsageState({ status: "ready", usage, error: "" });
    } catch (error) {
      if (error.name !== "AbortError") {
        setUsageState((current) => ({
          ...current,
          status: "error",
          error: error.message,
        }));
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadUsage({}, controller.signal);
    return () => controller.abort();
  }, [loadUsage]);

  async function submit(event) {
    event.preventDefault();
    const selectedRange = requestRange(range);
    if (selectedRange.from >= selectedRange.to) {
      setResponseState((current) => ({
        ...current,
        status: "error",
        error: "The end time must be later than the start time.",
      }));
      return;
    }
    setResponseState((current) => ({ ...current, status: "submitting", error: "" }));
    try {
      const result = await requestOwnerOverviewAi({
        question,
        range: selectedRange,
        idempotencyKey: newSubmissionKey(),
      });
      setQuestion("");
      setResponseState({
        status: "ready",
        response: result.response,
        overview: result.overview,
        error: "",
      });
      loadUsage(selectedRange);
    } catch (error) {
      setResponseState((current) => ({
        ...current,
        status: "error",
        error: presentAiError(error),
      }));
      if (error?.code === "AI_CONSENT_REQUIRED") await consent.reload();
    }
  }

  async function revoke() {
    const revoked = await consent.revoke();
    if (revoked && !revoked.active) {
      setQuestion("");
      setResponseState({ status: "idle", response: null, overview: null, error: "" });
    }
  }

  const selectedUsageRange = () => requestRange(range);

  return (
    <section className="ai-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">GROK · OWNER OVERVIEW</p>
          <h1>Operations assistant</h1>
          <p className="muted">
            Ask for an explanation of one authoritative aggregate overview. No row-level records or
            action tools are available to the model.
          </p>
        </div>
      </div>

      <AiConsentCard
        consent={consent.consent}
        status={consent.status}
        error={consent.error}
        onAccept={consent.accept}
        onRevoke={revoke}
      />

      {consent.consent?.active ? (
        <AiQuestionForm
          question={question}
          onQuestionChange={setQuestion}
          onSubmit={submit}
          status={responseState.status}
          error={responseState.error}
          placeholder="For example: What operational changes stand out in this overview?"
          buttonLabel="Explain overview with Grok"
        >
          <div className="ai-range">
            <label>
              <span>From (UTC)</span>
              <input
                type="datetime-local"
                value={range.from}
                onChange={(event) =>
                  setRange((current) => ({ ...current, from: event.target.value }))
                }
                required
              />
            </label>
            <label>
              <span>To (UTC)</span>
              <input
                type="datetime-local"
                value={range.to}
                onChange={(event) =>
                  setRange((current) => ({ ...current, to: event.target.value }))
                }
                required
              />
            </label>
          </div>
        </AiQuestionForm>
      ) : null}

      <OwnerOverview overview={responseState.overview} />
      <AiResponsePanel response={responseState.response} />
      <UsagePanel state={usageState} onRefresh={() => loadUsage(selectedUsageRange())} />
    </section>
  );
}
