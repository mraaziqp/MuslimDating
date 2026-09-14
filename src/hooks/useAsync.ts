import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";

interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

export interface AsyncResult<T> extends AsyncState<T> {
  reload: (options?: { silent?: boolean }) => Promise<T | null>;
  setData: (updater: (previous: T | null) => T | null) => void;
}

export function useAsync<T>(loader: () => Promise<T>, deps: DependencyList): AsyncResult<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const requestId = useRef(0);

  const reload = useCallback(async (options?: { silent?: boolean }) => {
    const id = ++requestId.current;
    if (!options?.silent) setState((s) => ({ ...s, loading: true }));
    try {
      const data = await loaderRef.current();
      if (id === requestId.current) setState({ data, error: null, loading: false });
      return data;
    } catch (err) {
      if (id === requestId.current) {
        setState((s) => ({ ...s, error: err instanceof Error ? err : new Error(String(err)), loading: false }));
      }
      return null;
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const setData = useCallback((updater: (previous: T | null) => T | null) => {
    setState((s) => ({ ...s, data: updater(s.data) }));
  }, []);

  return { ...state, reload, setData };
}

/** Re-runs a callback on an interval while the tab is visible. */
export function usePolling(callback: () => void, intervalMs: number, enabled = true): void {
  const saved = useRef(callback);
  saved.current = callback;
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === "visible") saved.current();
    };
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [intervalMs, enabled]);
}
