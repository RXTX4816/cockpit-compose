import { stackSuperuser } from "../cockpit";
import { readAllProfiles } from "../files";
import { splitConfigFiles } from "../../lib/configFiles";
import type { ComposeStack } from "../types";
import { afterPreparing, makeFakeProcess } from "./internal";
import { readRunningServiceNames } from "./query";
import {
  startStack, stopStack, restartStack, downStack, upStackStream, pullStack,
  pauseStack, unpauseStack, killStack,
} from "./lifecycle";

export interface StackOperationOptions {
  /** Profiles to activate. Defaults to every profile the stack's compose file declares
   *  (for `up`, to none: profile services are opt-in there). */
  profiles?: string[];
}

export interface RestartOptions extends StackOperationOptions {
  /** Services to restart. Defaults to the ones currently running; none running restarts nothing. */
  services?: string[];
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
 * files.
 */
export const stackOperations = {
  up(stack: ComposeStack, options: StackOperationOptions = {}): CockpitProcess {
    return run(stack, { profiles: options.profiles ?? [] },
      r => upStackStream(r.name, r.configFiles, r.profiles, r.superuser));
  },
  pull(stack: ComposeStack, options: StackOperationOptions = {}): CockpitProcess {
    return run(stack, options, r => pullStack(r.name, r.configFiles, r.profiles, r.superuser));
  },
  start(stack: ComposeStack, options: StackOperationOptions = {}): CockpitProcess {
    return run(stack, options, r => startStack(r.name, r.configFiles, r.profiles, r.superuser));
  },
  stop(stack: ComposeStack, options: StackOperationOptions = {}): CockpitProcess {
    return run(stack, options, r => stopStack(r.name, r.configFiles, r.profiles, r.superuser));
  },
  restart(stack: ComposeStack, options: RestartOptions = {}): CockpitProcess {
    let services: string[] = [];
    return afterPreparing(
      async () => { services = options.services ?? await readRunningServiceNames(stack.Name); },
      () => services.length === 0
        ? makeFakeProcess(async () => "")
        : run(stack, options, r => restartStack(r.name, r.configFiles, r.profiles, services, r.superuser)),
    );
  },
  pause(stack: ComposeStack, options: StackOperationOptions = {}): CockpitProcess {
    return run(stack, options, r => pauseStack(r.name, r.configFiles, r.profiles, r.superuser));
  },
  unpause(stack: ComposeStack, options: StackOperationOptions = {}): CockpitProcess {
    return run(stack, options, r => unpauseStack(r.name, r.configFiles, r.profiles, r.superuser));
  },
  kill(stack: ComposeStack, options: StackOperationOptions = {}): CockpitProcess {
    return run(stack, options, r => killStack(r.name, r.configFiles, r.profiles, r.superuser));
  },
  down(stack: ComposeStack, options: StackOperationOptions = {}): CockpitProcess {
    return run(stack, options, r => downStack(r.name, r.configFiles, r.profiles, r.superuser));
  },
};
