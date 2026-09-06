import { useEffect, useRef, useState } from "react";
import {
  SUPPORT_REPLY_WORKFLOW,
  cancelWorkflow,
  decideWorkflow,
  listWorkflowRuns,
  startSupportReply,
} from "../api/workflows.js";
import { useTrackedWorkflow } from "../hooks/useTrackedWorkflow.js";
import { useWorkflowConsent } from "../hooks/useWorkflowConsent.js";
import { AiConsentCard } from "./AiConsentCard.jsx";

const terminalStatuses = new Set(["SUCCEEDED", "FAILED", "UNKNOWN", "CANCELLED", "EXPIRED"]);

export function SupportWorkflowPanel({ ticket, onPublished }) {
  const consent = useWorkflowConsent("support");
  const workflow = useTrackedWorkflow();
  const loadWorkflow = workflow.load;
  const startKey = useRef(null);
  const decisionKey = useRef(null);
  const cancellationKey = useRef(null);
  const publishedRun = useRef(null);
  const [draftEdits, setDraftEdits] = useState({});
  const [reviewed, setReviewed] = useState(false);
  const [lookupError, setLookupError] = useState("");

  useEffect(() => {
    if (!ticket?.id || !consent.consent?.active) return undefined;
    const controller = new AbortController();
    listWorkflowRuns(
      { workflowCode: SUPPORT_REPLY_WORKFLOW, limit: 100 },
      { signal: controller.signal },
    )
      .then(({ runs }) => {
        const latest = runs.find((run) => run.ticketId === ticket.id);
        setLookupError("");
        if (latest) return loadWorkflow(latest.id);
        return null;
      })
      .catch((error) => {
        if (error.name !== "AbortError") setLookupError(error.message);
      });
    return () => controller.abort();
  }, [consent.consent?.active, loadWorkflow, ticket?.id]);

  useEffect(() => {
    const run = workflow.run;
    if (run?.status === "SUCCEEDED" && run.publishedMessageId && publishedRun.current !== run.id) {
      publishedRun.current = run.id;
      onPublished();
    }
  }, [onPublished, workflow.run]);

  async function start() {
    startKey.current ??= crypto.randomUUID();
    workflow.begin();
    try {
      const run = await startSupportReply(ticket.id, startKey.current);
      setDraftEdits({});
      setReviewed(false);
      decisionKey.current = null;
      workflow.track(run);
    } catch (error) {
      workflow.fail(error);
      if (error.code === "AI_WORKFLOW_CONSENT_REQUIRED") consent.reload();
    }
  }

  async function decide(decision) {
    decisionKey.current ??= crypto.randomUUID();
    workflow.begin();
    try {
      const original = workflow.run.draft.draft;
      const input = {
        decision: decision === "APPROVE" && draft !== original ? "EDIT_AND_APPROVE" : decision,
        version: workflow.run.version,
        ...(decision === "APPROVE" && draft !== original ? { body: draft } : {}),
      };
      workflow.track(await decideWorkflow(workflow.run.id, input, decisionKey.current));
      setReviewed(false);
    } catch (error) {
      workflow.fail(error);
      if (error.code === "AI_WORKFLOW_CONTEXT_CHANGED") workflow.refresh();
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
  const awaitingReview = run?.status === "AWAITING_APPROVAL" && run.draft?.draft;
  const draft = run ? (draftEdits[run.id] ?? run.draft?.draft ?? "") : "";
  const canCancel = run?.canCancel && !terminalStatuses.has(run.status);

  return (
    <section className="support-workflow" aria-labelledby="support-workflow-title">
      <div className="workflow-heading-row">
        <div>
          <p className="eyebrow">AI · HUMAN REVIEW REQUIRED</p>
          <h3 id="support-workflow-title">Reply draft workflow</h3>
        </div>
        {run ? <span className="badge">{run.status.replaceAll("_", " ")}</span> : null}
      </div>
      <p className="muted">
        Uses customer-visible ticket messages and customer policy sources only. Nothing is published
        until an authorized person reviews and approves the exact text.
      </p>
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
      {lookupError ? (
        <p className="global-alert" role="alert">
          {lookupError}
        </p>
      ) : null}
      {workflow.error ? (
        <p className="global-alert" role="alert">
          {workflow.error}
        </p>
      ) : null}
      {consent.consent?.active && !run ? (
        <button
          className="button button--primary"
          type="button"
          onClick={start}
          disabled={workflow.status === "saving"}
        >
          Generate AI reply draft
        </button>
      ) : null}
      {run && !terminalStatuses.has(run.status) && !awaitingReview ? (
        <p role="status">The workflow is {run.status.toLowerCase().replaceAll("_", " ")}…</p>
      ) : null}
      {awaitingReview ? (
        <div className="workflow-review">
          <label>
            <span>Customer-visible reply</span>
            <textarea
              value={draft}
              maxLength="4000"
              rows="7"
              onChange={(event) => {
                setDraftEdits((current) => ({
                  ...current,
                  [run.id]: event.target.value,
                }));
                setReviewed(false);
                decisionKey.current = null;
              }}
            />
          </label>
          {run.draft.reasons.length > 0 ? (
            <p className="muted">Model notes: {run.draft.reasons.join(" · ")}</p>
          ) : null}
          <p className="muted">
            Policy citations:{" "}
            {run.draft.citations.length > 0 ? run.draft.citations.join(", ") : "None"}
          </p>
          <p className="muted">
            Approval expires {new Date(run.approval.expiresAt).toLocaleString()} · Draft digest{" "}
            {run.approval.draftDigest.slice(0, 12)}…
          </p>
          {run.sourceFreshness?.length > 0 ? (
            <ul className="workflow-freshness">
              {run.sourceFreshness.map((source) => (
                <li key={source.toolCode}>
                  {source.toolCode.replaceAll("_V1", "").replaceAll("_", " ")} as of{" "}
                  {new Date(source.asOf).toLocaleString()}
                </li>
              ))}
            </ul>
          ) : null}
          <label className="workflow-review-confirmation">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            <span>I reviewed the exact reply and authorize publishing it to the customer.</span>
          </label>
          <div className="workflow-actions">
            <button
              className="button button--primary"
              type="button"
              disabled={!reviewed || !draft.trim() || workflow.status === "saving"}
              onClick={() => decide("APPROVE")}
            >
              Approve and publish
            </button>
            <button
              className="button button--quiet"
              type="button"
              disabled={workflow.status === "saving"}
              onClick={() => decide("REJECT")}
            >
              Reject draft
            </button>
          </div>
        </div>
      ) : null}
      {run?.status === "SUCCEEDED" && run.publishedMessageId ? (
        <p className="success-banner">The approved reply was published exactly once.</p>
      ) : null}
      {run?.status === "SUCCEEDED" && run.result && !run.publishedMessageId ? (
        <div className="panel workflow-result">
          <p className="eyebrow">SAFE WORKFLOW OUTCOME</p>
          <h4>{run.result.status.replaceAll("_", " ")}</h4>
          {run.result.reasons.length > 0 ? <p>{run.result.reasons.join(" · ")}</p> : null}
          <p className="muted">
            Policy citations:{" "}
            {run.result.citations.length > 0 ? run.result.citations.join(", ") : "None"}
          </p>
        </div>
      ) : null}
      {run?.safeErrorCode ? <p>Safe workflow result: {run.safeErrorCode}</p> : null}
      {canCancel ? (
        <button className="button button--quiet" type="button" onClick={cancel}>
          Cancel workflow
        </button>
      ) : null}
      {run && terminalStatuses.has(run.status) ? (
        <button
          className="button button--secondary"
          type="button"
          onClick={() => {
            workflow.clear();
            startKey.current = null;
          }}
        >
          Start a new draft
        </button>
      ) : null}
    </section>
  );
}
