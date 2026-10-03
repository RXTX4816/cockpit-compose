import { describe, it, expect } from "vitest";
import { effectiveStatus, isStackUp, stackHealthSummary } from "./stackStatus";
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

  it("returns paused when the only live containers are paused beside a cleanly exited one", () => {
    const containers = [
      makeContainer("paused", "Up 2 hours (Paused)"),
      makeContainer("exited", "Exited (0) 1 hour ago"),
    ];
    expect(effectiveStatus("partial", containers)).toBe("paused");
  });

  it("stays partial when a live container is restarting, even if the exited ones are clean", () => {
    const containers = [
      makeContainer("restarting", "Restarting (1) 3 seconds ago"),
      makeContainer("exited", "Exited (0) 1 hour ago"),
    ];
    expect(effectiveStatus("partial", containers)).toBe("partial");
  });
});

describe("isStackUp", () => {
  it("is true while any container is live, paused included", () => {
    expect(isStackUp("running")).toBe(true);
    expect(isStackUp("partial")).toBe(true);
    expect(isStackUp("paused")).toBe(true);
  });

  it("is false for a stopped or unrecognised stack", () => {
    expect(isStackUp("stopped")).toBe(false);
    expect(isStackUp("unknown")).toBe(false);
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
