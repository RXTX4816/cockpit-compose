/**
 * Podman compatibility adapter.
 *
 * This module collects ALL Podman-specific bridging logic in one place so that
 * contributors can see the full scope of Podman compatibility at a glance.
 *
 * The real implementations live in src/api/stacks.ts (where they sit alongside
 * the general API functions they support). This file re-exports them under a
 * single well-known path.
 */

export type { PodmanPsContainer } from "../stacks";

export {
  makeFakeProcess,
  groupPodmanContainers,
  listPodmanStacks,
  pauseUnpausePodmanFallback,
  composeTopPodmanFallback,
} from "../stacks";
