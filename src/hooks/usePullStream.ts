import { stackOperations, type ComposeStack } from "../api";
import { useAsyncStream } from "./useAsyncStream";

export function usePullStream(stackName: string, configFiles: string[]) {
  const configFilesKey = configFiles.join(",");

  return useAsyncStream(
    launch => {
      const stack: ComposeStack = { Name: stackName, Status: "", ConfigFiles: configFiles.join(",") };
      launch(stackOperations.pull(stack));
      return Promise.resolve();
    },
    [stackName, configFilesKey],
  );
}
