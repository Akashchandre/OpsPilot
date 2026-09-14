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
    <div className="home-page">
      <section className="hero">
        <div className="hero__content">
          <p className="eyebrow eyebrow--pill">COMMERCE + OPERATIONS</p>
          <h1>
            Run your business with <span>clarity.</span>
          </h1>
          <p className="hero__summary">
            One secure workspace for product discovery, customer orders, inventory, support, and
            day-to-day operations—designed around permission-aware access.
          </p>
          <div className="hero__actions">
            <Link className="button button--primary button--large" to="/products">
              Explore the catalog <span aria-hidden="true">→</span>
            </Link>
            <Link className="button button--secondary button--large" to="/login">
              Sign in to workspace
            </Link>
          </div>
          <div className="hero__assurance" aria-label="Platform assurances">
            <span>Secure sessions</span>
            <span>Role-based access</span>
            <span>Verified operations</span>
          </div>
        </div>

        <aside className="status-card" aria-label="Platform readiness">
          <div className="status-card__heading">
            <p className="status-card__label">Platform readiness</p>
            <span className="status-card__secure">Protected</span>
          </div>
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
              <dd>Secure sessions</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>Deny-by-default RBAC</dd>
            </div>
            <div>
              <dt>Operations</dt>
              <dd>Server verified</dd>
            </div>
          </dl>
          <p className="status-card__footnote">Live service status is checked securely on load.</p>
        </aside>
      </section>

      <section className="capability-section" aria-labelledby="capabilities-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ONE CONNECTED WORKSPACE</p>
            <h2 id="capabilities-title">Built for the work behind every order.</h2>
          </div>
          <p>Clear customer journeys meet controlled operational tools.</p>
        </div>
        <div className="capability-grid">
          <article className="capability-card capability-card--commerce">
            <span className="capability-card__index">01</span>
            <h3>Commerce that feels effortless</h3>
            <p>Discover products, manage a cart, and follow every order from one polished flow.</p>
            <Link to="/products">
              Browse products <span aria-hidden="true">→</span>
            </Link>
          </article>
          <article className="capability-card capability-card--operations">
            <span className="capability-card__index">02</span>
            <h3>Operations with guardrails</h3>
            <p>
              Authorized teams manage inventory, customers, support, and reporting with clarity.
            </p>
            <Link to="/login">
              Open workspace <span aria-hidden="true">→</span>
            </Link>
          </article>
          <article className="capability-card capability-card--control">
            <span className="capability-card__index">03</span>
            <h3>Security in every workflow</h3>
            <p>Permission checks and server-verified state keep important actions controlled.</p>
            <span className="capability-card__label">Secure by design</span>
          </article>
        </div>
      </section>
    </div>
  );
}
