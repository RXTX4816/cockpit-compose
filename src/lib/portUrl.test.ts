import { describe, it, expect, beforeEach, vi } from "vitest";
import { getPortUrl } from "./portUrl";
import type { ParsedPort } from "../api/types";

function makePort(overrides: Partial<ParsedPort>): ParsedPort {
  return {
    label: "8080",
    fullLabel: "0.0.0.0:8080->8080/tcp",
    bindAddress: "0.0.0.0",
    hostPort: "8080",
    containerPort: "8080",
    protocol: "tcp",
    bindType: "external",
    ...overrides,
  };
}

describe("getPortUrl", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { location: { hostname: "myserver.local" } });
  });

  it("returns https URL for external binding", () => {
    const port = makePort({ bindType: "external", hostPort: "8080" });
    expect(getPortUrl(port)).toBe("https://myserver.local:8080");
  });

  it("uses http scheme when hostPort is 80", () => {
    const port = makePort({ bindType: "external", hostPort: "80", containerPort: "80" });
    expect(getPortUrl(port)).toBe("http://myserver.local:80");
  });

  it("uses http scheme when containerPort is 80", () => {
    const port = makePort({ bindType: "external", hostPort: "8080", containerPort: "80" });
    expect(getPortUrl(port)).toBe("http://myserver.local:8080");
  });

  it("returns URL with bindAddress for specific binding", () => {
    const port = makePort({ bindType: "specific", bindAddress: "192.168.1.5", hostPort: "9090" });
    expect(getPortUrl(port)).toBe("https://192.168.1.5:9090");
  });

  it("returns null for localhost binding when not on localhost", () => {
    const port = makePort({ bindType: "localhost", hostPort: "3000" });
    expect(getPortUrl(port)).toBeNull();
  });

  it("returns localhost URL when hostname is localhost", () => {
    vi.stubGlobal("window", { location: { hostname: "localhost" } });
    const port = makePort({ bindType: "localhost", hostPort: "3000" });
    expect(getPortUrl(port)).toBe("https://localhost:3000");
  });

  it("returns localhost URL when hostname is 127.0.0.1", () => {
    vi.stubGlobal("window", { location: { hostname: "127.0.0.1" } });
    const port = makePort({ bindType: "localhost", hostPort: "3000" });
    expect(getPortUrl(port)).toBe("https://localhost:3000");
  });
});
