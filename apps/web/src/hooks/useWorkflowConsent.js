import { useCallback, useEffect, useState } from "react";
import {
  acceptWorkflowConsent,
  getWorkflowConsent,
  revokeWorkflowConsent,
} from "../api/workflows.js";

export function useWorkflowConsent(scope) {
  const [state, setState] = useState({ status: "loading", consent: null, error: "" });

  const load = useCallback(
    async ({ signal } = {}) => {
      setState((current) => ({ ...current, status: "loading", error: "" }));
      try {
        const consent = await getWorkflowConsent(scope, { signal });
        setState({ status: "ready", consent, error: "" });
        return consent;
      } catch (error) {
        if (error.name !== "AbortError") {
          setState((current) => ({ ...current, status: "error", error: error.message }));
        }
        return null;
      }
    },
    [scope],
  );

  useEffect(() => {
    const controller = new AbortController();
    load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);

  async function mutate(action) {
    setState((current) => ({ ...current, status: "saving", error: "" }));
    try {
      const consent = await action(scope);
      setState({ status: "ready", consent, error: "" });
      return consent;
    } catch (error) {
      setState((current) => ({ ...current, status: "error", error: error.message }));
      return null;
    }
  }

  return {
    ...state,
    accept: () => mutate(acceptWorkflowConsent),
    revoke: () => mutate(revokeWorkflowConsent),
    reload: load,
  };
}
