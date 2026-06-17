import { pullStack, composeFileSuperuser, readAllProfiles, isRootlessMode } from "../api";
import { useAsyncStream } from "./useAsyncStream";

export function usePullStream(stackName: string, configFiles: string[]) {
  const configFilesKey = configFiles.join(",");

  return useAsyncStream(
    launch => Promise.all([
      isRootlessMode() ? Promise.resolve<"try" | undefined>(undefined) : composeFileSuperuser(configFiles),
      readAllProfiles(configFiles[0]),
    ]).then(([su, profiles]) => { launch(pullStack(stackName, configFiles, profiles, su)); }),
    [stackName, configFilesKey],
  );
}
