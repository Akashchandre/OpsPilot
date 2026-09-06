import { useCallback, useEffect, useState } from "react";
import { getWorkflowRun } from "../api/workflows.js";

const pollingStatuses = new Set(["QUEUED", "RUNNING", "APPROVED"]);

export function useTrackedWorkflow() {
  const [state, setState] = useState({ status: "idle", run: null, error: "" });

  const refresh = useCallback(async (workflowRunId, { signal } = {}) => {
    try {
      const run = await getWorkflowRun(workflowRunId, { signal });
      setState({ status: "ready", run, error: "" });
      return run;
    } catch (error) {
      if (error.name !== "AbortError") {
        setState((current) => ({ ...current, status: "error", error: error.message }));
      }
      return null;
    }
  }, []);

  useEffect(() => {
    if (!state.run || !pollingStatuses.has(state.run.status)) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => refresh(state.run.id, { signal: controller.signal }),
      1000,
    );
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [refresh, state.run]);

  const track = useCallback((run) => {
    setState({ status: "ready", run, error: "" });
  }, []);
  const begin = useCallback(() => {
    setState((current) => ({ ...current, status: "saving", error: "" }));
  }, []);
  const fail = useCallback((error) => {
    setState((current) => ({ ...current, status: "error", error: error.message }));
  }, []);
  const clear = useCallback(() => {
    setState({ status: "idle", run: null, error: "" });
  }, []);
  const load = useCallback(
    (workflowRunId) => {
      setState((current) => ({ ...current, status: "loading", error: "" }));
      return refresh(workflowRunId);
    },
    [refresh],
  );
  const refreshTracked = useCallback(
    () => (state.run ? refresh(state.run.id) : Promise.resolve(null)),
    [refresh, state.run],
  );

  return {
    ...state,
    track,
    begin,
    fail,
    clear,
    load,
    refresh: refreshTracked,
  };
}
