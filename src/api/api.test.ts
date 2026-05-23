import { describe, it, expect } from "vitest";
import { parseJsonOutput, parseStackStatus, parseServiceCount, parsePorts, parsePortsFull, parsePortsDetailed, getServicesFromCompose, getProjectNameFromCompose, getComposeProjectNameFromEnv } from ".";

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

describe("parsePortsFull", () => {
  it("returns empty array for empty string", () => {
    expect(parsePortsFull("")).toEqual([]);
  });

  it("parses IPv4 external binding", () => {
    const [p] = parsePortsFull("0.0.0.0:8080->80/tcp");
    expect(p.label).toBe("8080→80");
    expect(p.fullLabel).toBe("0.0.0.0:8080 → 80/tcp");
    expect(p.bindType).toBe("external");
    expect(p.bindAddress).toBe("0.0.0.0");
  });

  it("parses IPv6 external binding (::)", () => {
    const [p] = parsePortsFull(":::8080->80/tcp");
    expect(p.bindType).toBe("external");
    expect(p.bindAddress).toBe("::");
    expect(p.label).toBe("8080→80");
  });

  it("parses localhost binding", () => {
    const [p] = parsePortsFull("127.0.0.1:8080->80/tcp");
    expect(p.bindType).toBe("localhost");
    expect(p.fullLabel).toBe("127.0.0.1:8080 → 80/tcp");
  });

  it("parses specific IP binding", () => {
    const [p] = parsePortsFull("192.168.1.10:8080->80/tcp");
    expect(p.bindType).toBe("specific");
    expect(p.bindAddress).toBe("192.168.1.10");
  });

  it("deduplicates IPv4/IPv6 pairs keeping most-exposed (external wins)", () => {
    const ports = parsePortsFull("127.0.0.1:8080->80/tcp, 0.0.0.0:8080->80/tcp");
    expect(ports).toHaveLength(1);
    expect(ports[0].bindType).toBe("external");
  });

  it("deduplicates IPv4/IPv6 external pairs to one entry", () => {
    const ports = parsePortsFull("0.0.0.0:8080->80/tcp, :::8080->80/tcp");
    expect(ports).toHaveLength(1);
    expect(ports[0].bindType).toBe("external");
  });
});

describe("parsePortsDetailed", () => {
  it("returns all individual bindings without deduplication by label", () => {
    const ports = parsePortsDetailed("0.0.0.0:8080->80/tcp, :::8080->80/tcp");
    expect(ports).toHaveLength(2);
    expect(ports[0].bindAddress).toBe("0.0.0.0");
    expect(ports[1].bindAddress).toBe("::");
  });

  it("returns empty for non-mapped port strings", () => {
    expect(parsePortsDetailed("80/tcp")).toEqual([]);
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

describe("getProjectNameFromCompose", () => {
  it("returns the name: field value", () => {
    expect(getProjectNameFromCompose("name: my-project\nservices:\n  web:\n    image: nginx\n")).toBe("my-project");
  });

  it("returns null when no name: field", () => {
    expect(getProjectNameFromCompose("services:\n  web:\n    image: nginx\n")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(getProjectNameFromCompose("")).toBeNull();
  });

  it("returns null for invalid YAML", () => {
    expect(getProjectNameFromCompose("{ bad: yaml: here")).toBeNull();
  });

  it("trims whitespace from the name", () => {
    expect(getProjectNameFromCompose("name:  spaced  \nservices: {}")).toBe("spaced");
  });
});

describe("getComposeProjectNameFromEnv", () => {
  it("extracts COMPOSE_PROJECT_NAME", () => {
    expect(getComposeProjectNameFromEnv("FOO=bar\nCOMPOSE_PROJECT_NAME=mystack\nBAZ=qux")).toBe("mystack");
  });

  it("strips surrounding quotes", () => {
    expect(getComposeProjectNameFromEnv('COMPOSE_PROJECT_NAME="quoted"')).toBe("quoted");
    expect(getComposeProjectNameFromEnv("COMPOSE_PROJECT_NAME='single'")).toBe("single");
  });

  it("returns null when variable is absent", () => {
    expect(getComposeProjectNameFromEnv("FOO=bar\nBAZ=qux")).toBeNull();
  });

  it("returns null for empty content", () => {
    expect(getComposeProjectNameFromEnv("")).toBeNull();
  });

  it("ignores commented-out lines", () => {
    expect(getComposeProjectNameFromEnv("# COMPOSE_PROJECT_NAME=ignored\nFOO=bar")).toBeNull();
  });
});
