import { type ComposeStack, stackOperations } from "../api";

type Launch = (proc: CockpitProcess) => void;
type Starter = (launch: Launch) => Promise<void>;

// Every operation starts the same way, so there is one builder; the module resolves the
// stack's files, profiles and admin rights, so a background run behaves like its dialog.
function starterFor(start: () => CockpitProcess): Starter {
  return launch => { launch(start()); return Promise.resolve(); };
}

/**
 * Builds a background-task starter for `up`, given the stack and (already
 * confirmed) profiles to activate. Shared between the single-stack "Run in
 * Background" buttons (UpModal) and the bulk-action path.
 */
export function buildUpStarter(stack: ComposeStack, profiles?: string[]) {
  return starterFor(() => stackOperations.up(stack, { profiles }));
}

/** Builds a background-task starter for `pull`. */
export function buildPullStarter(stack: ComposeStack) {
  return starterFor(() => stackOperations.pull(stack));
}

/** Builds a background-task starter for `down`. */
export function buildDownStarter(stack: ComposeStack) {
  return starterFor(() => stackOperations.down(stack));
}

/** Builds a background-task starter for `restart`. */
export function buildRestartStarter(stack: ComposeStack) {
  return starterFor(() => stackOperations.restart(stack));
}

/** Builds a background-task starter for `kill`. */
export function buildKillStarter(stack: ComposeStack) {
  return starterFor(() => stackOperations.kill(stack));
}
