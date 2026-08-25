import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context.js";

export function RegisterPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ displayName: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (auth.user) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await auth.register(form);
      navigate("/dashboard", { replace: true });
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="register-title">
      <div>
        <p className="eyebrow">CUSTOMER ACCESS</p>
        <h1 id="register-title">Create your account</h1>
        <p className="muted">
          Registration creates a customer account with least-privilege access.
        </p>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="register-name">Display name</label>
        <input
          id="register-name"
          autoComplete="name"
          minLength="2"
          maxLength="100"
          required
          value={form.displayName}
          onChange={(event) => setForm({ ...form, displayName: event.target.value })}
        />
        <label htmlFor="register-email">Email</label>
        <input
          id="register-email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
        <label htmlFor="register-password">Password</label>
        <input
          id="register-password"
          type="password"
          autoComplete="new-password"
          minLength="12"
          maxLength="128"
          required
          aria-describedby="password-help"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
        />
        <small id="password-help">Use at least 12 characters.</small>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="button button--primary button--wide" disabled={submitting} type="submit">
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="auth-card__footer">
        Already registered? <Link to="/login">Log in</Link>.
      </p>
    </section>
  );
}
