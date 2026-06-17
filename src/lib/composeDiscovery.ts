import { type ComposeStack } from "../api";
import { splitConfigFiles } from "./configFiles";

/**
 * Infers the most likely root directory that contains all compose stacks,
 * by tallying the parent directory of each stack's config file directory.
 *
 * For example, given stacks at /home/user/stacks/myapp/compose.yml and
 * /home/user/stacks/otherapp/compose.yml, returns "/home/user/stacks".
 */
export function inferComposeRoot(stacks: ComposeStack[]): string {
  if (stacks.length === 0) return "";
  const tally = new Map<string, number>();
  for (const stack of stacks) {
    const configFile = splitConfigFiles(stack.ConfigFiles)[0] ?? "";
    const stackDir = configFile.slice(0, configFile.lastIndexOf("/"));
    const parent = stackDir.slice(0, stackDir.lastIndexOf("/"));
    if (parent) tally.set(parent, (tally.get(parent) ?? 0) + 1);
  }
  if (tally.size === 0) return "";
  const best = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return best[0][0];
}
