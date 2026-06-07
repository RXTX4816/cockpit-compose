import { describe, it, expect } from "vitest";
import { getProfilesFromCompose, hasServicesKey } from "./parsing";

describe("getProfilesFromCompose", () => {
  it("returns empty array when no services have profiles", () => {
    const yaml = "services:\n  web:\n    image: nginx\n  db:\n    image: postgres\n";
    expect(getProfilesFromCompose(yaml)).toEqual([]);
  });

  it("returns sorted profile names from profiled services", () => {
    const yaml = `
services:
  web:
    image: nginx
  debug:
    image: busybox
    profiles: [dev, debug]
  metrics:
    image: prom/prometheus
    profiles: [monitoring]
`;
    expect(getProfilesFromCompose(yaml)).toEqual(["debug", "dev", "monitoring"]);
  });

  it("deduplicates profiles shared across services", () => {
    const yaml = `
services:
  svc1:
    image: alpine
    profiles: [dev]
  svc2:
    image: alpine
    profiles: [dev, prod]
`;
    expect(getProfilesFromCompose(yaml)).toEqual(["dev", "prod"]);
  });

  it("returns empty array for malformed YAML", () => {
    expect(getProfilesFromCompose("{ invalid: yaml: content:")).toEqual([]);
  });

  it("returns empty array for empty content", () => {
    expect(getProfilesFromCompose("")).toEqual([]);
  });

  it("returns empty array when there is no services key", () => {
    const yaml = "version: '3'\nnetworks:\n  default:\n";
    expect(getProfilesFromCompose(yaml)).toEqual([]);
  });

  it("ignores non-string profile entries", () => {
    const yaml = `
services:
  svc:
    image: alpine
    profiles: [valid, 123]
`;
    expect(getProfilesFromCompose(yaml)).toEqual(["valid"]);
  });

  it("handles mixed profiled and unprofiled services", () => {
    const yaml = `
services:
  always:
    image: nginx
  optional:
    image: busybox
    profiles: [debug]
`;
    expect(getProfilesFromCompose(yaml)).toEqual(["debug"]);
  });
});

describe("hasServicesKey", () => {
  it("returns true when services: key is present with services", () => {
    expect(hasServicesKey("services:\n  web:\n    image: nginx\n")).toBe(true);
  });

  it("returns true when services: key is present but empty", () => {
    expect(hasServicesKey("services:\n")).toBe(true);
  });

  it("returns false for an empty string", () => {
    expect(hasServicesKey("")).toBe(false);
  });

  it("returns false when services: key is absent", () => {
    expect(hasServicesKey("version: '3'\nnetworks:\n  mynet:\n")).toBe(false);
  });

  it("returns false for invalid YAML", () => {
    expect(hasServicesKey("services:\n  [unclosed")).toBe(false);
  });

  it("returns false for a plain scalar", () => {
    expect(hasServicesKey("just a string")).toBe(false);
  });
});
