export function AiQuestionForm({
  question,
  onQuestionChange,
  onSubmit,
  status,
  error,
  label = "Question",
  placeholder,
  buttonLabel = "Ask AI",
  children,
}) {
  const submitting = status === "submitting";

  return (
    <form className="panel ai-question-form" onSubmit={onSubmit}>
      {children}
      <label>
        <span>{label}</span>
        <textarea
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          placeholder={placeholder}
          maxLength={2000}
          rows={5}
          required
          disabled={submitting}
        />
        <small>{question.length} / 2,000 characters</small>
      </label>
      <div className="ai-form-actions">
        <button
          className="button button--primary"
          type="submit"
          disabled={submitting || question.trim().length === 0}
        >
          {submitting ? "Waiting for AI..." : buttonLabel}
        </button>
        {submitting ? <span role="status">Generating one non-streaming response...</span> : null}
      </div>
      {error ? (
        <p className="global-alert" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
