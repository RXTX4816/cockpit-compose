import { useState, useCallback } from "react";
import { startStack, stopStack, restartStack, pauseStack, unpauseStack, composeFileSuperuser } from "../api";

export function useStackActions(
  stackName: string,
  configFile: string,
  onActingChange: (delta: 1 | -1) => void,
) {
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const doAction = useCallback(async (
    action: "start" | "stop" | "restart" | "pause" | "unpause",
    onSuccess?: () => Promise<void>,
  ) => {
    setActing(true);
    onActingChange(1);
    setActionError(null);
    try {
      const su = await composeFileSuperuser(configFile);
      if (action === "start") await startStack(stackName, configFile, su);
      else if (action === "stop") await stopStack(stackName, configFile, su);
      else if (action === "restart") await restartStack(stackName, configFile, su);
      else if (action === "pause") await pauseStack(stackName, configFile, su);
      else await unpauseStack(stackName, configFile, su);
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
