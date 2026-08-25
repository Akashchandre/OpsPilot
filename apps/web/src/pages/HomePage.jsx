import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getHealth } from "../api/health.js";

const initialHealth = { state: "loading", message: "Checking the platform services…" };

export function HomePage() {
  const [health, setHealth] = useState(initialHealth);

  useEffect(() => {
    const controller = new AbortController();
    getHealth({ signal: controller.signal })
      .then(() => {
        setHealth({ state: "healthy", message: "Web, API, and MySQL are connected." });
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setHealth({ state: "unavailable", message: "Platform services are unavailable." });
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="hero">
      <div className="hero__content">
        <p className="eyebrow">SECURE BUSINESS OPERATIONS</p>
        <h1>One dependable place to run the work.</h1>
        <p className="hero__summary">
          OpsPilot now has a secure identity and permission foundation for customer and operator
          experiences.
        </p>
        <div className="hero__actions">
          <Link className="button button--primary" to="/register">
            Create customer account
          </Link>
          <Link className="button button--secondary" to="/login">
            Sign in
          </Link>
        </div>
      </div>

      <aside className="status-card" aria-label="Platform readiness">
        <p className="status-card__label">Platform readiness</p>
        <div className={`health health--${health.state}`} role="status" aria-live="polite">
          <span className="health__indicator" aria-hidden="true" />
          <div>
            <strong>{health.state === "healthy" ? "Foundation ready" : "Service status"}</strong>
            <p>{health.message}</p>
          </div>
        </div>
        <dl className="stack-list">
          <div>
            <dt>Identity</dt>
            <dd>Opaque sessions</dd>
          </div>
          <div>
            <dt>Access</dt>
            <dd>Deny-by-default RBAC</dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>MySQL + Prisma</dd>
          </div>
        </dl>
      </aside>
    </section>
  );
}
