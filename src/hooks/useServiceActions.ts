import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { stackOperations } from "../api";
import type { ComposeStack } from "../api";
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
      const target: ComposeStack = { Name: stack.Name, Status: "", ConfigFiles: configFilesKey };
      if (action === "start") await stackOperations.startService(target, serviceName);
      else if (action === "stop") await stackOperations.stopService(target, serviceName);
      else await stackOperations.restart(target, { services: [serviceName] });
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
