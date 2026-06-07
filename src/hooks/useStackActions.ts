import { useState, useCallback } from "react";
import { startStack, stopStack, restartStack, readRunningServiceNames, pauseStack, unpauseStack, composeFileSuperuser, readAllProfiles } from "../api";

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
      const [su, profiles] = await Promise.all([composeFileSuperuser(configFile), readAllProfiles(configFile)]);
      if (action === "start") await startStack(stackName, configFile, profiles, su);
      else if (action === "stop") await stopStack(stackName, configFile, profiles, su);
      else if (action === "restart") {
        const runningServices = await readRunningServiceNames(stackName);
        if (runningServices.length > 0) await restartStack(stackName, configFile, profiles, runningServices, su);
      } else if (action === "pause") await pauseStack(stackName, configFile, profiles, su);
      else await unpauseStack(stackName, configFile, profiles, su);
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
