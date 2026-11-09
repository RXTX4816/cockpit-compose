import { stackSuperuser } from "../cockpit";
import { splitConfigFiles } from "../../lib/configFiles";
import type { ComposeStack } from "../types";
import { findStackLeftovers, type StackLeftovers } from "./leftovers";
import { stackOperations } from "./operations";

/** How a Down or Kill ended, from the point of view of the dialog showing it. */
export type TeardownOutcome =
  /** No containers are left. `warning` is what the command reported, if it failed anyway. */
  | { state: "gone"; warning: string | null }
  /** Containers are still listed, with the command's error if it failed. */
  | { state: "remaining"; leftovers: StackLeftovers; error: string | null }
  /** The command failed and what is left could not be checked. */
  | { state: "failed"; error: string };

export interface TeardownResult {
  outcome: TeardownOutcome;
  /** The escalation resolved for the stack, for the follow-up leftovers repair. */
  superuser: "try" | undefined;
}

// What the runtime still lists after an attempt, or null if the check itself failed (then
// the attempt's own result decides).
async function leftoversOf(project: string, su?: "try"): Promise<StackLeftovers | null> {
  try { return await findStackLeftovers(project, su); } catch { return null; }
}

const messageOf = (ex: unknown) => (ex instanceof Error ? ex.message : String(ex));

/**
 * The one rule for when a stack is gone: when no containers are left, whatever the
 * command's exit status said. A failure with nothing left is done, with a warning. If
 * containers remain, they are reported with the error. Only when what is left cannot be
 * checked does the command's failure stand.
 */
export function settleTeardown(failure: string | null, left: StackLeftovers | null): TeardownOutcome {
  if (left && left.ids.length > 0) return { state: "remaining", leftovers: left, error: failure };
  if (left || !failure) return { state: "gone", warning: failure };
  return { state: "failed", error: failure };
}

async function attempt(stack: ComposeStack, kind: "down" | "kill", ignoreFailure = false): Promise<TeardownResult> {
  let superuser: "try" | undefined;
  let failure: string | null = null;
  try {
    superuser = await stackSuperuser(splitConfigFiles(stack.ConfigFiles));
    await stackOperations[kind](stack);
  } catch (ex: unknown) {
    failure = messageOf(ex);
  }
  const left = await leftoversOf(stack.Name, superuser);
  return { outcome: settleTeardown(ignoreFailure ? null : failure, left), superuser };
}

/** Takes a stack down, then reports whether it is really gone. */
export function tearDownStack(stack: ComposeStack, kind: "down" | "kill"): Promise<TeardownResult> {
  return attempt(stack, kind);
}

/** Removes a stack's containers by project label, for leftovers a failed Down could not remove. */
export function forceRemoveStack(stack: ComposeStack): Promise<TeardownResult> {
  return attempt(stack, "kill", true);
}

/** Checks again what a stack has left, e.g. after a repair of damaged records. */
export async function recheckStack(stack: ComposeStack, superuser: "try" | undefined): Promise<TeardownOutcome> {
  return settleTeardown(null, await leftoversOf(stack.Name, superuser));
}
