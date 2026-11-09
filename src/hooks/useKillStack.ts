import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../components/ToastProvider";
import { tearDownStack, recheckStack, type ComposeStack, type StackLeftovers, type TeardownOutcome } from "../api";

export function useKillStack(
  onSuccess: () => void,
  onActingChange: (delta: 1 | -1) => void,
) {
  const { t } = useTranslation();
  const toast = useToast();
  const [target, setTarget] = useState<ComposeStack | null>(null);
  const [killing, setKilling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Containers Docker still lists after Kill's force removal (#345), typically damaged
  // records that even `rm -f` cannot touch.
  const [leftovers, setLeftovers] = useState<StackLeftovers | null>(null);
  const [superuser, setSuperuser] = useState<"try" | undefined>(undefined);

  const open = useCallback((stack: ComposeStack) => {
    setError(null);
    setLeftovers(null);
    setTarget(stack);
  }, []);
  const close = useCallback(() => {
    setTarget(null);
    setError(null);
    setLeftovers(null);
  }, []);

  const show = useCallback((outcome: TeardownOutcome) => {
    onSuccess();
    if (outcome.state === "remaining") {
      setLeftovers(outcome.leftovers);
      setError(outcome.error);
    } else if (outcome.state === "gone") {
      // Nothing left, so the stack is gone even if part of the kill reported an error.
      if (outcome.warning) toast.warn(t("toast.teardown_warning", { name: target?.Name ?? "" }), outcome.warning);
      setTarget(null);
      setLeftovers(null);
      setError(null);
    } else {
      setError(outcome.error);
    }
  }, [onSuccess, target, toast, t]);

  const execute = useCallback(async () => {
    if (!target) return;
    setKilling(true);
    onActingChange(1);
    try {
      const { outcome, superuser: su } = await tearDownStack(target, "kill");
      setSuperuser(su);
      show(outcome);
    } finally {
      setKilling(false);
      onActingChange(-1);
    }
  }, [target, onActingChange, show]);

  /** Checks again after a repair of damaged records. */
  const recheck = useCallback(async () => {
    if (target) show(await recheckStack(target, superuser));
  }, [target, superuser, show]);

  return { target, killing, error, leftovers, superuser, open, close, execute, recheck };
}
