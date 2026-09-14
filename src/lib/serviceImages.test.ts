import { describe, it, expect } from "vitest";
import { parseServiceImages, pullBehaviourOf, isUnpinned } from "./serviceImages";

describe("pullBehaviourOf", () => {
  it("maps the long-standing policy values", () => {
    expect(pullBehaviourOf("always")).toBe("always");
    expect(pullBehaviourOf("never")).toBe("never");
    expect(pullBehaviourOf("missing")).toBe("missing");
    expect(pullBehaviourOf("if_not_present")).toBe("missing");
    expect(pullBehaviourOf("build")).toBe("missing");
  });

  // Compose 5.5.0 (#287) started honouring refresh windows.
  it("maps compose 5.5.0 refresh windows", () => {
    expect(pullBehaviourOf("refresh")).toBe("refresh");
    expect(pullBehaviourOf("daily")).toBe("refresh");
    expect(pullBehaviourOf("weekly")).toBe("refresh");
    expect(pullBehaviourOf("every_12h")).toBe("refresh");
    expect(pullBehaviourOf("every_3d")).toBe("refresh");
    expect(pullBehaviourOf("every_60")).toBe("refresh");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(pullBehaviourOf("  Always ")).toBe("always");
    expect(pullBehaviourOf("DAILY")).toBe("refresh");
  });

  it("treats an absent or unrecognised policy as unset rather than guessing", () => {
    expect(pullBehaviourOf("")).toBe("unset");
    expect(pullBehaviourOf("   ")).toBe("unset");
    // A value from some future Compose this plugin doesn't know about.
    expect(pullBehaviourOf("fortnightly")).toBe("unset");
    expect(pullBehaviourOf("alwayss")).toBe("unset");
  });
});

describe("isUnpinned", () => {
  it("treats an untagged or :latest image as unpinned", () => {
    expect(isUnpinned("nginx")).toBe(true);
    expect(isUnpinned("nginx:latest")).toBe(true);
    expect(isUnpinned("ghcr.io/owner/app")).toBe(true);
  });

  it("treats a version tag as pinned", () => {
    expect(isUnpinned("nginx:1.27")).toBe(false);
    expect(isUnpinned("nginx:alpine")).toBe(false);
  });

  it("treats a digest as pinned", () => {
    expect(isUnpinned("nginx@sha256:abc")).toBe(false);
  });

  it("does not mistake a registry port for a tag", () => {
    expect(isUnpinned("registry.local:5000/app")).toBe(true);
    expect(isUnpinned("registry.local:5000/app:1.2.3")).toBe(false);
  });
});

describe("parseServiceImages", () => {
  const yaml = `
services:
  web:
    image: nginx:latest
  api:
    image: ghcr.io/me/api:1.4.0
  builder:
    build: .
    image: local/builder:dev
  pinned_by_policy:
    image: redis:latest
    pull_policy: never
  windowed:
    image: caddy:latest
    pull_policy: weekly
`;

  it("lists image-bearing services and skips build-only ones", () => {
    const svcs = parseServiceImages(yaml);
    expect(svcs.map(s => s.service)).toEqual(["web", "api", "pinned_by_policy", "windowed"]);
  });

  it("flags an unpinned image as risky", () => {
    const web = parseServiceImages(yaml).find(s => s.service === "web")!;
    expect(web).toMatchObject({ image: "nginx:latest", pullBehaviour: "unset", risky: true });
  });

  it("does not flag a pinned image", () => {
    expect(parseServiceImages(yaml).find(s => s.service === "api")!.risky).toBe(false);
  });

  // The point of reading pull_policy at all: ":latest" is not a risk if the
  // service is never allowed to fetch a new one.
  it("does not flag an unpinned image the pull policy will never re-fetch", () => {
    const svc = parseServiceImages(yaml).find(s => s.service === "pinned_by_policy")!;
    expect(svc).toMatchObject({ pullPolicy: "never", pullBehaviour: "never", risky: false });
  });

  it("still flags an unpinned image on a refresh window, which does fetch", () => {
    const svc = parseServiceImages(yaml).find(s => s.service === "windowed")!;
    expect(svc).toMatchObject({ pullPolicy: "weekly", pullBehaviour: "refresh", risky: true });
  });

  it("returns [] for malformed yaml rather than throwing", () => {
    expect(parseServiceImages("services: [oh: no")).toEqual([]);
  });

  it("returns [] when there are no services", () => {
    expect(parseServiceImages("volumes:\n  data:\n")).toEqual([]);
  });

  it("ignores a non-string pull_policy instead of crashing", () => {
    const svcs = parseServiceImages("services:\n  a:\n    image: nginx:latest\n    pull_policy: 3\n");
    expect(svcs[0]).toMatchObject({ pullPolicy: "", pullBehaviour: "unset", risky: true });
  });
});
