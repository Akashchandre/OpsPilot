import { useEffect, useState } from "react";
import { getHealth } from "./api/health.js";
import "./styles.css";

const initialState = { state: "loading", message: "Checking the platform foundation…" };

export default function App() {
  const [health, setHealth] = useState(initialState);

  useEffect(() => {
    const controller = new AbortController();

    getHealth({ signal: controller.signal })
      .then(() => {
        setHealth({ state: "healthy", message: "Frontend, API, and database are connected." });
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setHealth({
            state: "unavailable",
            message: "The platform foundation is currently unavailable.",
          });
        }
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="shell">
      <section className="status-card" aria-labelledby="page-title">
        <p className="eyebrow">AI BUSINESS OPERATIONS PLATFORM</p>
        <h1 id="page-title">OpsPilot</h1>
        <p className="summary">
          Phase 1 establishes a dependable base for everything that follows.
        </p>

        <div className={`health health--${health.state}`} role="status" aria-live="polite">
          <span className="health__indicator" aria-hidden="true" />
          <div>
            <strong>{health.state === "healthy" ? "Foundation ready" : "Foundation status"}</strong>
            <p>{health.message}</p>
          </div>
        </div>

        <dl className="stack-list">
          <div>
            <dt>Web</dt>
            <dd>React + JavaScript</dd>
          </div>
          <div>
            <dt>API</dt>
            <dd>Node.js + Express</dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>MySQL + Prisma</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
