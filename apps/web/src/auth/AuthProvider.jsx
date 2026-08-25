import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentUser, login, logout, register } from "../api/auth.js";
import { ApiError } from "../api/client.js";
import { AuthContext } from "./auth-context.js";

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: "loading", user: null, error: null });

  const refresh = useCallback(async ({ signal } = {}) => {
    try {
      const user = await getCurrentUser({ signal });
      setState({ status: "ready", user, error: null });
      return user;
    } catch (error) {
      if (error.name === "AbortError") return null;
      if (error instanceof ApiError && error.status === 401) {
        setState({ status: "ready", user: null, error: null });
        return null;
      }
      setState({ status: "error", user: null, error });
      return null;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getCurrentUser({ signal: controller.signal })
      .then((user) => setState({ status: "ready", user, error: null }))
      .catch((error) => {
        if (error.name === "AbortError") return;
        if (error instanceof ApiError && error.status === 401) {
          setState({ status: "ready", user: null, error: null });
          return;
        }
        setState({ status: "error", user: null, error });
      });
    return () => controller.abort();
  }, [refresh]);

  const value = useMemo(
    () => ({
      ...state,
      async login(credentials) {
        const user = await login(credentials);
        setState({ status: "ready", user, error: null });
        return user;
      },
      async register(registration) {
        const user = await register(registration);
        setState({ status: "ready", user, error: null });
        return user;
      },
      async logout() {
        await logout();
        setState({ status: "ready", user: null, error: null });
      },
      refresh,
      hasPermission(permission) {
        return Boolean(state.user?.permissions.includes(permission));
      },
    }),
    [refresh, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
