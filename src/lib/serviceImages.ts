import { load as loadYaml } from "js-yaml";

/**
 * How a service's `pull_policy` affects whether an `up` or `pull` can fetch a
 * newer image than the one already on disk.
 *
 * - `always`   — every up/pull re-fetches.
 * - `never`    — never fetches; the local image is used or the run fails.
 * - `missing`  — only fetches when the image is absent locally (`if_not_present`
 *                is the older spelling of the same thing, and `build` behaves the
 *                same way for our purposes: no registry fetch for an existing image).
 * - `refresh`  — fetches at most once per refresh window. Compose 5.5.0 added the
 *                window spellings `daily`, `weekly` and `every_<N><unit>`.
 * - `unset`    — no pull_policy given, so Compose's default applies.
 */
export type PullBehaviour = "always" | "never" | "missing" | "refresh" | "unset";

export interface ServiceImage {
  service: string;
  image: string;
  /** The literal `pull_policy` value from the compose file, or "" if unset. */
  pullPolicy: string;
  /** `pullPolicy` normalised into what it means for fetching. */
  pullBehaviour: PullBehaviour;
  /**
   * True when running up/pull on this service could bring in a different image
   * than the one currently on disk *without* the compose file changing — i.e. an
   * unpinned tag that this service's pull_policy actually allows fetching.
   */
  risky: boolean;
}

// Compose 5.5.0 honours refresh windows on pull_policy: the fixed `daily` and
// `weekly`, plus `every_<N><unit>` (e.g. every_12h, every_3d). Matched loosely on
// purpose — the CLI is the authority on which spellings it accepts, and an older
// Compose rejecting a value is between the user and the CLI. We only need to know
// "this is a time-windowed fetch" to describe it accurately.
const REFRESH_WINDOW_RE = /^(daily|weekly|every_\d+[a-z]*)$/i;

export function pullBehaviourOf(pullPolicy: string): PullBehaviour {
  const p = pullPolicy.trim().toLowerCase();
  if (!p) return "unset";
  if (p === "always") return "always";
  if (p === "never") return "never";
  if (p === "missing" || p === "if_not_present" || p === "build") return "missing";
  if (p === "refresh" || REFRESH_WINDOW_RE.test(p)) return "refresh";
  // Anything unrecognised (a typo, or a value from a Compose newer than this
  // plugin knows about) is treated as unset: describe the default, don't guess.
  return "unset";
}

/** True for an image reference with no tag, or an explicitly `:latest` one. */
export function isUnpinned(image: string): boolean {
  // Only the part after the last "/" can carry a tag — a registry host may contain
  // a ":port" that is not a tag (e.g. "registry.local:5000/app").
  const lastSegment = image.slice(image.lastIndexOf("/") + 1);
  if (lastSegment.includes("@")) return false; // pinned by digest
  const tag = lastSegment.includes(":") ? lastSegment.split(":").pop()! : "latest";
  return tag === "latest" || tag === "";
}

/**
 * Extract the image-bearing services from a compose file.
 *
 * Services that only `build` are skipped: there is no registry image to pull for
 * them. Shared by the Up and Pull confirmation dialogs, which both need to warn
 * about images that could change underneath the user.
 */
export function parseServiceImages(yaml: string): ServiceImage[] {
  try {
    const doc = loadYaml(yaml) as Record<string, unknown>;
    const services = doc?.services as
      | Record<string, { image?: string; build?: unknown; pull_policy?: unknown }>
      | undefined;
    if (!services) return [];
    return Object.entries(services)
      .filter(([, svc]) => svc?.image && !svc?.build)
      .map(([service, svc]) => {
        const image = svc.image!;
        const pullPolicy = typeof svc.pull_policy === "string" ? svc.pull_policy : "";
        const pullBehaviour = pullBehaviourOf(pullPolicy);
        return {
          service,
          image,
          pullPolicy,
          pullBehaviour,
          // An unpinned tag is only a risk if this service is actually allowed to
          // fetch. `never` pins it to whatever is on disk; `missing` won't re-fetch
          // an image that already exists.
          risky:
            isUnpinned(image) &&
            pullBehaviour !== "never" &&
            pullBehaviour !== "missing",
        };
      });
  } catch {
    return [];
  }
}
