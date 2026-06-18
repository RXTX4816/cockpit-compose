import { describe, it, expect } from "vitest";
import { stripAnsi, classifyLine, kindColor } from "./pullParser";

describe("stripAnsi", () => {
  it("removes ANSI color codes", () => {
    const ESC = String.fromCharCode(27);
    expect(stripAnsi(`${ESC}[31mRED${ESC}[0m`)).toBe("RED");
  });

  it("leaves plain strings untouched", () => {
    expect(stripAnsi("plain text")).toBe("plain text");
  });

  it("removes multiple sequences in one string", () => {
    const ESC = String.fromCharCode(27);
    const input = `${ESC}[1m${ESC}[32mBold Green${ESC}[0m`;
    expect(stripAnsi(input)).toBe("Bold Green");
  });
});

describe("classifyLine", () => {
  it("classifies error lines", () => {
    expect(classifyLine("Error: image not found")).toBe("error");
  });

  it("classifies err prefix lines", () => {
    expect(classifyLine("err: pull failed")).toBe("error");
  });

  it("classifies success lines with checkmark", () => {
    expect(classifyLine("✓ pulled nginx:latest")).toBe("success");
  });

  it("classifies done lines as success", () => {
    expect(classifyLine("Pull complete")).toBe("success");
  });

  it("classifies CACHED BuildKit lines as success", () => {
    expect(classifyLine("#5 CACHED")).toBe("success");
  });

  it("classifies empty lines as dim", () => {
    expect(classifyLine("")).toBe("dim");
    expect(classifyLine("   ")).toBe("dim");
  });

  it("classifies regular output as info", () => {
    expect(classifyLine("Pulling from library/nginx")).toBe("info");
  });
});

describe("kindColor", () => {
  it("classifies Podman 'Copying blob' as success", () => {
    expect(classifyLine("Copying blob abc123")).toBe("success");
    expect(classifyLine("Copying config sha256:abc")).toBe("success");
    expect(classifyLine("Copying manifest for docker.io/library/nginx")).toBe("success");
  });

  it("classifies Podman 'Writing manifest' as success", () => {
    expect(classifyLine("Writing manifest to image destination")).toBe("success");
  });

  it("classifies Podman 'Storing signatures' as success", () => {
    expect(classifyLine("Storing signatures")).toBe("success");
  });

  it("has entries for all kinds", () => {
    expect(kindColor.info).toBeDefined();
    expect(kindColor.error).toBeDefined();
    expect(kindColor.success).toBeDefined();
    expect(kindColor.dim).toBeDefined();
  });

  it("uses red for error", () => {
    expect(kindColor.error).toBe("#f85149");
  });

  it("uses green for success", () => {
    expect(kindColor.success).toBe("#56d364");
  });
});
