import { upStackStream, stackSuperuser } from "../api";
import { useAsyncStream } from "./useAsyncStream";

export function useUpStream(stackName: string, configFiles: string[], profiles: string[] = []) {
  const configFilesKey = configFiles.join(",");

  return useAsyncStream(
    launch => stackSuperuser(configFiles).then(su => { launch(upStackStream(stackName, configFiles, profiles, su)); }),
    [stackName, configFilesKey],
  );
}
