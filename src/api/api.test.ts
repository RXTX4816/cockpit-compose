import { describe, it, expect } from "vitest";
import { parseJsonOutput, parseStackStatus, parseServiceCount, getHealthStatus, parsePorts, getServicesFromCompose } from ".";

describe("parseJsonOutput", () => {
  it("parses JSON array format", () => {
    const json = '[{"name":"test1"},{"name":"test2"}]';
    const result = parseJsonOutput<{ name: string }>(json);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("test1");
  });

  it("parses JSONL format", () => {
    const jsonl = '{"name":"test1"}\n{"name":"test2"}';
    const result = parseJsonOutput<{ name: string }>(jsonl);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("test1");
  });

  it("returns empty array for empty input", () => {
    const result = parseJsonOutput<{ name: string }>("");
    expect(result).toEqual([]);
  });

  it("handles whitespace-only input", () => {
    const result = parseJsonOutput<{ name: string }>("\n\n  ");
    expect(result).toEqual([]);
  });
});

describe("parseStackStatus", () => {
  it("returns 'running' when all services running", () => {
    const status = "running(2)";
    expect(parseStackStatus(status)).toBe("running");
  });

  it("returns 'partial' when some services running", () => {
    const status = "running(1), exit(0)";
    expect(parseStackStatus(status)).toBe("partial");
  });

  it("returns 'stopped' when no services running", () => {
    const status = "exit(2)";
    expect(parseStackStatus(status)).toBe("stopped");
  });

  it("returns 'unknown' for invalid status", () => {
    const status = "invalid";
    expect(parseStackStatus(status)).toBe("unknown");
  });
});

describe("parseServiceCount", () => {
  it("extracts service count from status with parentheses", () => {
    const status = "running(2), exit(2)";
    expect(parseServiceCount(status)).toBe(4);
  });

  it("returns 0 for invalid status", () => {
    const status = "invalid";
    expect(parseServiceCount(status)).toBe(0);
  });

  it("returns 0 for empty status", () => {
    expect(parseServiceCount("")).toBe(0);
  });
});

describe("getHealthStatus", () => {
  it("returns 'healthy' when all running", () => {
    const status = "running(3)";
    expect(getHealthStatus(status)).toBe("healthy");
  });

  it("returns 'partial' when some running", () => {
    const status = "running(1), exit(2)";
    expect(getHealthStatus(status)).toBe("partial");
  });

  it("returns 'unhealthy' when none running", () => {
    const status = "exit(3)";
    expect(getHealthStatus(status)).toBe("unhealthy");
  });

  it("returns 'unhealthy' for invalid status", () => {
    expect(getHealthStatus("invalid")).toBe("unhealthy");
  });
});

describe("parsePorts", () => {
  it("returns empty array for empty string", () => {
    expect(parsePorts("")).toEqual([]);
  });

  it("parses a single IPv4 port mapping", () => {
    expect(parsePorts("0.0.0.0:8080->80/tcp")).toEqual(["8080→80"]);
  });

  it("deduplicates IPv4 and IPv6 mappings for the same port", () => {
    const ports = "0.0.0.0:8080->80/tcp, :::8080->80/tcp";
    expect(parsePorts(ports)).toEqual(["8080→80"]);
  });

  it("parses multiple distinct port mappings", () => {
    const ports = "0.0.0.0:8080->80/tcp, 0.0.0.0:8443->443/tcp";
    expect(parsePorts(ports)).toEqual(["8080→80", "8443→443"]);
  });

  it("returns empty for non-mapped port strings", () => {
    expect(parsePorts("80/tcp")).toEqual([]);
  });
});

describe("getServicesFromCompose", () => {
  it("returns service names from valid YAML", () => {
    const yaml = `
services:
  web:
    image: nginx
  db:
    image: postgres
`;
    expect(getServicesFromCompose(yaml)).toEqual(["web", "db"]);
  });

  it("returns empty array for empty string", () => {
    expect(getServicesFromCompose("")).toEqual([]);
  });

  it("returns empty array for invalid YAML", () => {
    expect(getServicesFromCompose("{ invalid: yaml: content")).toEqual([]);
  });

  it("returns empty array when no services key exists", () => {
    expect(getServicesFromCompose("version: '3'\nnetworks:\n  default: {}")).toEqual([]);
  });
});
