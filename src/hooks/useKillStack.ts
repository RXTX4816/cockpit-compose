import { useState, useCallback } from "react";
import { killStack, findStackLeftovers, stackSuperuser, readAllProfiles, type ComposeStack, type StackLeftovers } from "../api";
import { splitConfigFiles } from "../lib/configFiles";

export function useKillStack(
  onSuccess: () => void,
  onActingChange: (delta: 1 | -1) => void,
) {
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

  const check = useCallback(async (stack: ComposeStack, su: "try" | undefined, failure: string | null) => {
    let left: StackLeftovers | null = null;
    try { left = await findStackLeftovers(stack.Name, su); } catch { /* fall back to the kill's own result */ }
    onSuccess();
    if (left && left.ids.length > 0) {
      setLeftovers(left);
      setError(failure);
    } else if (left || !failure) {
      // Nothing left, so the stack is gone even if part of the kill reported an error.
      setTarget(null);
      setLeftovers(null);
      setError(null);
    } else {
      setError(failure);
    }
  }, [onSuccess]);

  const execute = useCallback(async () => {
    if (!target) return;
    const configFiles = splitConfigFiles(target.ConfigFiles);
    setKilling(true);
    onActingChange(1);
    let su: "try" | undefined;
    let failure: string | null = null;
    try {
      const [resolvedSu, profiles] = await Promise.all([
        stackSuperuser(configFiles),
        readAllProfiles(configFiles[0]),
      ]);
      su = resolvedSu;
      setSuperuser(su);
      await killStack(target.Name, configFiles, profiles, su);
    } catch (ex: unknown) {
      failure = ex instanceof Error ? ex.message : String(ex);
    }
    try {
      await check(target, su, failure);
    } finally {
      setKilling(false);
      onActingChange(-1);
    }
  }, [target, onActingChange, check]);

  /** Checks again after a repair of damaged records. */
  const recheck = useCallback(async () => {
    if (target) await check(target, superuser, null);
  }, [target, superuser, check]);

  return { target, killing, error, leftovers, superuser, open, close, execute, recheck };
}
