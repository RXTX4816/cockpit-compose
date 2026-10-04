import { useState, useCallback } from "react";
import { downStack, killStack, findStackLeftovers, stackSuperuser, readAllProfiles, type ComposeStack, type StackLeftovers } from "../api";
import { splitConfigFiles } from "../lib/configFiles";

// What Docker still lists after an attempt, or null if the check itself failed (then
// the attempt's own result decides, as before).
async function leftoversOf(project: string, su?: "try"): Promise<StackLeftovers | null> {
  try { return await findStackLeftovers(project, su); } catch { return null; }
}

export function useDownStack(
  onSuccess: () => void,
  onActingChange: (delta: 1 | -1) => void,
  onDownComplete?: (stack: ComposeStack) => void,
) {
  const [target, setTarget] = useState<ComposeStack | null>(null);
  const [downing, setDowning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Containers Docker still lists after Down (#345). The dialog stays open to show them
  // rather than closing as if the stack were gone.
  const [leftovers, setLeftovers] = useState<StackLeftovers | null>(null);
  const [superuser, setSuperuser] = useState<"try" | undefined>(undefined);
  const [forceRemoving, setForceRemoving] = useState(false);

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

  // Closes when nothing is left, otherwise keeps the dialog open showing what is.
  // `markDowned` lists the stack under Down afterwards; not after a force remove, whose
  // stack often has no compose file left to list (its folder was deleted, say). A
  // stack whose folder still exists turns up there with the next scan anyway.
  const settle = useCallback((stack: ComposeStack, left: StackLeftovers | null, markDowned = true) => {
    onSuccess();
    if (left && left.ids.length > 0) {
      setLeftovers(left);
    } else {
      if (markDowned) onDownComplete?.(stack);
      setTarget(null);
      setLeftovers(null);
    }
  }, [onSuccess, onDownComplete]);

  const execute = useCallback(async () => {
    if (!target) return;
    const configFiles = splitConfigFiles(target.ConfigFiles);
    setDowning(true);
    onActingChange(1);
    let su: "try" | undefined;
    try {
      const [resolvedSu, profiles] = await Promise.all([
        stackSuperuser(configFiles),
        readAllProfiles(configFiles[0]),
      ]);
      su = resolvedSu;
      setSuperuser(su);
      await downStack(target.Name, configFiles, profiles, su);
      settle(target, await leftoversOf(target.Name, su));
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : String(ex));
      // Compose failing (say, its file was deleted) is exactly when containers stay
      // behind; show them with a way out next to the error.
      const left = await leftoversOf(target.Name, su);
      if (left && left.ids.length > 0) setLeftovers(left);
    } finally {
      setDowning(false);
      onActingChange(-1);
    }
  }, [target, onActingChange, settle]);

  /** Removes the leftovers by project label (Kill's path), then checks again. */
  const forceRemove = useCallback(async () => {
    if (!target) return;
    setForceRemoving(true);
    onActingChange(1);
    try {
      await killStack(target.Name, splitConfigFiles(target.ConfigFiles), [], superuser).catch(() => {});
      setError(null);
      settle(target, await leftoversOf(target.Name, superuser), false);
    } finally {
      setForceRemoving(false);
      onActingChange(-1);
    }
  }, [target, superuser, onActingChange, settle]);

  /** Checks again after a repair of damaged records. */
  const recheck = useCallback(async () => {
    if (!target) return;
    setError(null);
    settle(target, await leftoversOf(target.Name, superuser), false);
  }, [target, superuser, settle]);

  return { target, downing, error, leftovers, superuser, forceRemoving, open, close, execute, forceRemove, recheck };
}
