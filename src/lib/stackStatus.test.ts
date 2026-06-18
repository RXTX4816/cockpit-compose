import { describe, it, expect } from "vitest";
import { effectiveStatus, stackHealthSummary } from "./stackStatus";
import type { ComposeContainer } from "../api";

function makeContainer(state: string, status: string, health?: string): ComposeContainer {
  return { ID: "abc", Name: "svc", Image: "img", State: state, Status: status, Health: health, Ports: "", Service: "svc" };
}

describe("effectiveStatus", () => {
  it("returns base status when not partial", () => {
    expect(effectiveStatus("running", [])).toBe("running");
    expect(effectiveStatus("stopped", [])).toBe("stopped");
  });

  it("returns partial when containers array is empty", () => {
    expect(effectiveStatus("partial", [])).toBe("partial");
  });

  it("returns partial when there are no exited containers", () => {
    const containers = [makeContainer("running", "Up 2 hours")];
    expect(effectiveStatus("partial", containers)).toBe("partial");
  });

  it("returns running when all exited containers exited with code 0", () => {
    const containers = [
      makeContainer("running", "Up 2 hours"),
      makeContainer("exited", "Exited (0) 1 hour ago"),
    ];
    expect(effectiveStatus("partial", containers)).toBe("running");
  });

  it("returns partial when any exited container has non-zero exit code", () => {
    const containers = [
      makeContainer("running", "Up 2 hours"),
      makeContainer("exited", "Exited (1) 1 hour ago"),
    ];
    expect(effectiveStatus("partial", containers)).toBe("partial");
  });
});

describe("stackHealthSummary", () => {
  it("returns null when no containers have health info", () => {
    const containers = [makeContainer("running", "Up", undefined)];
    expect(stackHealthSummary(containers)).toBeNull();
  });

  it("returns null for empty container list", () => {
    expect(stackHealthSummary([])).toBeNull();
  });

  it("returns healthy when all containers are healthy", () => {
    const containers = [
      makeContainer("running", "Up", "healthy"),
      makeContainer("running", "Up", "healthy"),
    ];
    expect(stackHealthSummary(containers)).toBe("healthy");
  });

  it("returns unhealthy when any container is not healthy", () => {
    const containers = [
      makeContainer("running", "Up", "healthy"),
      makeContainer("running", "Up", "unhealthy"),
    ];
    expect(stackHealthSummary(containers)).toBe("unhealthy");
  });

  it("ignores containers with no health field", () => {
    const containers = [
      makeContainer("running", "Up", undefined),
      makeContainer("running", "Up", "healthy"),
    ];
    expect(stackHealthSummary(containers)).toBe("healthy");
  });
});
