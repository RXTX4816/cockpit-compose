import { useState, useCallback } from "react";
import { downStack, type ComposeStack } from "../api";

export function useDownStack(
  onSuccess: () => void,
  onActingChange: (delta: 1 | -1) => void,
  onDownComplete?: (stack: ComposeStack) => void,
) {
  const [target, setTarget] = useState<ComposeStack | null>(null);
  const [downing, setDowning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback((stack: ComposeStack) => {
    setError(null);
    setTarget(stack);
  }, []);

  const close = useCallback(() => {
    setTarget(null);
    setError(null);
  }, []);

  const execute = useCallback(async () => {
    if (!target) return;
    const configFile = target.ConfigFiles.split(",")[0].trim();
    setDowning(true);
    onActingChange(1);
    setError(null);
    try {
      await downStack(target.Name, configFile);
      onDownComplete?.(target);
      setTarget(null);
      onSuccess();
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setDowning(false);
      onActingChange(-1);
    }
  }, [target, onSuccess, onActingChange, onDownComplete]);

  return { target, downing, error, open, close, execute };
}
