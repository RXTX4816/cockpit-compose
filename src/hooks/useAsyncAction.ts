import { useState, useCallback } from "react";

/**
 * Wraps the repeated pattern:
 *
 *   const [loading, setLoading] = useState(false);
 *   const [error, setError] = useState<string | null>(null);
 *   const handle = useCallback(async () => {
 *     setLoading(true);
 *     try { ... } catch(ex) { setError(...) } finally { setLoading(false) }
 *   }, [...]);
 *
 * Usage:
 *   const { execute, loading, error, clearError } = useAsyncAction(async () => {
 *     await doSomething();
 *   });
 */
export function useAsyncAction<T>(
  action: () => Promise<T>,
): {
  execute: () => Promise<T | undefined>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const execute = useCallback(async (): Promise<T | undefined> => {
    setLoading(true);
    setError(null);
    try {
      const result = await action();
      return result;
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : String(ex));
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [action]);

  return { execute, loading, error, clearError };
}
