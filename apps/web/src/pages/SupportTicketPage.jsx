import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { addSupportMessage, closeSupportTicket, getSupportTicket } from "../api/support.js";
import { SupportThread } from "../components/SupportThread.jsx";

export function SupportTicketPage() {
  const { ticketId } = useParams();
  const location = useLocation();
  const replyKey = useRef(null);
  const [state, setState] = useState({ status: "loading", ticket: null, error: "" });
  const [reply, setReply] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getSupportTicket(ticketId, { signal: controller.signal })
      .then((ticket) => setState({ status: "ready", ticket, error: "" }))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setState({ status: "error", ticket: null, error: error.message });
        }
      });
    return () => controller.abort();
  }, [ticketId]);

  async function submitReply(event) {
    event.preventDefault();
    setState((current) => ({ ...current, status: "saving", error: "" }));
    try {
      replyKey.current ??= crypto.randomUUID();
      const ticket = await addSupportMessage(ticketId, { body: reply }, replyKey.current);
      replyKey.current = null;
      setReply("");
      setState({ status: "ready", ticket, error: "" });
    } catch (error) {
      setState((current) => ({ ...current, status: "ready", error: error.message }));
    }
  }

  async function closeTicket() {
    setState((current) => ({ ...current, status: "saving", error: "" }));
    try {
      const ticket = await closeSupportTicket(ticketId, state.ticket.version);
      setState({ status: "ready", ticket, error: "" });
    } catch (error) {
      setState((current) => ({ ...current, status: "ready", error: error.message }));
    }
  }

  if (state.status === "loading") return <p role="status">Loading support ticket...</p>;
  if (!state.ticket) {
    return (
      <section className="panel route-state" role="alert">
        <h1>Ticket unavailable</h1>
        <p>{state.error}</p>
        <Link to="/support">Back to support</Link>
      </section>
    );
  }
  const ticket = state.ticket;

  return (
    <section className="support-page">
      <Link className="back-link" to="/support">
        Back to support
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{ticket.ticketNumber}</p>
          <h1>{ticket.subject}</h1>
          <p className="muted">
            {ticket.category} · Opened {new Date(ticket.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="support-card__state">
          <span className="badge">{ticket.status}</span>
          <span className="support-priority">{ticket.priority}</span>
        </div>
      </div>
      {location.state?.created ? (
        <p className="success-message" role="status">
          Your support ticket was created.
        </p>
      ) : null}
      {state.error ? (
        <p className="global-alert" role="alert">
          {state.error}
        </p>
      ) : null}
      {ticket.linkedOrder ? (
        <p className="panel support-order-link">
          Related order:{" "}
          <Link to={`/orders/${ticket.linkedOrder.id}`}>{ticket.linkedOrder.orderNumber}</Link>
          <span>{ticket.linkedOrder.status}</span>
        </p>
      ) : null}

      <section className="panel">
        <h2>Conversation</h2>
        <SupportThread messages={ticket.messages} />
      </section>

      {ticket.status !== "CLOSED" ? (
        <section className="support-actions-grid">
          <form className="panel support-form" onSubmit={submitReply}>
            <h2>Add a reply</h2>
            <label>
              <span>Message</span>
              <textarea
                value={reply}
                onChange={(event) => {
                  replyKey.current = null;
                  setReply(event.target.value);
                }}
                minLength="1"
                maxLength="4000"
                rows="6"
                required
              />
              <small>{reply.length}/4000 characters</small>
            </label>
            {ticket.status === "WAITING_CUSTOMER" || ticket.status === "RESOLVED" ? (
              <p className="muted">Your reply will reopen this ticket.</p>
            ) : null}
            <button
              className="button button--primary"
              type="submit"
              disabled={state.status === "saving"}
            >
              Send reply
            </button>
          </form>
          <aside className="panel support-close-panel">
            <h2>Close ticket</h2>
            <p className="muted">Closing is final. A closed ticket cannot receive more replies.</p>
            <button
              className="button button--danger"
              type="button"
              onClick={closeTicket}
              disabled={state.status === "saving"}
            >
              Close ticket
            </button>
          </aside>
        </section>
      ) : (
        <div className="panel empty-state">
          <h2>This ticket is closed</h2>
          <p>Create a new ticket if you need more help.</p>
        </div>
      )}

      <details className="panel support-history">
        <summary>Ticket history</summary>
        <ol className="status-history">
          {ticket.history.map((event) => (
            <li key={event.id}>
              <strong>{event.eventType}</strong>
              <span>{event.reasonCode}</span>
              <small>{new Date(event.createdAt).toLocaleString()}</small>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
