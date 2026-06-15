import { useState, useCallback } from "react";
import { killStack, composeFileSuperuser, readAllProfiles, isRootlessMode, type ComposeStack } from "../api";
import { splitConfigFiles } from "../lib/configFiles";

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
    const configFiles = splitConfigFiles(target.ConfigFiles);
    setKilling(true);
    onActingChange(1);
    try {
      const [su, profiles] = await Promise.all([
        isRootlessMode() ? Promise.resolve<"try" | undefined>(undefined) : composeFileSuperuser(configFiles),
        readAllProfiles(configFiles[0]),
      ]);
      await killStack(target.Name, configFiles, profiles, su);
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
