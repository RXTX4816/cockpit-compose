import { stackOperations, type ComposeStack } from "../api";
import { useAsyncStream } from "./useAsyncStream";

export function useUpStream(stackName: string, configFiles: string[], profiles: string[] = []) {
  const configFilesKey = configFiles.join(",");

  return useAsyncStream(
    launch => {
      const stack: ComposeStack = { Name: stackName, Status: "", ConfigFiles: configFiles.join(",") };
      launch(stackOperations.up(stack, { profiles }));
      return Promise.resolve();
    },
    [stackName, configFilesKey],
  );
}
