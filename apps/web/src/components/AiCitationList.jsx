import { useState } from "react";
import { getAiDocumentCitation } from "../api/ai.js";

function AiCitation({ citation }) {
  const [state, setState] = useState({ status: "idle", citation, error: "" });

  async function verify() {
    setState((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const current = await getAiDocumentCitation(citation.id);
      setState({ status: "ready", citation: current, error: "" });
    } catch (error) {
      setState({
        status: "error",
        citation: null,
        error:
          error?.code === "AI_DOCUMENT_CITATION_NOT_FOUND"
            ? "This source is no longer available to you."
            : error.message,
      });
    }
  }

  return (
    <li className="ai-citation">
      {state.citation ? (
        <>
          <div className="ai-citation__heading">
            <strong>
              {state.citation.label}: {state.citation.title}
            </strong>
            <span>Version {state.citation.versionNumber}</span>
          </div>
          <p>{state.citation.excerpt}</p>
        </>
      ) : null}
      <button
        className="button button--quiet"
        type="button"
        onClick={verify}
        disabled={state.status === "loading"}
      >
        {state.status === "loading" ? "Verifying..." : `Verify ${citation.label} source`}
      </button>
      {state.error ? (
        <p className="inline-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}

export function AiCitationList({ citations }) {
  if (!citations?.length) return null;
  return (
    <div className="ai-citations">
      <h3>Authorized sources</h3>
      <ol>
        {citations.map((citation) => (
          <AiCitation citation={citation} key={citation.id} />
        ))}
      </ol>
    </div>
  );
}
