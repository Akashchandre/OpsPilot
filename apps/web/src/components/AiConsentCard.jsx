import { useState } from "react";

export function AiConsentCard({ consent, status, error, onAccept, onRevoke }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const busy = status === "loading" || status === "saving";

  if (!consent && status === "loading") {
    return <p role="status">Loading the AI processing notice...</p>;
  }

  if (!consent) {
    return (
      <section className="panel ai-consent" aria-labelledby="ai-consent-title">
        <h2 id="ai-consent-title">AI processing notice unavailable</h2>
        <p className="global-alert" role="alert">
          {error || "The processing notice could not be loaded."}
        </p>
      </section>
    );
  }

  const notice = consent.notice;
  return (
    <section className="panel ai-consent" aria-labelledby="ai-consent-title">
      <div className="ai-card-heading">
        <div>
          <p className="eyebrow">{consent.active ? "CONSENT ACTIVE" : "CONSENT REQUIRED"}</p>
          <h2 id="ai-consent-title">{notice.title}</h2>
        </div>
        {consent.active ? <span className="badge">xAI</span> : null}
      </div>
      <dl className="ai-notice-details">
        <div>
          <dt>Provider</dt>
          <dd>{notice.providerName}</dd>
        </div>
        <div>
          <dt>Data sent</dt>
          <dd>{notice.dataSent}</dd>
        </div>
        <div>
          <dt>Retention control</dt>
          <dd>{notice.retention}</dd>
        </div>
        <div>
          <dt>Output</dt>
          <dd>{notice.generatedOutput}</dd>
        </div>
      </dl>
      <p className="ai-warning">{notice.warning}</p>
      {error ? (
        <p className="global-alert" role="alert">
          {error}
        </p>
      ) : null}
      {consent.active ? (
        <button className="button button--quiet" type="button" onClick={onRevoke} disabled={busy}>
          {status === "saving" ? "Saving..." : "Revoke AI consent"}
        </button>
      ) : (
        <form
          className="ai-consent-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const accepted = await onAccept();
            if (accepted?.active) setAcknowledged(false);
          }}
        >
          <label>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>I understand what is sent to xAI and that its response may be incorrect.</span>
          </label>
          <button className="button button--primary" type="submit" disabled={!acknowledged || busy}>
            {status === "saving" ? "Saving..." : "Accept and continue"}
          </button>
        </form>
      )}
    </section>
  );
}
