import { stackSuperuser } from "../cockpit";
import { readAllProfiles } from "../files";
import { splitConfigFiles } from "../../lib/configFiles";
import type { ComposeStack } from "../types";
import { afterPreparing } from "./internal";
import { downStack } from "./lifecycle";

export interface StackOperationOptions {
  /** Profiles to activate. Defaults to every profile the stack's compose file declares. */
  profiles?: string[];
}

interface Resolved {
  name: string;
  configFiles: string[];
  profiles: string[];
  superuser: "try" | undefined;
}

// Everything a caller used to work out before running an action: the stack's files, whether
// the command needs admin rights (ADR 0004) and which profiles apply.
async function resolve(stack: ComposeStack, options: StackOperationOptions): Promise<Resolved> {
  const configFiles = splitConfigFiles(stack.ConfigFiles);
  const [superuser, profiles] = await Promise.all([
    stackSuperuser(configFiles),
    options.profiles ?? readAllProfiles(configFiles[0]),
  ]);
  return { name: stack.Name, configFiles, profiles, superuser };
}

// Returns the process at once, as the lifecycle functions do, so callers can stream and
// cancel it; resolving the stack happens inside and cancelling during it starts nothing.
function run(
  stack: ComposeStack,
  options: StackOperationOptions,
  start: (r: Resolved) => CockpitProcess,
): CockpitProcess {
  let resolved: Resolved | undefined;
  return afterPreparing(
    async () => { resolved = await resolve(stack, options); },
    () => start(resolved!),
  );
}

/**
 * Actions on a Stack. Callers pass the stack and never `superuser`, profiles or split config
 * files. Operations move here from the lifecycle functions one at a time.
 */
export const stackOperations = {
  down(stack: ComposeStack, options: StackOperationOptions = {}): CockpitProcess {
    return run(stack, options, r => downStack(r.name, r.configFiles, r.profiles, r.superuser));
  },
};
