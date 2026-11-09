import { composeIsLimitedBackend } from "./cockpit";
import { getJobsFromCompose } from "./parsing";

/**
 * The jobs a compose file declares. podman-compose has no notion of jobs, so there are
 * none to list there, whatever the file says.
 */
export function declaredJobs(composeContent: string): ReturnType<typeof getJobsFromCompose> {
  return composeIsLimitedBackend() ? [] : getJobsFromCompose(composeContent);
}
