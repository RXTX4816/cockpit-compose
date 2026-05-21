import { useState, useCallback } from "react";
import { startStack, stopStack, restartStack } from "../api";

export function useStackActions(
  stackName: string,
  configFile: string,
  onActingChange: (delta: 1 | -1) => void,
) {
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const doAction = useCallback(async (
    action: "start" | "stop" | "restart",
    onSuccess?: () => Promise<void>,
  ) => {
    setActing(true);
    onActingChange(1);
    setActionError(null);
    try {
      if (action === "start") await startStack(stackName, configFile);
      else if (action === "stop") await stopStack(stackName, configFile);
      else await restartStack(stackName, configFile);
      await onSuccess?.();
    } catch (ex: unknown) {
      setActionError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setActing(false);
      onActingChange(-1);
    }
  }, [stackName, configFile, onActingChange]);

  return { acting, actionError, doAction };
}
