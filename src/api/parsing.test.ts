import { describe, it, expect } from "vitest";
import {
  getProfilesFromCompose,
  hasServicesKey,
  parseStackStatus,
  parseServiceCount,
  parsePortsFull,
  parsePortsDetailed,
  parsePorts,
  getServicesFromCompose,
  getServiceProfileMapFromCompose,
  getProjectNameFromCompose,
  getComposeProjectNameFromEnv,
} from "./parsing";

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

describe("parseStackStatus", () => {
  it("returns 'running' when only running containers", () => {
    expect(parseStackStatus("running(2)")).toBe("running");
  });

  it("returns 'stopped' when only exited containers", () => {
    expect(parseStackStatus("exit(2)")).toBe("stopped");
  });

  it("returns 'stopped' when stopped (not exited)", () => {
    expect(parseStackStatus("stopped(1)")).toBe("stopped");
  });

  it("returns 'partial' when mix of running and exited", () => {
    expect(parseStackStatus("running(1), exit(1)")).toBe("partial");
  });

  it("returns 'paused' when only paused containers", () => {
    expect(parseStackStatus("paused(2)")).toBe("paused");
  });

  it("returns 'unknown' for an unrecognised string", () => {
    expect(parseStackStatus("creating(1)")).toBe("unknown");
  });

  it("is case-insensitive", () => {
    expect(parseStackStatus("Running(1)")).toBe("running");
  });
});

describe("parseServiceCount", () => {
  it("returns the count from a single parenthesised number", () => {
    expect(parseServiceCount("running(3)")).toBe(3);
  });

  it("sums counts when multiple parenthesised numbers are present", () => {
    expect(parseServiceCount("running(1), exit(2)")).toBe(3);
  });

  it("returns 0 when there are no parenthesised numbers", () => {
    expect(parseServiceCount("no containers")).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(parseServiceCount("")).toBe(0);
  });
});

describe("parsePortsFull", () => {
  it("returns empty array for empty string", () => {
    expect(parsePortsFull("")).toEqual([]);
  });

  it("parses a single port mapping", () => {
    const result = parsePortsFull("0.0.0.0:8080->80/tcp");
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("8080→80");
    expect(result[0].bindType).toBe("external");
  });

  it("prefers external bind over localhost bind for same label", () => {
    const result = parsePortsFull("127.0.0.1:8080->80/tcp, 0.0.0.0:8080->80/tcp");
    expect(result).toHaveLength(1);
    expect(result[0].bindType).toBe("external");
  });

  it("marks 127.0.0.1 as localhost bind type", () => {
    const result = parsePortsFull("127.0.0.1:9000->9000/tcp");
    expect(result[0].bindType).toBe("localhost");
  });

  it("marks a specific IP as specific bind type", () => {
    const result = parsePortsFull("192.168.1.5:8080->80/tcp");
    expect(result[0].bindType).toBe("specific");
  });

  it("parses multiple distinct port mappings", () => {
    const result = parsePortsFull("0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp");
    expect(result).toHaveLength(2);
  });

  it("ignores parts that do not match the expected format", () => {
    const result = parsePortsFull("garbage, 0.0.0.0:8080->80/tcp");
    expect(result).toHaveLength(1);
  });
});

describe("parsePortsDetailed", () => {
  it("returns empty array for empty string", () => {
    expect(parsePortsDetailed("")).toEqual([]);
  });

  it("deduplicates identical raw entries", () => {
    const result = parsePortsDetailed("0.0.0.0:8080->80/tcp, 0.0.0.0:8080->80/tcp");
    expect(result).toHaveLength(1);
  });

  it("keeps both entries when bind addresses differ", () => {
    const result = parsePortsDetailed("0.0.0.0:8080->80/tcp, 127.0.0.1:8080->80/tcp");
    expect(result).toHaveLength(2);
  });
});

describe("parsePorts", () => {
  it("returns labels only from parsePortsFull", () => {
    expect(parsePorts("0.0.0.0:8080->80/tcp, 0.0.0.0:443->443/tcp")).toEqual(["8080→80", "443→443"]);
  });

  it("returns empty array for empty string", () => {
    expect(parsePorts("")).toEqual([]);
  });
});

describe("getServicesFromCompose", () => {
  it("returns service names from valid YAML", () => {
    const yaml = "services:\n  web:\n    image: nginx\n  db:\n    image: postgres\n";
    expect(getServicesFromCompose(yaml)).toEqual(["web", "db"]);
  });

  it("returns empty array for malformed YAML", () => {
    expect(getServicesFromCompose("{ unclosed:")).toEqual([]);
  });

  it("returns empty array when services key is absent", () => {
    expect(getServicesFromCompose("version: '3'\n")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(getServicesFromCompose("")).toEqual([]);
  });
});

describe("getServiceProfileMapFromCompose", () => {
  it("returns map of service → profiles", () => {
    const yaml = `
services:
  web:
    image: nginx
  debug:
    image: busybox
    profiles: [dev]
`;
    const map = getServiceProfileMapFromCompose(yaml);
    expect(map).toEqual({ debug: ["dev"] });
  });

  it("omits services with no profiles", () => {
    const yaml = "services:\n  web:\n    image: nginx\n";
    expect(getServiceProfileMapFromCompose(yaml)).toEqual({});
  });

  it("ignores profiles that are not arrays", () => {
    const yaml = "services:\n  svc:\n    image: alpine\n    profiles: dev\n";
    expect(getServiceProfileMapFromCompose(yaml)).toEqual({});
  });

  it("returns empty object for malformed YAML", () => {
    expect(getServiceProfileMapFromCompose("{ bad:")).toEqual({});
  });

  it("returns empty object when services key absent", () => {
    expect(getServiceProfileMapFromCompose("version: '3'\n")).toEqual({});
  });
});

describe("getProjectNameFromCompose", () => {
  it("returns the name field when present", () => {
    expect(getProjectNameFromCompose("name: myapp\nservices:\n  web:\n    image: nginx\n")).toBe("myapp");
  });

  it("returns null when name field is absent", () => {
    expect(getProjectNameFromCompose("services:\n  web:\n    image: nginx\n")).toBeNull();
  });

  it("returns null for malformed YAML", () => {
    expect(getProjectNameFromCompose("{ bad:")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getProjectNameFromCompose("")).toBeNull();
  });
});

describe("getComposeProjectNameFromEnv", () => {
  it("returns the value of COMPOSE_PROJECT_NAME", () => {
    expect(getComposeProjectNameFromEnv("COMPOSE_PROJECT_NAME=myapp\n")).toBe("myapp");
  });

  it("strips surrounding double quotes", () => {
    expect(getComposeProjectNameFromEnv('COMPOSE_PROJECT_NAME="myapp"')).toBe("myapp");
  });

  it("strips surrounding single quotes", () => {
    expect(getComposeProjectNameFromEnv("COMPOSE_PROJECT_NAME='myapp'")).toBe("myapp");
  });

  it("returns null when key is absent", () => {
    expect(getComposeProjectNameFromEnv("OTHER_VAR=value\n")).toBeNull();
  });

  it("skips comment lines", () => {
    expect(getComposeProjectNameFromEnv("# COMPOSE_PROJECT_NAME=commented\n")).toBeNull();
  });

  it("returns null when value is empty", () => {
    expect(getComposeProjectNameFromEnv("COMPOSE_PROJECT_NAME=\n")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getComposeProjectNameFromEnv("")).toBeNull();
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
