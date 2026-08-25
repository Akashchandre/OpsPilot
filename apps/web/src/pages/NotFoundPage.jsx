import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="panel route-state">
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p className="muted">The page you requested does not exist.</p>
      <Link className="button button--primary" to="/">
        Return home
      </Link>
    </section>
  );
}
