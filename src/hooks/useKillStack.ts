import { useState, useCallback } from "react";
import { killStack, composeFileSuperuser, type ComposeStack } from "../api";

export function useKillStack(
  onSuccess: () => void,
  onActingChange: (delta: 1 | -1) => void,
) {
  const [target, setTarget] = useState<ComposeStack | null>(null);
  const [killing, setKilling] = useState(false);
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
    setKilling(true);
    onActingChange(1);
    setError(null);
    try {
      const su = await composeFileSuperuser(configFile);
      await killStack(target.Name, configFile, su);
      setTarget(null);
      onSuccess();
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setKilling(false);
      onActingChange(-1);
    }
  }, [target, onSuccess, onActingChange]);

  return { target, killing, error, open, close, execute };
}
