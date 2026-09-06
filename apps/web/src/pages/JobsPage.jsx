import { useCallback, useEffect, useRef, useState } from "react";
import { getJob, getJobHealth, listJobs, replayJob } from "../api/jobs.js";
import { useAuth } from "../auth/auth-context.js";

const statuses = ["ALL", "PENDING", "PROCESSING", "SUCCEEDED", "DEAD_LETTER"];
const jobTypes = [
  "ALL",
  "NOTIFICATION_ORDER_PLACED",
  "NOTIFICATION_ORDER_STATUS_CHANGED",
  "NOTIFICATION_PAYMENT_STATUS_CHANGED",
  "NOTIFICATION_REFUND_STATUS_CHANGED",
  "NOTIFICATION_SUPPORT_TICKET_CREATED",
  "NOTIFICATION_SUPPORT_PUBLIC_REPLY_CREATED",
  "NOTIFICATION_SUPPORT_ASSIGNMENT_CHANGED",
  "NOTIFICATION_SUPPORT_STATUS_CHANGED",
  "NOTIFICATION_INVENTORY_LOW",
  "ORDER_RESERVATION_EXPIRY_SWEEP",
  "AUDIT_CHAIN_VERIFY",
  "DOCUMENT_VERSION_INGEST",
  "DOCUMENT_VERSION_REINDEX",
  "DOCUMENT_VERSION_DELETE",
];

function formatAge(milliseconds) {
  if (milliseconds === null) return "None";
  if (milliseconds < 1000) return `${milliseconds} ms`;
  if (milliseconds < 60_000) return `${Math.round(milliseconds / 1000)} sec`;
  return `${Math.round(milliseconds / 60_000)} min`;
}

