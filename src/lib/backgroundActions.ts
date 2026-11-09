import {
  type ComposeStack,
  upStackStream,
  pullStack,
  stackOperations,
  restartStack,
  killStack,
  stackSuperuser,
  readAllProfiles,
} from "../api";
import { splitConfigFiles } from "./configFiles";

type Launch = (proc: CockpitProcess) => void;

/**
 * Builds a background-task starter for `up`, given the stack and (already
 * confirmed) profiles to activate. Shared between the single-stack "Run in
 * Background" buttons (UpModal) and the bulk-action path.
 */
export function buildUpStarter(stack: ComposeStack, profiles: string[] = []) {
  const configFiles = splitConfigFiles(stack.ConfigFiles);
  return (launch: Launch) => stackSuperuser(configFiles)
    .then(su => { launch(upStackStream(stack.Name, configFiles, profiles, su)); });
}

/** Builds a background-task starter for `pull`, resolving the stack's profiles itself. */
export function buildPullStarter(stack: ComposeStack) {
  const configFiles = splitConfigFiles(stack.ConfigFiles);
  return (launch: Launch) => Promise.all([
    stackSuperuser(configFiles),
    readAllProfiles(configFiles[0]),
  ]).then(([su, profiles]) => { launch(pullStack(stack.Name, configFiles, profiles, su)); });
}

/** Builds a background-task starter for `down`. */
export function buildDownStarter(stack: ComposeStack) {
  // Explicit empty profiles keeps today's behaviour; the next commit makes this read the stack's.
  return (launch: Launch) => { launch(stackOperations.down(stack, { profiles: [] })); return Promise.resolve(); };
}

/** Builds a background-task starter for `restart`. */
export function buildRestartStarter(stack: ComposeStack) {
  const configFiles = splitConfigFiles(stack.ConfigFiles);
  return (launch: Launch) => stackSuperuser(configFiles)
    .then(su => { launch(restartStack(stack.Name, configFiles, [], [], su)); });
}

/** Builds a background-task starter for `kill`. */
export function buildKillStarter(stack: ComposeStack) {
  const configFiles = splitConfigFiles(stack.ConfigFiles);
  return (launch: Launch) => stackSuperuser(configFiles)
    .then(su => { launch(killStack(stack.Name, configFiles, [], su)); });
}
