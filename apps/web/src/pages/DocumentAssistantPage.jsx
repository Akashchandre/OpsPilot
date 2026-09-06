import { useState } from "react";
import { requestDocumentAi } from "../api/ai.js";
import { AiConsentCard } from "../components/AiConsentCard.jsx";
import { AiQuestionForm } from "../components/AiQuestionForm.jsx";
import { AiResponsePanel } from "../components/AiResponsePanel.jsx";
import { useAiConsent } from "../hooks/useAiConsent.js";
import { newSubmissionKey, presentAiError } from "./aiPresentation.js";

const copy = Object.freeze({
  customer: {
    eyebrow: "AI · CUSTOMER DOCUMENTS",
    title: "Company document assistant",
    description:
      "Ask questions grounded in current customer-audience company documents. Answers cite the exact authorized passages used.",
    placeholder: "For example: What does the current returns policy say?",
  },
  owner: {
    eyebrow: "AI · OWNER DOCUMENTS",
    title: "Operations document assistant",
    description:
      "Ask questions grounded in current customer and owner company documents. The model receives only bounded authorized passages.",
    placeholder: "For example: What is the current escalation policy?",
  },
});

export function DocumentAssistantPage({ assistant }) {
  const pageCopy = copy[assistant];
  const consent = useAiConsent(assistant, { documents: true });
  const [question, setQuestion] = useState("");
  const [responseState, setResponseState] = useState({
    status: "idle",
    response: null,
    error: "",
  });

  async function submit(event) {
    event.preventDefault();
    if (!question.trim()) return;
    setResponseState((current) => ({ ...current, status: "submitting", error: "" }));
    try {
      const response = await requestDocumentAi(assistant, question, newSubmissionKey());
      setQuestion("");
      setResponseState({ status: "ready", response, error: "" });
    } catch (error) {
      setResponseState((current) => ({
        ...current,
        status: "error",
        error: presentAiError(error),
      }));
      if (error?.code === "AI_CONSENT_REQUIRED") await consent.reload();
    }
  }

  async function revoke() {
    const revoked = await consent.revoke();
    if (revoked && !revoked.active) {
      setQuestion("");
      setResponseState({ status: "idle", response: null, error: "" });
    }
  }

  return (
    <section className="ai-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{pageCopy.eyebrow}</p>
          <h1>{pageCopy.title}</h1>
          <p className="muted">{pageCopy.description}</p>
        </div>
      </div>

      <AiConsentCard
        consent={consent.consent}
        status={consent.status}
        error={consent.error}
        onAccept={consent.accept}
        onRevoke={revoke}
      />

      {consent.consent?.active ? (
        <AiQuestionForm
          question={question}
          onQuestionChange={setQuestion}
          onSubmit={submit}
          status={responseState.status}
          error={responseState.error}
          placeholder={pageCopy.placeholder}
          buttonLabel="Ask company documents"
        />
      ) : null}

      <AiResponsePanel response={responseState.response} />
    </section>
  );
}

export function CustomerDocumentAssistantPage() {
  return <DocumentAssistantPage assistant="customer" />;
}

export function OwnerDocumentAssistantPage() {
  return <DocumentAssistantPage assistant="owner" />;
}
