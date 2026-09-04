import { useState } from "react";
import { requestCustomerAi } from "../api/ai.js";
import { AiConsentCard } from "../components/AiConsentCard.jsx";
import { AiQuestionForm } from "../components/AiQuestionForm.jsx";
import { AiResponsePanel } from "../components/AiResponsePanel.jsx";
import { useAiConsent } from "../hooks/useAiConsent.js";
import { newSubmissionKey, presentAiError } from "./aiPresentation.js";

export function CustomerAssistantPage() {
  const consent = useAiConsent("customer");
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
      const response = await requestCustomerAi(question, newSubmissionKey());
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
          <p className="eyebrow">AI · CUSTOMER HELP</p>
          <h1>OpsPilot assistant</h1>
          <p className="muted">
            Ask about public OpsPilot features and navigation. This assistant cannot access your
            account, orders, payments, or support messages.
          </p>
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
          placeholder="For example: Where can I see my order status?"
        />
      ) : null}

      <AiResponsePanel response={responseState.response} />
    </section>
  );
}