export function JobsPage() {
  const auth = useAuth();
  const [filters, setFilters] = useState({ status: "ALL", type: "ALL" });
  const [state, setState] = useState({ status: "loading", health: null, jobs: [], error: "" });
  const [detail, setDetail] = useState({ status: "idle", job: null, error: "" });
  const [replayState, setReplayState] = useState({ jobId: null, error: "", message: "" });
  const replayKeys = useRef(new Map());

  const load = useCallback(
    async (signal) => {
      setState((current) => ({ ...current, status: "loading", error: "" }));
      try {
        const [health, result] = await Promise.all([
          getJobHealth({ signal }),
          listJobs({ ...filters, limit: 100, signal }),
        ]);
        setState({ status: "ready", health, jobs: result.jobs, error: "" });
      } catch (error) {
        if (error.name !== "AbortError") {
          setState((current) => ({ ...current, status: "error", error: error.message }));
        }
      }
    },
    [filters],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function selectJob(jobId) {
    setDetail({ status: "loading", job: null, error: "" });
    try {
      setDetail({ status: "ready", job: await getJob(jobId), error: "" });
    } catch (error) {
      setDetail({ status: "error", job: null, error: error.message });
    }
  }

  async function replaySelected() {
    const job = detail.job;
    if (!job) return;
    const idempotencyKey = replayKeys.current.get(job.id) ?? crypto.randomUUID();
    replayKeys.current.set(job.id, idempotencyKey);
    setReplayState({ jobId: job.id, error: "", message: "" });
    try {
      const result = await replayJob(job.id, idempotencyKey);
      replayKeys.current.delete(job.id);
      setReplayState({
        jobId: null,
        error: "",
        message: result.replayed
          ? `Replay job ${result.job.id} was queued.`
          : `Replay job ${result.job.id} was already queued.`,
      });
      await load();
      await selectJob(result.job.id);
    } catch (error) {
      setReplayState({ jobId: null, error: error.message, message: "" });
    }
  }

  const health = state.health;
  return (
    <section className="jobs-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">OWNER OPERATIONS</p>
          <h1>Background jobs</h1>
          <p className="muted">
            Durable queue health, immutable attempt evidence, and controlled replay.
          </p>
        </div>
        <button
          className="button button--quiet"
          type="button"
          onClick={() => load()}
          disabled={state.status === "loading"}
        >
          Refresh
        </button>
      </div>

      {state.error ? (
        <p className="inline-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {health ? (
        <div className="job-health-grid" aria-label="Queue health">
          {Object.entries(health.counts).map(([status, count]) => (
            <div className="panel job-health-card" key={status}>
              <span>{status}</span>
              <strong>{count}</strong>
            </div>
          ))}
          <div className="panel job-health-card">
            <span>Oldest pending</span>
            <strong>{formatAge(health.oldestPendingAgeMs)}</strong>
          </div>
          <div className="panel job-health-card">
            <span>Stale claims</span>
            <strong>{health.staleProcessing}</strong>
          </div>
        </div>
      ) : null}

      <div className="job-filters">
        <label>
          <span>Status</span>
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({ ...current, status: event.target.value }))
            }
          >
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Type</span>
          <select
            value={filters.type}
            onChange={(event) =>
              setFilters((current) => ({ ...current, type: event.target.value }))
            }
          >
            {jobTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
      </div>

      {state.status === "loading" && state.jobs.length === 0 ? (
        <p role="status">Loading jobs...</p>
      ) : null}
      {state.status === "ready" && state.jobs.length === 0 ? (
        <div className="panel empty-state">
          <h2>No jobs match these filters</h2>
        </div>
      ) : null}

      <div className="jobs-layout">
        <div className="job-list" aria-label="Background jobs">
          {state.jobs.map((job) => (
            <button
              className={`panel job-row${detail.job?.id === job.id ? " job-row--selected" : ""}`}
              type="button"
              key={job.id}
              onClick={() => selectJob(job.id)}
            >
              <span>
                <strong>{job.type}</strong>
                <small>{job.id}</small>
              </span>
              <span className={`job-status job-status--${job.status.toLowerCase()}`}>
                {job.status}
              </span>
              <span>
                Attempt {job.attemptCount}/{job.maxAttempts}
              </span>
              <time dateTime={job.createdAt}>{new Date(job.createdAt).toLocaleString()}</time>
            </button>
          ))}
        </div>

        <aside className="panel job-detail">
          {detail.status === "idle" ? (
            <p className="muted">Choose a job to inspect safe evidence.</p>
          ) : null}
          {detail.status === "loading" ? <p role="status">Loading job evidence...</p> : null}
          {detail.error ? (
            <p className="inline-error" role="alert">
              {detail.error}
            </p>
          ) : null}
          {detail.job ? (
            <>
              <div className="job-detail__heading">
                <div>
                  <p className="eyebrow">{detail.job.status}</p>
                  <h2>{detail.job.type}</h2>
                </div>
                {detail.job.status === "DEAD_LETTER" && auth.hasPermission("jobs:replay") ? (
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={replaySelected}
                    disabled={replayState.jobId === detail.job.id}
                  >
                    {replayState.jobId === detail.job.id ? "Replaying..." : "Replay"}
                  </button>
                ) : null}
              </div>
              {replayState.error ? (
                <p className="inline-error" role="alert">
                  {replayState.error}
                </p>
              ) : null}
              {replayState.message ? (
                <p className="success-message" role="status">
                  {replayState.message}
                </p>
              ) : null}
              <dl className="job-evidence">
                <div>
                  <dt>Job ID</dt>
                  <dd>{detail.job.id}</dd>
                </div>
                <div>
                  <dt>Last safe error</dt>
                  <dd>{detail.job.lastErrorCode ?? "None"}</dd>
                </div>
                <div>
                  <dt>Available</dt>
                  <dd>{new Date(detail.job.availableAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Replay of</dt>
                  <dd>{detail.job.replayedFromJobId ?? "Original job"}</dd>
                </div>
              </dl>
              <details className="job-payload">
                <summary>Registered safe descriptor</summary>
                <pre>{JSON.stringify(detail.job.payload, null, 2)}</pre>
              </details>
              <h3>Attempts</h3>
              <div className="job-attempts">
                {detail.job.attempts.length === 0 ? (
                  <p className="muted">No attempts yet.</p>
                ) : null}
                {detail.job.attempts.map((attempt) => (
                  <div key={attempt.id}>
                    <strong>Attempt {attempt.attemptNumber}</strong>
                    <span>{attempt.outcome ?? "IN PROGRESS"}</span>
                    <span>{attempt.errorCode ?? "No error"}</span>
                    <span>
                      {attempt.durationMs === null ? "Running" : `${attempt.durationMs} ms`}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </aside>
      </div>

      {health?.workers.length ? (
        <details className="panel worker-health">
          <summary>Recent worker heartbeats</summary>
          {health.workers.map((worker) => (
            <p key={worker.id}>
              <strong>{worker.state}</strong> · {worker.id} ·{" "}
              {new Date(worker.lastSeenAt).toLocaleString()}
            </p>
          ))}
        </details>
      ) : null}
    </section>
  );
}
