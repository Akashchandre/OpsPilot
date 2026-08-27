import { useEffect, useState } from "react";
import { listOrders } from "../api/commerce.js";
import { OrderSummaryCard } from "../components/OrderSummaryCard.jsx";

const statuses = [
  "ALL",
  "PENDING_PAYMENT",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "EXPIRED",
  "PAYMENT_REVIEW",
];

export function OrdersPage() {
  const [status, setStatus] = useState("ALL");
  const [state, setState] = useState({ status: "loading", orders: [], error: "" });

  useEffect(() => {
    const controller = new AbortController();
    listOrders({ status, limit: 50, signal: controller.signal })
      .then(({ orders }) => setState({ status: "ready", orders, error: "" }))
      .catch((error) => {
        if (error.name !== "AbortError")
          setState({ status: "error", orders: [], error: error.message });
      });
    return () => controller.abort();
  }, [status]);

  return (
    <section className="commerce-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ORDER HISTORY</p>
          <h1>Your orders</h1>
          <p className="muted">Provider-verified payment and fulfillment status.</p>
        </div>
        <label>
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => {
              setState((current) => ({ ...current, status: "loading", error: "" }));
              setStatus(event.target.value);
            }}
          >
            {statuses.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      {state.status === "loading" ? <p role="status">Loading orders...</p> : null}
      {state.error ? (
        <p className="global-alert" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.status === "ready" && state.orders.length === 0 ? (
        <div className="panel empty-state">
          <h2>No orders found</h2>
          <p>Your completed checkouts will appear here.</p>
        </div>
      ) : null}
      <div className="commerce-list">
        {state.orders.map((order) => (
          <OrderSummaryCard order={order} key={order.id} />
        ))}
      </div>
    </section>
  );
}
