import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listOrders } from "../api/commerce.js";
import { createSupportTicket } from "../api/support.js";

const categories = ["GENERAL", "ORDER", "PAYMENT", "PRODUCT", "ACCOUNT"];

export function NewSupportTicketPage() {
  const navigate = useNavigate();
  const idempotencyKey = useRef(null);
  const [ordersState, setOrdersState] = useState({ status: "loading", orders: [], error: "" });
  const [form, setForm] = useState({
    category: "GENERAL",
    subject: "",
    message: "",
    orderId: "",
  });
  const [submission, setSubmission] = useState({ status: "idle", error: "" });

  useEffect(() => {
    const controller = new AbortController();
    listOrders({ limit: 100, signal: controller.signal })
      .then(({ orders }) => setOrdersState({ status: "ready", orders, error: "" }))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setOrdersState({ status: "error", orders: [], error: error.message });
        }
      });
    return () => controller.abort();
  }, []);

  function updateField(name, value) {
    idempotencyKey.current = null;
    setForm((current) => ({ ...current, [name]: value }));
    setSubmission((current) => ({ ...current, error: "" }));
  }

  async function submit(event) {
    event.preventDefault();
    setSubmission({ status: "saving", error: "" });
    try {
      idempotencyKey.current ??= crypto.randomUUID();
      const ticket = await createSupportTicket(
        {
          category: form.category,
          subject: form.subject,
          message: form.message,
          ...(form.orderId ? { orderId: form.orderId } : {}),
        },
        idempotencyKey.current,
      );
      navigate(`/support/${ticket.id}`, { replace: true, state: { created: true } });
    } catch (error) {
      setSubmission({ status: "error", error: error.message });
    }
  }

  return (
    <section className="support-page">
      <Link className="back-link" to="/support">
        Back to support
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">NEW REQUEST</p>
          <h1>Create a support ticket</h1>
          <p className="muted">
            Describe the issue in plain text. Do not include passwords or card details.
          </p>
        </div>
      </div>
      <form className="panel support-form" onSubmit={submit}>
        {submission.error ? (
          <p className="global-alert" role="alert">
            {submission.error}
          </p>
        ) : null}
        <label>
          <span>Category</span>
          <select
            value={form.category}
            onChange={(event) => updateField("category", event.target.value)}
          >
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Subject</span>
          <input
            value={form.subject}
            onChange={(event) => updateField("subject", event.target.value)}
            minLength="5"
            maxLength="160"
            required
          />
          <small>5–160 characters</small>
        </label>
        <label>
          <span>Message</span>
          <textarea
            value={form.message}
            onChange={(event) => updateField("message", event.target.value)}
            minLength="1"
            maxLength="4000"
            rows="8"
            required
          />
          <small>{form.message.length}/4000 characters</small>
        </label>
        <label>
          <span>Related order (optional)</span>
          <select
            value={form.orderId}
            onChange={(event) => updateField("orderId", event.target.value)}
            disabled={ordersState.status === "loading"}
          >
            <option value="">No related order</option>
            {ordersState.orders.map((order) => (
              <option value={order.id} key={order.id}>
                {order.orderNumber} · {order.status}
              </option>
            ))}
          </select>
        </label>
        {ordersState.status === "loading" ? <p role="status">Loading your orders...</p> : null}
        {ordersState.error ? (
          <p className="global-alert" role="alert">
            Orders could not be loaded. You can still create a ticket without linking one.
          </p>
        ) : null}
        <div className="commerce-actions">
          <button
            className="button button--primary"
            type="submit"
            disabled={submission.status === "saving"}
          >
            {submission.status === "saving" ? "Creating ticket..." : "Create ticket"}
          </button>
          <Link className="button button--quiet" to="/support">
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
