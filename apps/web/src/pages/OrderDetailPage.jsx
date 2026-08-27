import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { cancelOwnOrder, confirmPayment, getOrder, getPaymentSession } from "../api/commerce.js";
import { Money } from "../components/Money.jsx";
import { openRazorpayCheckout } from "../payments/razorpayCheckout.js";

export function OrderDetailPage() {
  const { orderId } = useParams();
  const [state, setState] = useState({ status: "loading", order: null, error: "" });

  useEffect(() => {
    const controller = new AbortController();
    getOrder(orderId, { signal: controller.signal })
      .then((order) => setState({ status: "ready", order, error: "" }))
      .catch((error) => {
        if (error.name !== "AbortError")
          setState({ status: "error", order: null, error: error.message });
      });
    return () => controller.abort();
  }, [orderId]);

  async function cancelOrder() {
    setState((current) => ({ ...current, status: "saving", error: "" }));
    try {
      const order = await cancelOwnOrder(state.order.id, state.order.version);
      setState({ status: "ready", order, error: "" });
    } catch (error) {
      setState((current) => ({ ...current, status: "ready", error: error.message }));
    }
  }

  async function resumePayment() {
    setState((current) => ({ ...current, status: "saving", error: "" }));
    try {
      const result = await getPaymentSession(state.order.id);
      if (!result.checkout) {
        setState({
          status: "ready",
          order: result.order,
          error: "Secure payment setup is pending. Try again shortly.",
        });
        return;
      }
      await openRazorpayCheckout(result, {
        onResult: async (providerResult) => {
          setState((current) => ({ ...current, status: "saving", error: "" }));
          try {
            const confirmation = await confirmPayment({
              orderId: result.order.id,
              providerOrderId: providerResult.razorpay_order_id,
              providerPaymentId: providerResult.razorpay_payment_id,
              signature: providerResult.razorpay_signature,
            });
            setState({
              status: "ready",
              order: confirmation.order,
              error: confirmation.confirmationPending
                ? "Payment confirmation is pending. Recheck this order shortly."
                : "",
            });
          } catch (error) {
            setState((current) => ({ ...current, status: "ready", error: error.message }));
          }
        },
        onDismiss() {
          setState((current) => ({
            ...current,
            status: "ready",
            error: "Checkout was closed. The order remains payable until its reservation expires.",
          }));
        },
        onFailure() {
          setState((current) => ({
            ...current,
            status: "ready",
            error: "Payment was not completed. You can safely retry.",
          }));
        },
      });
      setState((current) => ({ ...current, status: "ready" }));
    } catch (error) {
      setState((current) => ({ ...current, status: "ready", error: error.message }));
    }
  }

  if (state.status === "loading") return <p role="status">Loading order...</p>;
  if (!state.order)
    return (
      <section className="panel route-state" role="alert">
        <h1>Order unavailable</h1>
        <p>{state.error}</p>
        <Link to="/orders">Back to orders</Link>
      </section>
    );
  const order = state.order;

  return (
    <section className="commerce-page order-detail-page">
      <Link className="back-link" to="/orders">
        Back to orders
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{order.orderNumber}</p>
          <h1>Order details</h1>
          <p className="muted">Placed {new Date(order.createdAt).toLocaleString()}</p>
        </div>
        <div className="order-card__state">
          <span className="badge">{order.status}</span>
          <strong className="price">
            <Money amount={order.totals.total} currency={order.totals.currency} />
          </strong>
        </div>
      </div>
      {state.error ? (
        <p className="global-alert" role="alert">
          {state.error}
        </p>
      ) : null}
      {order.status === "PENDING_PAYMENT" ? (
        <div className="panel checkout-pending">
          <h2>Payment pending</h2>
          <p>
            Your stock is reserved until {new Date(order.reservationExpiresAt).toLocaleString()}.
          </p>
          <div className="commerce-actions">
            <button
              className="button button--primary"
              type="button"
              onClick={resumePayment}
              disabled={state.status === "saving"}
            >
              Retry secure payment
            </button>
            <button
              className="button button--danger"
              type="button"
              onClick={cancelOrder}
              disabled={state.status === "saving"}
            >
              Cancel unpaid order
            </button>
          </div>
        </div>
      ) : null}
      {order.status === "PAYMENT_REVIEW" ? (
        <p className="global-alert" role="alert">
          Payment requires operator review. Fulfillment is paused.
        </p>
      ) : null}

      <div className="order-detail-grid">
        <section className="panel">
          <h2>Items</h2>
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
          <div className="checkout-summary">
            <span>Total</span>
            <strong>
              <Money amount={order.totals.total} currency={order.totals.currency} />
            </strong>
          </div>
        </section>
        <section className="panel">
          <h2>Shipping address</h2>
          <address>
            {order.shippingAddress.recipientName}
            <br />
            {order.shippingAddress.addressLine1}
            <br />
            {order.shippingAddress.addressLine2 ? (
              <>
                {order.shippingAddress.addressLine2}
                <br />
              </>
            ) : null}
            {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
            {order.shippingAddress.postalCode}
            <br />
            India
            <br />
            {order.shippingAddress.phone}
          </address>
          {order.fulfillment.trackingNumber ? (
            <p>
              <strong>{order.fulfillment.carrierName}</strong>
              <br />
              Tracking: {order.fulfillment.trackingNumber}
            </p>
          ) : null}
        </section>
        <section className="panel">
          <h2>Payment</h2>
          <p>
            Status: <strong>{order.payment?.status ?? "UNAVAILABLE"}</strong>
          </p>
          <p className="muted">Provider: {order.payment?.provider ?? "—"}</p>
          {(order.payment?.refunds ?? []).map((refund) => (
            <p key={refund.id}>
              Refund: <strong>{refund.status}</strong> ·{" "}
              <Money amount={refund.amount} currency={refund.currency} />
            </p>
          ))}
        </section>
        <section className="panel">
          <h2>Status history</h2>
          <ol className="status-history">
            {order.statusHistory.map((event) => (
              <li key={event.id}>
                <strong>{event.toStatus}</strong>
                <span>{event.reasonCode}</span>
                <small>{new Date(event.createdAt).toLocaleString()}</small>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </section>
  );
}
