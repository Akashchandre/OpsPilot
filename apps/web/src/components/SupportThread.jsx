export function SupportThread({ messages }) {
  if (messages.length === 0) {
    return <p className="muted">No messages are visible in this ticket.</p>;
  }
  return (
    <div className="support-thread" aria-label="Ticket messages">
      {messages.map((message) => (
        <article
          className={`support-message${message.visibility === "INTERNAL" ? " support-message--internal" : ""}`}
          key={message.id}
        >
          <div className="support-message__heading">
            <strong>{message.author?.displayName ?? "System"}</strong>
            <span>
              {message.visibility === "INTERNAL" ? "Internal note · " : ""}
              {new Date(message.createdAt).toLocaleString()}
            </span>
          </div>
          <p>{message.body}</p>
        </article>
      ))}
    </div>
  );
}
