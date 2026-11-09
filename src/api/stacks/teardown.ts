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
  /** The command failed and what is left could not be checked, or Down's legacy rule applies. */
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

/** Rules for turning an attempt's failure and the leftovers check into an outcome. */
export function settleTeardown(
  failure: string | null,
  left: StackLeftovers | null,
  strictOnFailure: boolean,
): TeardownOutcome {
  const remaining = left !== null && left.ids.length > 0;
  if (strictOnFailure && failure !== null) {
    return remaining ? { state: "remaining", leftovers: left, error: failure } : { state: "failed", error: failure };
  }
  if (remaining) return { state: "remaining", leftovers: left, error: failure };
  if (left || !failure) return { state: "gone", warning: failure };
  return { state: "failed", error: failure };
}

async function attempt(stack: ComposeStack, kind: "down" | "kill", strict: boolean, ignoreFailure = false): Promise<TeardownResult> {
  let superuser: "try" | undefined;
  let failure: string | null = null;
  try {
    superuser = await stackSuperuser(splitConfigFiles(stack.ConfigFiles));
    await stackOperations[kind](stack);
  } catch (ex: unknown) {
    failure = messageOf(ex);
  }
  const left = await leftoversOf(stack.Name, superuser);
  return { outcome: settleTeardown(ignoreFailure ? null : failure, left, strict), superuser };
}

/** Takes a stack down, then reports whether it is really gone. */
export function tearDownStack(stack: ComposeStack, kind: "down" | "kill"): Promise<TeardownResult> {
  return attempt(stack, kind, kind === "down");
}

/** Removes a stack's containers by project label, for leftovers a failed Down could not remove. */
export function forceRemoveStack(stack: ComposeStack): Promise<TeardownResult> {
  return attempt(stack, "kill", false, true);
}

/** Checks again what a stack has left, e.g. after a repair of damaged records. */
export async function recheckStack(stack: ComposeStack, superuser: "try" | undefined): Promise<TeardownOutcome> {
  return settleTeardown(null, await leftoversOf(stack.Name, superuser), false);
}
