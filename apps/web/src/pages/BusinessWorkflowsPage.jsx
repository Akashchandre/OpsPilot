import { useCallback, useEffect, useRef, useState } from "react";
import {
  BUSINESS_BRIEF_WORKFLOW,
  cancelWorkflow,
  listWorkflowRuns,
  startBusinessBrief,
} from "../api/workflows.js";
import { AiConsentCard } from "../components/AiConsentCard.jsx";
import { useTrackedWorkflow } from "../hooks/useTrackedWorkflow.js";
import { useWorkflowConsent } from "../hooks/useWorkflowConsent.js";

const sourceNames = {
  REPORTS_OVERVIEW_V1: "Reports overview",
  INVENTORY_ATTENTION_V1: "Inventory attention",
  SUPPORT_QUEUE_SUMMARY_V1: "Support queue summary",
};
const terminalStatuses = new Set(["SUCCEEDED", "FAILED", "UNKNOWN", "CANCELLED", "EXPIRED"]);

function utcInputValue(date) {
  return date.toISOString().slice(0, 16);
}

function initialRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: utcInputValue(from), to: utcInputValue(to) };
}

function asUtc(value) {
  return new Date(`${value}:00.000Z`).toISOString();
}

function BusinessResult({ run }) {
  if (run.status !== "SUCCEEDED" || !run.result) return null;
  return (
    <section className="panel workflow-result" aria-labelledby="business-brief-result">
      <div className="workflow-heading-row">
        <div>
          <p className="eyebrow">GENERATED INTERPRETATION</p>
          <h2 id="business-brief-result">Business brief</h2>
        </div>
        <span className="badge badge--ready">Completed</span>
      </div>
      <p>{run.result.summary}</p>
      <div className="workflow-result-grid">
        <div>
          <h3>Findings</h3>
          <ul>
            {run.result.findings.map((finding, index) => (
              <li key={`${finding.text}-${index}`}>
                {finding.text} <small>Sources: {finding.sourceLabels.join(", ")}</small>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Suggested next steps</h3>
          <ul>
            {run.result.nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
      </div>
      {run.result.uncertainties.length > 0 ? (
        <div className="workflow-uncertainties">
          <h3>Uncertainties to verify</h3>
          <ul>
            {run.result.uncertainties.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="workflow-sources">
        <h3>Authoritative calculation basis</h3>
        <p className="muted">
          Range {new Date(run.range.from).toLocaleString()} to{" "}
          {new Date(run.range.to).toLocaleString()} UTC. These snapshots came from OpsPilot; the
          narrative above is generated.
        </p>
        {run.sources?.map((source) => (
          <details key={source.toolCode}>
            <summary>{sourceNames[source.toolCode] ?? source.toolCode}</summary>
            <pre>{JSON.stringify(source.output, null, 2)}</pre>
          </details>
        ))}
      </div>
    </section>
  );
}

export function BusinessWorkflowsPage() {
  const consent = useWorkflowConsent("business");
  const workflow = useTrackedWorkflow();
  const cancellationKey = useRef(null);
  const [range, setRange] = useState(initialRange);
  const [focus, setFocus] = useState("GENERAL");
  const [recent, setRecent] = useState([]);
  const [listError, setListError] = useState("");

  const loadRecent = useCallback(async (signal) => {
    try {
      const result = await listWorkflowRuns(
        { workflowCode: BUSINESS_BRIEF_WORKFLOW, limit: 20 },
        { signal },
      );
      setRecent(result.runs);
      setListError("");
    } catch (error) {
      if (error.name !== "AbortError") setListError(error.message);
    }
  }, []);

  useEffect(() => {
    if (!consent.consent?.active) return undefined;
    const controller = new AbortController();
    listWorkflowRuns(
      { workflowCode: BUSINESS_BRIEF_WORKFLOW, limit: 20 },
      { signal: controller.signal },
    )
      .then((result) => {
        setRecent(result.runs);
        setListError("");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setListError(error.message);
      });
    return () => controller.abort();
  }, [consent.consent?.active]);

  useEffect(() => {
    if (!workflow.run || !terminalStatuses.has(workflow.run.status)) return undefined;
    const controller = new AbortController();
    listWorkflowRuns(
      { workflowCode: BUSINESS_BRIEF_WORKFLOW, limit: 20 },
      { signal: controller.signal },
    )
      .then((result) => setRecent(result.runs))
      .catch((error) => {
        if (error.name !== "AbortError") setListError(error.message);
      });
    return () => controller.abort();
  }, [workflow.run]);

  async function submit(event) {
    event.preventDefault();
    workflow.begin();
    try {
      const from = asUtc(range.from);
      const to = asUtc(range.to);
      if (from >= to) throw new Error("The end time must be later than the start time.");
      const run = await startBusinessBrief({ from, to, focus }, crypto.randomUUID());
      cancellationKey.current = null;
      workflow.track(run);
      loadRecent();
    } catch (error) {
      workflow.fail(error);
      if (error.code === "AI_WORKFLOW_CONSENT_REQUIRED") consent.reload();
    }
  }

  async function cancel() {
    cancellationKey.current ??= crypto.randomUUID();
    workflow.begin();
    try {
      workflow.track(
        await cancelWorkflow(workflow.run.id, workflow.run.version, cancellationKey.current),
      );
    } catch (error) {
      workflow.fail(error);
    }
  }

  const run = workflow.run;
  const cancellable = run && !terminalStatuses.has(run.status);

  return (
    <section className="workflow-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">AI · CONTROLLED WORKFLOW</p>
          <h1>Business brief workflow</h1>
          <p className="muted">
            Generate one read-only brief from fixed reports, inventory, and support aggregates. No
            model-selected tools or business actions are available.
          </p>
        </div>
        <button className="button button--quiet" type="button" onClick={() => loadRecent()}>
          Refresh runs
        </button>
      </div>

      <AiConsentCard
        consent={consent.consent}
        status={consent.status}
        error={consent.error}
        onAccept={consent.accept}
        onRevoke={() => {
          workflow.clear();
          return consent.revoke();
        }}
      />

      {consent.consent?.active ? (
        <div className="workflow-layout">
          <div className="workflow-main">
            <form className="panel workflow-form" onSubmit={submit}>
              <div className="workflow-heading-row">
                <div>
                  <p className="eyebrow">FIXED INPUT</p>
                  <h2>Start a brief</h2>
                </div>
                <span className="badge">UTC · 1–90 days</span>
              </div>
              <div className="form-row">
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
              <label>
                <span>Focus</span>
                <select value={focus} onChange={(event) => setFocus(event.target.value)}>
                  <option value="GENERAL">General operations</option>
                  <option value="REVENUE">Revenue</option>
                  <option value="INVENTORY">Inventory</option>
                  <option value="SUPPORT">Support</option>
                </select>
              </label>
              <button
                className="button button--primary"
                type="submit"
                disabled={workflow.status === "saving"}
              >
                {workflow.status === "saving" ? "Starting…" : "Generate business brief"}
              </button>
            </form>

            {workflow.error ? (
              <p className="global-alert" role="alert">
                {workflow.error}
              </p>
            ) : null}
            {run ? (
              <section className="panel workflow-status" aria-live="polite">
                <div className="workflow-heading-row">
                  <div>
                    <p className="eyebrow">RUN STATUS</p>
                    <h2>{run.status.replaceAll("_", " ")}</h2>
                  </div>
                  {cancellable ? (
                    <button className="button button--quiet" type="button" onClick={cancel}>
                      Cancel run
                    </button>
                  ) : null}
                </div>
                <p className="muted">
                  Run {run.id} · Graph {run.graphVersion}
                </p>
                {run.safeErrorCode ? <p>Safe failure code: {run.safeErrorCode}</p> : null}
              </section>
            ) : null}
            {run ? <BusinessResult run={run} /> : null}
          </div>

          <aside className="panel workflow-run-list" aria-label="Recent business brief runs">
            <h2>Recent runs</h2>
            {listError ? (
              <p className="global-alert" role="alert">
                {listError}
              </p>
            ) : null}
            {recent.length === 0 ? <p className="muted">No workflow runs yet.</p> : null}
            {recent.map((item) => (
              <button
                className="workflow-run-row"
                type="button"
                key={item.id}
                onClick={() => workflow.load(item.id)}
              >
                <strong>{item.focus ?? "GENERAL"}</strong>
                <span>{item.status.replaceAll("_", " ")}</span>
                <small>{new Date(item.createdAt).toLocaleString()}</small>
              </button>
            ))}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
