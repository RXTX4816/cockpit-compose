import { useState, useCallback } from "react";
import { tearDownStack, forceRemoveStack, recheckStack, type ComposeStack, type StackLeftovers, type TeardownOutcome } from "../api";

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
  const show = useCallback((stack: ComposeStack, outcome: TeardownOutcome, markDowned = true) => {
    if (outcome.state === "failed") { setError(outcome.error); return; }
    onSuccess();
    if (outcome.state === "remaining") {
      setLeftovers(outcome.leftovers);
      setError(outcome.error);
    } else {
      if (markDowned) onDownComplete?.(stack);
      setTarget(null);
      setLeftovers(null);
    }
  }, [onSuccess, onDownComplete]);

  const execute = useCallback(async () => {
    if (!target) return;
    setDowning(true);
    onActingChange(1);
    try {
      const { outcome, superuser: su } = await tearDownStack(target, "down");
      setSuperuser(su);
      show(target, outcome);
    } finally {
      setDowning(false);
      onActingChange(-1);
    }
  }, [target, onActingChange, show]);

  /** Removes the leftovers by project label (Kill's path), then checks again. */
  const forceRemove = useCallback(async () => {
    if (!target) return;
    setForceRemoving(true);
    onActingChange(1);
    try {
      const { outcome, superuser: su } = await forceRemoveStack(target);
      setSuperuser(su);
      setError(null);
      show(target, outcome, false);
    } finally {
      setForceRemoving(false);
      onActingChange(-1);
    }
  }, [target, onActingChange, show]);

  /** Checks again after a repair of damaged records. */
  const recheck = useCallback(async () => {
    if (!target) return;
    setError(null);
    show(target, await recheckStack(target, superuser), false);
  }, [target, superuser, show]);

  return { target, downing, error, leftovers, superuser, forceRemoving, open, close, execute, forceRemove, recheck };
}
