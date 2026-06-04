import { describe, it, expect } from "vitest";
import {
  hashStr,
  serviceColor,
  SERVICE_COLORS,
  fmtTimestamp,
  TOKEN_RE,
  tokenColor,
  tokenWeight,
  parseLine,
} from "./logParser";

describe("hashStr", () => {
  it("returns a number", () => {
    expect(typeof hashStr("web")).toBe("number");
  });

  it("is deterministic", () => {
    expect(hashStr("nginx")).toBe(hashStr("nginx"));
  });

  it("returns different values for different strings", () => {
    expect(hashStr("web")).not.toBe(hashStr("db"));
  });
});

describe("serviceColor", () => {
  it("returns a hex color from the palette", () => {
    const color = serviceColor("web");
    expect(SERVICE_COLORS).toContain(color);
  });

  it("is deterministic for the same name", () => {
    expect(serviceColor("nginx")).toBe(serviceColor("nginx"));
  });

  it("can return different colors for different names", () => {
    const colors = new Set(["web", "db", "cache", "proxy", "worker", "queue", "api", "auth"].map(serviceColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe("fmtTimestamp", () => {
  it("formats a valid ISO timestamp to DD-MM-YYYY\\nHH:MM", () => {
    const result = fmtTimestamp("2024-01-15T14:30:45.000Z");
    expect(result).toMatch(/\d{2}-\d{2}-\d{4}\n\d{2}:\d{2}:\d{2}/);
  });

  it("falls back to slicing chars 11-16 for invalid timestamps", () => {
    // "invalid-ts-xyz"[11:16] = "xyz"
    expect(fmtTimestamp("invalid-ts-xyz")).toBe("xyz");
  });

  it("handles timestamps without Z suffix", () => {
    const result = fmtTimestamp("2024-01-15T10:20:30");
    expect(result).toMatch(/\d{2}-\d{2}-\d{4}\n\d{2}:\d{2}:\d{2}/);
  });
});

describe("TOKEN_RE", () => {
  it("matches ERROR keyword", () => {
    TOKEN_RE.lastIndex = 0;
    expect(TOKEN_RE.test("connection ERROR occurred")).toBe(true);
  });

  it("matches WARN keyword", () => {
    TOKEN_RE.lastIndex = 0;
    expect(TOKEN_RE.test("WARN: retrying")).toBe(true);
  });

  it("matches HTTP 5xx codes", () => {
    TOKEN_RE.lastIndex = 0;
    expect(TOKEN_RE.test("status 502")).toBe(true);
  });

  it("matches HTTP 4xx codes", () => {
    TOKEN_RE.lastIndex = 0;
    expect(TOKEN_RE.test("status 404")).toBe(true);
  });

  it("matches HTTP 2xx codes", () => {
    TOKEN_RE.lastIndex = 0;
    expect(TOKEN_RE.test("status 200")).toBe(true);
  });

  it("matches IPv4 addresses", () => {
    TOKEN_RE.lastIndex = 0;
    expect(TOKEN_RE.test("request from 192.168.1.1")).toBe(true);
  });

  it("matches file paths", () => {
    TOKEN_RE.lastIndex = 0;
    expect(TOKEN_RE.test("reading /etc/config/app.conf")).toBe(true);
  });

  it("matches quoted strings", () => {
    TOKEN_RE.lastIndex = 0;
    expect(TOKEN_RE.test('key "value"')).toBe(true);
  });

  it("does NOT match single standalone numbers (e.g. port 80)", () => {
    TOKEN_RE.lastIndex = 0;
    const m = "port 80 open".match(TOKEN_RE);
    // 80 should not match any of our patterns
    expect(m).toBeNull();
  });

  it("resets lastIndex properly between calls (no stale state bug)", () => {
    // Call once to advance lastIndex
    TOKEN_RE.lastIndex = 0;
    TOKEN_RE.exec("first ERROR call");
    // Without reset, the next call on a short string could skip matches
    TOKEN_RE.lastIndex = 0;
    const match = TOKEN_RE.exec("ERROR here");
    expect(match).not.toBeNull();
    expect(match![0].toUpperCase()).toBe("ERROR");
  });
});

describe("tokenColor", () => {
  it("returns red for ERROR", () => {
    expect(tokenColor("ERROR")).toBe("#f85149");
  });

  it("returns red for FATAL", () => {
    expect(tokenColor("FATAL")).toBe("#f85149");
  });

  it("returns yellow for WARN", () => {
    expect(tokenColor("WARN")).toBe("#e3b341");
  });

  it("returns blue for INFO", () => {
    expect(tokenColor("INFO")).toBe("#79c0ff");
  });

  it("returns grey for DEBUG", () => {
    expect(tokenColor("DEBUG")).toBe("#8b949e");
  });

  it("returns grey for TRACE", () => {
    expect(tokenColor("TRACE")).toBe("#6e7681");
  });

  it("returns red for 5xx", () => {
    expect(tokenColor("503")).toBe("#f85149");
  });

  it("returns yellow for 4xx", () => {
    expect(tokenColor("404")).toBe("#e3b341");
  });

  it("returns green for 2xx", () => {
    expect(tokenColor("200")).toBe("#56d364");
  });

  it("returns light blue for quoted strings", () => {
    expect(tokenColor('"hello"')).toBe("#a5d6ff");
  });

  it("returns purple for paths", () => {
    expect(tokenColor("/etc/config")).toBe("#d2a8ff");
  });

  it("returns orange for IPv4", () => {
    expect(tokenColor("192.168.1.1")).toBe("#ffa657");
  });
});

describe("tokenWeight", () => {
  it("returns 700 for ERROR", () => {
    expect(tokenWeight("ERROR")).toBe(700);
  });

  it("returns 700 for WARN", () => {
    expect(tokenWeight("WARN")).toBe(700);
  });

  it("returns inherit for INFO", () => {
    expect(tokenWeight("INFO")).toBe("inherit");
  });

  it("returns inherit for 200", () => {
    expect(tokenWeight("200")).toBe("inherit");
  });
});

describe("parseLine", () => {
  it("returns empty service for lines without ' | '", () => {
    const result = parseLine("plain text line");
    expect(result.service).toBe("");
    expect(result.message).toBe("plain text line");
    expect(result.raw).toBe("plain text line");
  });

  it("parses service name from before ' | '", () => {
    const result = parseLine("web-1  | starting server");
    expect(result.service).toBe("web-1");
    expect(result.message).toBe("starting server");
  });

  it("extracts timestamp when present", () => {
    const result = parseLine("db-1  | 2024-01-15T10:20:30.000Z connected");
    expect(result.timestamp).toMatch(/\d{2}-\d{2}-\d{4}\n\d{2}:\d{2}:\d{2}/);
    expect(result.message).toBe("connected");
  });

  it("detects error level", () => {
    const result = parseLine("api-1  | ERROR: connection refused");
    expect(result.level).toBe("error");
  });

  it("detects warn level", () => {
    const result = parseLine("api-1  | WARN: retrying in 5s");
    expect(result.level).toBe("warn");
  });

  it("detects info level", () => {
    const result = parseLine("api-1  | INFO: server started");
    expect(result.level).toBe("info");
  });

  it("detects debug level", () => {
    const result = parseLine("api-1  | DEBUG: cache hit");
    expect(result.level).toBe("debug");
  });

  it("returns null level for plain messages", () => {
    const result = parseLine("api-1  | request processed");
    expect(result.level).toBeNull();
  });
});
