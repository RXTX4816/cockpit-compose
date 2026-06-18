import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { startService, stopService, restartStack, composeFileSuperuser, readAllProfiles, isRootlessMode } from "../api";
import type { ComposeStack } from "../api";
import { splitConfigFiles } from "../lib/configFiles";
import { useToast } from "../components/ToastProvider";

export function useServiceActions(
  stack: ComposeStack,
  onActingChange: (delta: 1 | -1) => void,
) {
  const { t } = useTranslation();
  const toast = useToast();
  const [actingService, setActingService] = useState<string | null>(null);

  const configFilesKey = stack.ConfigFiles;

  const doServiceAction = useCallback(async (
    action: "start" | "stop" | "restart",
    serviceName: string,
    onSuccess?: () => Promise<void>,
  ) => {
    setActingService(serviceName);
    onActingChange(1);
    try {
      const files = splitConfigFiles(configFilesKey);
      const [su, profiles] = await Promise.all([
        isRootlessMode() ? Promise.resolve<"try" | undefined>(undefined) : composeFileSuperuser(files),
        readAllProfiles(files[0]),
      ]);
      if (action === "start") await startService(stack.Name, files, serviceName, profiles, su);
      else if (action === "stop") await stopService(stack.Name, files, serviceName, profiles, su);
      else await restartStack(stack.Name, files, profiles, [serviceName], su);
      await onSuccess?.();
      toast.success(t(`toast.service_${action}_success`, { name: serviceName }));
    } catch (ex: unknown) {
      const msg = ex instanceof Error ? ex.message : String(ex);
      toast.error(t(`toast.service_${action}_failed`, { name: serviceName }), msg);
    } finally {
      setActingService(null);
      onActingChange(-1);
    }
  }, [stack.Name, configFilesKey, onActingChange, toast, t]);

  return { actingService, doServiceAction };
}
