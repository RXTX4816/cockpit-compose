import { useState, useCallback } from "react";
import { downStack, stackSuperuser, readAllProfiles, type ComposeStack } from "../api";
import { splitConfigFiles } from "../lib/configFiles";

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
    const configFiles = splitConfigFiles(target.ConfigFiles);
    setDowning(true);
    onActingChange(1);
    try {
      const [su, profiles] = await Promise.all([
        stackSuperuser(configFiles),
        readAllProfiles(configFiles[0]),
      ]);
      await downStack(target.Name, configFiles, profiles, su);
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
