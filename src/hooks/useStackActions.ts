import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { startStack, stopStack, restartStack, readRunningServiceNames, pauseStack, unpauseStack, composeFileSuperuser, readAllProfiles, isRootlessMode } from "../api";
import { useToast } from "../components/ToastProvider";

export function useStackActions(
  stackName: string,
  configFiles: string[],
  onActingChange: (delta: 1 | -1) => void,
) {
  const { t } = useTranslation();
  const toast = useToast();
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const configFilesKey = configFiles.join(",");
  const doAction = useCallback(async (
    action: "start" | "stop" | "restart" | "pause" | "unpause",
    onSuccess?: () => Promise<void>,
  ) => {
    setActing(true);
    onActingChange(1);
    setActionError(null);
    try {
      const [su, profiles] = await Promise.all([
        isRootlessMode() ? Promise.resolve<"try" | undefined>(undefined) : composeFileSuperuser(configFiles),
        readAllProfiles(configFiles[0]),
      ]);
      if (action === "start") await startStack(stackName, configFiles, profiles, su);
      else if (action === "stop") await stopStack(stackName, configFiles, profiles, su);
      else if (action === "restart") {
        const runningServices = await readRunningServiceNames(stackName);
        if (runningServices.length > 0) await restartStack(stackName, configFiles, profiles, runningServices, su);
      } else if (action === "pause") await pauseStack(stackName, configFiles, profiles, su);
      else await unpauseStack(stackName, configFiles, profiles, su);
      await onSuccess?.();
      toast.success(t(`toast.${action}_success`, { name: stackName }));
    } catch (ex: unknown) {
      const msg = ex instanceof Error ? ex.message : String(ex);
      setActionError(msg);
      toast.error(t(`toast.${action}_failed`, { name: stackName }), msg);
    } finally {
      setActing(false);
      onActingChange(-1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stackName, configFilesKey, onActingChange, toast, t]);

  return { acting, actionError, doAction };
}
