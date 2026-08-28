import { Link } from "react-router-dom";

export function SupportTicketCard({ ticket, management = false, onSelect }) {
  const content = (
    <>
      <div>
        <p className="eyebrow">{ticket.ticketNumber}</p>
        <h2>{ticket.subject}</h2>
        <p className="muted">
          {ticket.category} / {ticket.messageCount} message{ticket.messageCount === 1 ? "" : "s"}
          {management && ticket.requester ? ` / ${ticket.requester.displayName}` : ""}
        </p>
      </div>
      <div className="support-card__state">
        <span className="badge">{ticket.status}</span>
        <span className="support-priority">{ticket.priority}</span>
        <small>{new Date(ticket.updatedAt).toLocaleString()}</small>
      </div>
    </>
  );

  if (onSelect) {
    return (
      <button
        className="panel support-card support-card--button"
        type="button"
        onClick={() => onSelect(ticket.id)}
      >
        {content}
      </button>
    );
  }
  return (
    <Link className="panel support-card" to={`/support/${ticket.id}`}>
      {content}
    </Link>
  );
}
