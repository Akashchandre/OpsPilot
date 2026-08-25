import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./auth-context.js";

export function ProtectedRoute({ children }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === "loading") {
    return (
      <p className="route-state" role="status">
        Restoring your secure session…
      </p>
    );
  }
  if (!auth.user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

export function PermissionRoute({ permission, children }) {
  const auth = useAuth();
  return auth.hasPermission(permission) ? (
    children
  ) : (
    <section className="panel route-state" role="alert">
      <h1>Access denied</h1>
      <p>Your account does not have permission to view this page.</p>
    </section>
  );
}
