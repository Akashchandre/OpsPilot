import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/auth-context.js";
import { NotificationCenter } from "./NotificationCenter.jsx";

export function AppLayout() {
  const auth = useAuth();
  const [logoutError, setLogoutError] = useState("");

  async function handleLogout() {
    setLogoutError("");
    try {
      await auth.logout();
    } catch (error) {
      setLogoutError(error.message);
    }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/" aria-label="OpsPilot home">
          <span className="brand__mark" aria-hidden="true">
            OP
          </span>
          <span>OpsPilot</span>
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/products">Products</NavLink>
          {auth.user ? (
            <>
              <NavLink to="/cart">Cart</NavLink>
              <NavLink to="/orders">Orders</NavLink>
              <NavLink to="/support">Support</NavLink>
              <NavLink to="/dashboard">Dashboard</NavLink>
              {auth.hasPermission("ai:customer:use") ? (
                <>
                  <NavLink to="/assistant" end>
                    Assistant
                  </NavLink>
                  <NavLink to="/assistant/documents">Document help</NavLink>
                </>
              ) : null}
            </>
          ) : null}
          {auth.hasPermission("products:manage") ? (
            <NavLink to="/admin/catalog">Catalog</NavLink>
          ) : null}
          {auth.hasPermission("inventory:read") ? (
            <NavLink to="/admin/inventory">Inventory</NavLink>
          ) : null}
          {auth.hasPermission("orders:read") ? (
            <NavLink to="/admin/orders">Order ops</NavLink>
          ) : null}
          {auth.hasPermission("users:read") ? <NavLink to="/admin/users">Users</NavLink> : null}
          {auth.hasPermission("support:tickets:read") ? (
            <NavLink to="/admin/support">Support ops</NavLink>
          ) : null}
          {auth.hasPermission("reports:read") ? (
            <NavLink to="/admin/reports">Reports</NavLink>
          ) : null}
          {auth.hasPermission("jobs:read") ? <NavLink to="/admin/jobs">Jobs</NavLink> : null}
          {auth.hasPermission("documents:read") ? (
            <NavLink to="/admin/documents">Documents</NavLink>
          ) : null}
          {auth.hasPermission("ai:owner:use") ? (
            <NavLink to="/admin/document-assistant">Document AI</NavLink>
          ) : null}
          {auth.hasPermission("ai:owner:use") && auth.hasPermission("reports:read") ? (
            <NavLink to="/admin/assistant">AI overview</NavLink>
          ) : null}
          {auth.hasPermission("ai:workflows:business:use") ? (
            <NavLink to="/admin/workflows">AI workflows</NavLink>
          ) : null}
        </nav>
        <div className="session-actions">
          {auth.user ? (
            <>
              <NotificationCenter />
              <span className="session-user">{auth.user.displayName}</span>
              <button className="button button--quiet" type="button" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link className="button button--quiet" to="/login">
                Log in
              </Link>
              <Link className="button button--primary" to="/register">
                Create account
              </Link>
            </>
          )}
        </div>
      </header>

      {logoutError ? (
        <p className="global-alert" role="alert">
          {logoutError}
        </p>
      ) : null}
      {auth.status === "error" ? (
        <p className="global-alert" role="alert">
          Your session could not be restored. The API may be unavailable.
        </p>
      ) : null}

      <main className="page-shell">
        <Outlet />
      </main>
    </div>
  );
}
