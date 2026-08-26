import { useEffect, useState } from "react";
import {
  adjustInventory,
  listInventory,
  listInventoryAdjustments,
  updateInventoryThreshold,
} from "../api/inventory.js";
import { useAuth } from "../auth/auth-context.js";

function InventoryCard({ balance, canAdjust, onUpdated }) {
  const [adjustment, setAdjustment] = useState({ delta: "", reason: "RESTOCK", note: "" });
  const [threshold, setThreshold] = useState(String(balance.lowStockThreshold));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState({ status: "closed", adjustments: [], error: "" });

  async function loadHistory() {
    setHistory((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const result = await listInventoryAdjustments(balance.product.id);
      setHistory({ status: "ready", adjustments: result.adjustments, error: "" });
    } catch (caughtError) {
      setHistory({ status: "error", adjustments: [], error: caughtError.message });
    }
  }

  async function submitAdjustment(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const updated = await adjustInventory(balance.product.id, {
        delta: Number(adjustment.delta),
        reason: adjustment.reason,
        ...(adjustment.note.trim() ? { note: adjustment.note.trim() } : {}),
        version: balance.version,
      });
      onUpdated(updated);
      setAdjustment({ delta: "", reason: "RESTOCK", note: "" });
      if (history.status !== "closed") await loadHistory();
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitThreshold(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onUpdated(
        await updateInventoryThreshold(balance.product.id, Number(threshold), balance.version),
      );
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="inventory-card">
      <div className="inventory-card__heading">
        <div>
          <span className="sku">{balance.product.sku}</span>
          <h2>{balance.product.name}</h2>
        </div>
        <span className={`badge badge--${balance.product.status.toLowerCase()}`}>
          {balance.product.status}
        </span>
      </div>

      <dl className="inventory-metrics">
        <div>
          <dt>On hand</dt>
          <dd>{balance.onHand}</dd>
        </div>
        <div>
          <dt>Threshold</dt>
          <dd>{balance.lowStockThreshold}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>{balance.lowStock ? "Low stock" : "Healthy"}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{balance.version}</dd>
        </div>
      </dl>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {canAdjust ? (
        <div className="inventory-actions">
          <form onSubmit={submitAdjustment}>
            <h3>Adjust stock</h3>
            <div className="form-row">
              <label>
                <span>Signed quantity</span>
                <input
                  required
                  type="number"
                  min="-1000000"
                  max="1000000"
                  value={adjustment.delta}
                  placeholder="e.g. 10 or -2"
                  onChange={(event) => setAdjustment({ ...adjustment, delta: event.target.value })}
                />
              </label>
              <label>
                <span>Reason</span>
                <select
                  value={adjustment.reason}
                  onChange={(event) => setAdjustment({ ...adjustment, reason: event.target.value })}
                >
                  <option value="RESTOCK">Restock</option>
                  <option value="CORRECTION">Correction</option>
                  <option value="DAMAGE">Damage</option>
                </select>
              </label>
            </div>
            <label>
              <span>Note</span>
              <input
                maxLength={500}
                value={adjustment.note}
                onChange={(event) => setAdjustment({ ...adjustment, note: event.target.value })}
              />
            </label>
            <button className="button button--secondary" type="submit" disabled={busy}>
              Apply adjustment
            </button>
          </form>

          <form onSubmit={submitThreshold}>
            <h3>Low-stock threshold</h3>
            <label>
              <span>Quantity</span>
              <input
                required
                type="number"
                min="0"
                max="2000000000"
                value={threshold}
                onChange={(event) => setThreshold(event.target.value)}
              />
            </label>
            <button className="button button--quiet" type="submit" disabled={busy}>
              Save threshold
            </button>
          </form>
        </div>
      ) : null}

      <button
        className="history-toggle"
        type="button"
        onClick={() =>
          history.status === "closed" ? loadHistory() : setHistory({ ...history, status: "closed" })
        }
      >
        {history.status === "closed" ? "View adjustment history" : "Hide adjustment history"}
      </button>

      {history.status === "loading" ? <p role="status">Loading history…</p> : null}
      {history.error ? (
        <p className="form-error" role="alert">
          {history.error}
        </p>
      ) : null}
      {history.status === "ready" ? (
        <div className="adjustment-history">
          {history.adjustments.length === 0 ? <p className="muted">No adjustments yet.</p> : null}
          {history.adjustments.map((entry) => (
            <div key={entry.id}>
              <strong>
                {entry.delta > 0 ? "+" : ""}
                {entry.delta} · {entry.reason}
              </strong>
              <span>
                {entry.quantityBefore} → {entry.quantityAfter}
              </span>
              <span>{entry.actor?.displayName ?? "Former user"}</span>
              {entry.note ? <small>{entry.note}</small> : null}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function InventoryPage() {
  const auth = useAuth();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [state, setState] = useState({ status: "loading", inventory: [], meta: null, error: "" });

  useEffect(() => {
    const controller = new AbortController();
    listInventory({ search, signal: controller.signal })
      .then(({ inventory, meta }) => setState({ status: "ready", inventory, meta, error: "" }))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setState({ status: "error", inventory: [], meta: null, error: error.message });
        }
      });
    return () => controller.abort();
  }, [search]);

  function replaceInventory(updated) {
    setState((current) => ({
      ...current,
      inventory: current.inventory.map((entry) =>
        entry.product.id === updated.product.id ? updated : entry,
      ),
    }));
  }

  return (
    <section className="admin-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">STOCK CONTROL</p>
          <h1>Inventory</h1>
          <p className="muted">
            Exact balances, low-stock state, and immutable adjustment history.
          </p>
        </div>
        <span className="record-count">{state.meta?.total ?? 0} balances</span>
      </div>

      <form
        className="inventory-search"
        onSubmit={(event) => {
          event.preventDefault();
          setState((current) => ({ ...current, status: "loading", error: "" }));
          setSearch(draftSearch.trim());
        }}
      >
        <label>
          <span>Search inventory</span>
          <input
            maxLength={100}
            value={draftSearch}
            placeholder="Product name or SKU"
            onChange={(event) => setDraftSearch(event.target.value)}
          />
        </label>
        <button className="button button--secondary" type="submit">
          Search
        </button>
      </form>

      {state.error ? (
        <p className="global-alert" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.status === "loading" ? (
        <p className="route-state" role="status">
          Loading inventory…
        </p>
      ) : null}
      {state.status === "ready" && state.inventory.length === 0 ? (
        <section className="panel empty-state">
          <h2>No inventory found</h2>
          <p className="muted">Create a product or change the search.</p>
        </section>
      ) : null}

      <div className="inventory-grid">
        {state.inventory.map((balance) => (
          <InventoryCard
            balance={balance}
            canAdjust={auth.hasPermission("inventory:adjust")}
            key={`${balance.product.id}-${balance.version}`}
            onUpdated={replaceInventory}
          />
        ))}
      </div>
    </section>
  );
}
