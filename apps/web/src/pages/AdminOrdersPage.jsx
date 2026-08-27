import { useCallback, useEffect, useRef, useState } from "react";
import {
  getOrder,
  listOrders,
  reconcilePayment,
  refundPayment,
  updateOrderStatus,
} from "../api/commerce.js";
import { Money } from "../components/Money.jsx";
import { OrderSummaryCard } from "../components/OrderSummaryCard.jsx";
import { useAuth } from "../auth/auth-context.js";

export function AdminOrdersPage() {
  const auth = useAuth();
  const refundKeys = useRef(new Map());
  const [listState, setListState] = useState({ status: "loading", orders: [], error: "" });
  const [detailState, setDetailState] = useState({ status: "idle", order: null, error: "" });

  const loadList = useCallback(async () => {
    setListState((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const { orders } = await listOrders({ view: "management", limit: 100 });
      setListState({ status: "ready", orders, error: "" });
    } catch (error) {
      setListState({ status: "error", orders: [], error: error.message });
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  async function selectOrder(orderId) {
    setDetailState({ status: "loading", order: null, error: "" });
    try {
      const order = await getOrder(orderId, { view: "management" });
      setDetailState({ status: "ready", order, error: "" });
    } catch (error) {
      setDetailState({ status: "error", order: null, error: error.message });
    }
  }

  async function runAction(action) {
    setDetailState((current) => ({ ...current, status: "saving", error: "" }));
    try {
      const order = await action();
      setDetailState({ status: "ready", order, error: "" });
      await loadList();
    } catch (error) {
      setDetailState((current) => ({ ...current, status: "ready", error: error.message }));
    }
  }

  async function transition(status, extra = {}) {
    return runAction(() =>
      updateOrderStatus(detailState.order.id, {
        status,
        version: detailState.order.version,
        ...extra,
      }),
    );
  }

  async function refund() {
    setDetailState((current) => ({ ...current, status: "saving", error: "" }));
    try {
      const paymentId = detailState.order.payment.id;
      const key = refundKeys.current.get(paymentId) ?? crypto.randomUUID();
      refundKeys.current.set(paymentId, key);
      const result = await refundPayment(paymentId, key);
      if (result.refund.status !== "PENDING") refundKeys.current.delete(paymentId);
      const order = await getOrder(detailState.order.id, { view: "management" });
      setDetailState({ status: "ready", order, error: "" });
      await loadList();
    } catch (error) {
      setDetailState((current) => ({ ...current, status: "ready", error: error.message }));
    }
  }

  async function reconcile() {
    setDetailState((current) => ({ ...current, status: "saving", error: "" }));
    try {
      await reconcilePayment(detailState.order.payment.id);
      const order = await getOrder(detailState.order.id, { view: "management" });
      setDetailState({ status: "ready", order, error: "" });
      await loadList();
    } catch (error) {
      setDetailState((current) => ({ ...current, status: "ready", error: error.message }));
    }
  }

  const order = detailState.order;
  const canRefund =
    auth.hasPermission("payments:refund") &&
    order?.payment &&
    ["REFUND_PENDING", "REVIEW_REQUIRED"].includes(order.payment.status) &&
    ["CANCELLED", "PAYMENT_REVIEW"].includes(order.status);

  return (
    <section className="management-page commerce-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">OPERATIONS</p>
          <h1>Orders and payments</h1>
          <p className="muted">Fulfillment, full refunds, and per-payment reconciliation.</p>
        </div>
        <button className="button button--quiet" type="button" onClick={loadList}>
          Refresh
        </button>
      </div>
      {listState.error ? (
        <p className="global-alert" role="alert">
          {listState.error}
        </p>
      ) : null}
      <div className="admin-orders-layout">
        <div className="commerce-list">
          {listState.status === "loading" ? <p role="status">Loading managed orders...</p> : null}
          {listState.orders.map((item) => (
            <OrderSummaryCard key={item.id} order={item} management onSelect={selectOrder} />
          ))}
        </div>
        <aside className="panel admin-order-detail">
          {detailState.status === "idle" ? (
            <>
              <h2>Select an order</h2>
              <p className="muted">
                Choose an order to inspect its safe payment and fulfillment state.
              </p>
            </>
          ) : null}
          {detailState.status === "loading" ? <p role="status">Loading order details...</p> : null}
          {detailState.error ? (
            <p className="global-alert" role="alert">
              {detailState.error}
            </p>
          ) : null}
          {order ? (
            <>
              <p className="eyebrow">{order.orderNumber}</p>
              <h2>{order.customer.displayName}</h2>
              <p>{order.customer.email}</p>
              <div className="order-admin-state">
                <span className="badge">{order.status}</span>
                <strong>
                  <Money amount={order.totals.total} currency={order.totals.currency} />
                </strong>
              </div>
              <p>
                Payment: <strong>{order.payment?.status ?? "UNAVAILABLE"}</strong>
              </p>
              <p className="muted">Version {order.version}</p>

              <div className="admin-order-actions">
                {auth.hasPermission("orders:manage") && order.status === "PENDING_PAYMENT" ? (
                  <button
                    className="button button--danger"
                    type="button"
                    onClick={() => transition("CANCELLED")}
                  >
                    Cancel unpaid order
                  </button>
                ) : null}
                {auth.hasPermission("orders:manage") && order.status === "CONFIRMED" ? (
                  <>
                    <button
                      className="button button--primary"
                      type="button"
                      onClick={() => transition("PROCESSING")}
                    >
                      Start processing
                    </button>
                    <button
                      className="button button--danger"
                      type="button"
                      onClick={() => transition("CANCELLED")}
                    >
                      Cancel and require refund
                    </button>
                  </>
                ) : null}
                {auth.hasPermission("orders:manage") && order.status === "PROCESSING" ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      transition("SHIPPED", {
                        carrierName: String(form.get("carrierName")),
                        trackingNumber: String(form.get("trackingNumber")),
                      });
                    }}
                  >
                    <label>
                      <span>Carrier</span>
                      <input name="carrierName" required minLength="2" maxLength="100" />
                    </label>
                    <label>
                      <span>Tracking number</span>
                      <input name="trackingNumber" required minLength="2" maxLength="100" />
                    </label>
                    <button className="button button--primary">Mark shipped</button>
                  </form>
                ) : null}
                {auth.hasPermission("orders:manage") && order.status === "SHIPPED" ? (
                  <button
                    className="button button--primary"
                    type="button"
                    onClick={() => transition("DELIVERED")}
                  >
                    Mark delivered
                  </button>
                ) : null}
                {canRefund ? (
                  <button className="button button--danger" type="button" onClick={refund}>
                    Issue full refund
                  </button>
                ) : null}
                {auth.hasPermission("orders:manage") &&
                order.status === "PAYMENT_REVIEW" &&
                order.payment?.status === "REFUNDED" ? (
                  <button
                    className="button button--danger"
                    type="button"
                    onClick={() => transition("CANCELLED")}
                  >
                    Close reviewed order
                  </button>
                ) : null}
                {order.payment && auth.hasPermission("payments:reconcile") ? (
                  <button className="button button--quiet" type="button" onClick={reconcile}>
                    Reconcile provider state
                  </button>
                ) : null}
              </div>
              <h3>Shipping</h3>
              <address>
                {order.shippingAddress.recipientName}
                <br />
                {order.shippingAddress.addressLine1}
                <br />
                {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
                {order.shippingAddress.postalCode}
                <br />
                {order.shippingAddress.phone}
              </address>
              <h3>Items</h3>
              <div className="detail-lines">
                {order.items.map((item) => (
                  <div key={item.id}>
                    <span>
                      {item.name} × {item.quantity}
                    </span>
                    <strong>
                      <Money amount={item.lineTotal} currency={item.currency} />
                    </strong>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
