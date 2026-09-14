import { useAuth } from "../auth/auth-context.js";
import { Link } from "react-router-dom";

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <section className="dashboard-grid">
      <div className="panel panel--hero">
        <p className="eyebrow">SECURE SESSION ACTIVE</p>
        <h1>Welcome, {user.displayName}.</h1>
        <p className="muted">
          Your account and access are resolved from the API on every protected request.
        </p>
      </div>
      <div className="panel dashboard-actions">
        <div className="panel-heading-row">
          <div>
            <p className="eyebrow">QUICK ACCESS</p>
            <h2>Continue your work</h2>
          </div>
          <span className="badge badge--active">READY</span>
        </div>
        <div className="quick-link-grid">
          <Link to="/products">
            <strong>Products</strong>
            <span>Browse the active catalog →</span>
          </Link>
          <Link to="/orders">
            <strong>Orders</strong>
            <span>Review order history →</span>
          </Link>
          <Link to="/support">
            <strong>Support</strong>
            <span>Manage your requests →</span>
          </Link>
          <Link to="/cart">
            <strong>Cart</strong>
            <span>Continue checkout →</span>
          </Link>
        </div>
      </div>
      <div className="panel">
        <h2>Identity</h2>
        <dl className="details-list">
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span className="badge badge--active">{user.status}</span>
            </dd>
          </div>
          <div>
            <dt>Roles</dt>
            <dd>{user.roles.join(", ") || "No assigned role"}</dd>
          </div>
        </dl>
      </div>
      <div className="panel">
        <h2>Permissions</h2>
        {user.permissions.length > 0 ? (
          <ul className="permission-list">
            {user.permissions.map((permission) => (
              <li key={permission}>{permission}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">This account has no administrative permissions.</p>
        )}
      </div>
    </section>
  );
}
