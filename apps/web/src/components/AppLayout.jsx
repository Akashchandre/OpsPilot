import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/auth-context.js";
import { AppToaster } from "./AppToaster.jsx";
import { Notice } from "./Notice.jsx";
import { NotificationCenter } from "./NotificationCenter.jsx";

const operationLinks = [
  { to: "/admin/catalog", label: "Catalog", permissions: ["products:manage"] },
  { to: "/admin/inventory", label: "Inventory", permissions: ["inventory:read"] },
  { to: "/admin/orders", label: "Order operations", permissions: ["orders:read"] },
  { to: "/admin/users", label: "Users & access", permissions: ["users:read"] },
  { to: "/admin/support", label: "Support operations", permissions: ["support:tickets:read"] },
  { to: "/admin/reports", label: "Reports", permissions: ["reports:read"] },
  { to: "/admin/jobs", label: "Background jobs", permissions: ["jobs:read"] },
  { to: "/admin/documents", label: "Documents", permissions: ["documents:read"] },
  { to: "/admin/document-assistant", label: "Document AI", permissions: ["ai:owner:use"] },
  {
    to: "/admin/assistant",
    label: "AI overview",
    permissions: ["ai:owner:use", "reports:read"],
  },
  {
    to: "/admin/workflows",
    label: "AI workflows",
    permissions: ["ai:workflows:business:use"],
  },
];

function NavigationMenu({ label, active, children }) {
  return (
    <details className={`nav-menu${active ? " nav-menu--active" : ""}`}>
      <summary>
        {label}
        <span aria-hidden="true">⌄</span>
      </summary>
      <div className="nav-menu__panel">{children}</div>
    </details>
  );
}

function initials(displayName) {
  return displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function AppLayout() {
  const auth = useAuth();
  const location = useLocation();
  const [logoutError, setLogoutError] = useState("");
  const visibleOperationLinks = operationLinks.filter(({ permissions }) =>
    permissions.every((permission) => auth.hasPermission(permission)),
  );
  const customerAiEnabled = auth.hasPermission("ai:customer:use");

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
        <div className="site-header__inner">
          <Link className="brand" to="/" aria-label="OpsPilot home">
            <span className="brand__mark" aria-hidden="true">
              OP
            </span>
            <span className="brand__copy">
              <strong>OpsPilot</strong>
              <small>Business operations</small>
            </span>
          </Link>

          <nav className="site-nav" aria-label="Primary navigation">
            <NavLink className="site-nav__link" to="/" end>
              Home
            </NavLink>
            <NavLink className="site-nav__link" to="/products/">
              Products
            </NavLink>
            {auth.user ? (
              <>
                <NavLink className="site-nav__link" to="/dashboard">
                  Dashboard
                </NavLink>
                <NavigationMenu
                  label="My activity"
                  active={
                    location.pathname.startsWith("/cart") ||
                    location.pathname.startsWith("/orders") ||
                    location.pathname.startsWith("/support") ||
                    location.pathname.startsWith("/assistant")
                  }
                >
                  <NavLink to="/cart">Cart</NavLink>
                  <NavLink to="/orders">Orders</NavLink>
                  <NavLink to="/support">Support</NavLink>
                  {customerAiEnabled ? <NavLink to="/assistant">Assistant</NavLink> : null}
                  {customerAiEnabled ? (
                    <NavLink to="/assistant/documents">Document help</NavLink>
                  ) : null}
                </NavigationMenu>
              </>
            ) : null}
            {visibleOperationLinks.length > 0 ? (
              <NavigationMenu label="Operations" active={location.pathname.startsWith("/admin/")}>
                {visibleOperationLinks.map((item) => (
                  <NavLink to={item.to} key={item.to}>
                    {item.label}
                  </NavLink>
                ))}
              </NavigationMenu>
            ) : null}
          </nav>

          <div className="session-actions">
            {auth.user ? (
              <>
                <NotificationCenter />
                <div className="session-profile" title={auth.user.email}>
                  <span className="session-profile__avatar" aria-hidden="true">
                    {initials(auth.user.displayName)}
                  </span>
                  <span className="session-profile__copy">
                    <strong>{auth.user.displayName}</strong>
                    <small>{auth.user.roles[0] ? `${auth.user.roles[0]} account` : "Member"}</small>
                  </span>
                </div>
                <button
                  className="button button--quiet button--compact"
                  type="button"
                  onClick={handleLogout}
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link className="button button--quiet button--compact" to="/login">
                  Log in
                </Link>
                <Link className="button button--primary button--compact" to="/register">
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <aside className="test-payment-notice" role="note" aria-label="Test payment mode">
        <span className="test-payment-notice__icon" aria-hidden="true">
          !
        </span>
        <span>
          <strong>TEST MODE — NO REAL MONEY</strong> · FICTIONAL DATA ONLY
        </span>
      </aside>

      <div className="shell-alerts">
        {logoutError ? (
          <Notice title="Sign out failed" tone="danger" role="alert">
            {logoutError}
          </Notice>
        ) : null}
        {auth.status === "error" ? (
          <Notice title="Session unavailable" tone="danger" role="alert">
            Your session could not be restored. The API may be unavailable.
          </Notice>
        ) : null}
      </div>

      <main className="page-shell">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div>
          <Link className="brand brand--footer" to="/">
            <span className="brand__mark" aria-hidden="true">
              OP
            </span>
            <span>OpsPilot</span>
          </Link>
          <p>Secure commerce and operations in one controlled workspace.</p>
        </div>
        <p>Test Mode · Fictional data only · No real payments</p>
      </footer>
      <AppToaster />
    </div>
  );
}
