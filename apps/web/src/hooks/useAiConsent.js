import { useCallback, useEffect, useState } from "react";
import { acceptAiConsent, getAiConsent, revokeAiConsent } from "../api/ai.js";

export function useAiConsent(assistant) {
  const [state, setState] = useState({
    status: "loading",
    consent: null,
    error: "",
  });

  const load = useCallback(
    async ({ signal } = {}) => {
      setState((current) => ({ ...current, status: "loading", error: "" }));
      try {
        const consent = await getAiConsent(assistant, { signal });
        setState({ status: "ready", consent, error: "" });
        return consent;
      } catch (error) {
        if (error.name !== "AbortError") {
          setState((current) => ({ ...current, status: "error", error: error.message }));
        }
        return null;
      }
    },
    [assistant],
  );

  useEffect(() => {
    const controller = new AbortController();
    load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);

  async function accept() {
    setState((current) => ({ ...current, status: "saving", error: "" }));
    try {
      const consent = await acceptAiConsent(assistant);
      setState({ status: "ready", consent, error: "" });
      return consent;
    } catch (error) {
      setState((current) => ({ ...current, status: "error", error: error.message }));
      return null;
    }
  }

  async function revoke() {
    setState((current) => ({ ...current, status: "saving", error: "" }));
    try {
      const consent = await revokeAiConsent(assistant);
      setState({ status: "ready", consent, error: "" });
      return consent;
    } catch (error) {
      setState((current) => ({ ...current, status: "error", error: error.message }));
      return null;
    }
  }

  return { ...state, accept, revoke, reload: load };
}
