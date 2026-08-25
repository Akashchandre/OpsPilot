import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/auth-context.js";

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
          {auth.user ? <NavLink to="/dashboard">Dashboard</NavLink> : null}
          {auth.hasPermission("users:read") ? <NavLink to="/admin/users">Users</NavLink> : null}
        </nav>
        <div className="session-actions">
          {auth.user ? (
            <>
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
