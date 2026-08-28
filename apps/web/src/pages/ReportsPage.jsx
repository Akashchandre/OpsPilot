import { useCallback, useEffect, useState } from "react";
import { getOverviewReport } from "../api/reports.js";
import { Money } from "../components/Money.jsx";

function utcInputValue(date) {
  return date.toISOString().slice(0, 16);
}

function initialRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: utcInputValue(from), to: utcInputValue(to) };
}

function toUtcInstant(value) {
  return new Date(`${value}:00.000Z`).toISOString();
}

function Breakdown({ title, values }) {
  return (
    <section className="panel report-breakdown">
      <h2>{title}</h2>
      <dl>
        {Object.entries(values).map(([label, count]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{count}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ReportsPage() {
  const [range, setRange] = useState(initialRange);
  const [requestedRange, setRequestedRange] = useState(null);
  const [state, setState] = useState({ status: "loading", report: null, error: "" });

  const loadReport = useCallback(async (explicitRange, signal) => {
    setState((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const report = await getOverviewReport({ ...(explicitRange ?? {}), signal });
      setState({ status: "ready", report, error: "" });
    } catch (error) {
      if (error.name !== "AbortError") {
        setState((current) => ({
          status: current.report ? "ready" : "error",
          report: current.report,
          error: error.message,
        }));
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getOverviewReport({ signal: controller.signal })
      .then((report) => setState({ status: "ready", report, error: "" }))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setState({ status: "error", report: null, error: error.message });
        }
      });
    return () => controller.abort();
  }, []);

  function submitRange(event) {
    event.preventDefault();
    const from = toUtcInstant(range.from);
    const to = toUtcInstant(range.to);
    if (from >= to) {
      setState((current) => ({
        ...current,
        status: current.report ? "ready" : "error",
        error: "The end time must be later than the start time.",
      }));
      return;
    }
    const nextRange = { from, to };
    setRequestedRange(nextRange);
    loadReport(nextRange);
  }

  const report = state.report;
  const isEmpty =
    report &&
    report.orders.createdCount === 0 &&
    report.paymentFlow.capturedAmount === "0.00" &&
    report.paymentFlow.processedRefundAmount === "0.00" &&
    report.customers.newAccountCount === 0 &&
    report.inventory.lowStockProductCount === 0 &&
    report.inventory.outOfStockProductCount === 0 &&
    report.tickets.createdCount === 0;

  return (
    <section className="reports-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">AUTHORITATIVE OVERVIEW</p>
          <h1>Operations report</h1>
          <p className="muted">Live MySQL metrics with exact definitions, shown in UTC and INR.</p>
        </div>
        <button
          className="button button--quiet"
          type="button"
          onClick={() => loadReport(requestedRange)}
          disabled={state.status === "loading"}
        >
          Refresh
        </button>
      </div>

      <form className="report-range" onSubmit={submitRange}>
        <label>
          <span>From (UTC)</span>
          <input
            type="datetime-local"
            value={range.from}
            onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))}
            required
          />
        </label>
        <label>
          <span>To (UTC)</span>
          <input
            type="datetime-local"
            value={range.to}
            onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))}
            required
          />
        </label>
        <button className="button button--secondary" type="submit">
          Apply range
        </button>
      </form>

      {state.status === "loading" ? <p role="status">Loading operations report...</p> : null}
      {state.error ? (
        <p className="global-alert" role="alert">
          {state.error}
        </p>
      ) : null}
      {isEmpty ? (
        <div className="panel empty-state">
          <h2>No activity in this range</h2>
          <p>All range metrics are zero. Inventory still reflects the current snapshot.</p>
        </div>
      ) : null}

      {report ? (
        <>
          <div className="report-context" role="status">
            <span>
              Range: {new Date(report.from).toLocaleString()} to{" "}
              {new Date(report.to).toLocaleString()} UTC
            </span>
            <span>As of {new Date(report.asOf).toLocaleString()}</span>
          </div>
          <div className="report-metrics">
            <article className="panel report-metric">
              <span>Orders created</span>
              <strong>{report.orders.createdCount}</strong>
            </article>
            <article className="panel report-metric">
              <span>Captured payment flow</span>
              <strong>
                <Money amount={report.paymentFlow.capturedAmount} currency={report.currency} />
              </strong>
            </article>
            <article className="panel report-metric">
              <span>Processed refunds</span>
              <strong>
                <Money
                  amount={report.paymentFlow.processedRefundAmount}
                  currency={report.currency}
                />
              </strong>
            </article>
            <article className="panel report-metric">
              <span>Net payment flow</span>
              <strong>
                <Money amount={report.paymentFlow.netAmount} currency={report.currency} />
              </strong>
            </article>
            <article className="panel report-metric">
              <span>New customer accounts</span>
              <strong>{report.customers.newAccountCount}</strong>
            </article>
            <article className="panel report-metric">
              <span>Tickets created</span>
              <strong>{report.tickets.createdCount}</strong>
            </article>
            <article className="panel report-metric">
              <span>Current low stock</span>
              <strong>{report.inventory.lowStockProductCount}</strong>
            </article>
            <article className="panel report-metric">
              <span>Current out of stock</span>
              <strong>{report.inventory.outOfStockProductCount}</strong>
            </article>
          </div>
          <div className="report-breakdowns">
            <Breakdown title="Current order status" values={report.orders.currentStatusBreakdown} />
            <Breakdown
              title="Current ticket status"
              values={report.tickets.currentStatusBreakdown}
            />
            <Breakdown
              title="Current ticket priority"
              values={report.tickets.currentPriorityBreakdown}
            />
          </div>
          <p className="panel report-definition">
            Net payment flow is captured attempt amount minus processed refund amount in the
            selected half-open range. It is an operational flow metric, not recognized revenue,
            profit, tax, or an accounting statement.
          </p>
        </>
      ) : null}
    </section>
  );
}
