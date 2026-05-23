import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { mockProcess } from "../test/helpers";

const mockFindComposeFiles = vi.fn();
const mockReadComposeFile = vi.fn();
const mockReadEnvFile = vi.fn();

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    findComposeFiles: mockFindComposeFiles,
    readComposeFile: mockReadComposeFile,
    readEnvFile: mockReadEnvFile,
  };
});

beforeEach(() => {
  mockFindComposeFiles.mockReset();
  // Default: compose file has no name: field, no .env present.
  // Use mockImplementation so a fresh mockProcess (fresh microtask) is created on each call.
  mockReadComposeFile.mockImplementation(() => mockProcess("services:\n  web:\n    image: nginx\n"));
  mockReadEnvFile.mockResolvedValue({ content: "", exists: false });
});

describe("useDownedStacksScan", () => {
  it("starts with empty state and hasScanned=false", async () => {
    const { useDownedStacksScan } = await import("./useDownedStacksScan");
    const { result } = renderHook(() =>
      useDownedStacksScan("", [])
    );
    expect(result.current.downedStacks).toEqual([]);
    expect(result.current.scanning).toBe(false);
    expect(result.current.hasScanned).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("parses found compose files into downed stacks", async () => {
    const { useDownedStacksScan } = await import("./useDownedStacksScan");
    mockFindComposeFiles.mockReturnValue(
      mockProcess("/etc/docker/compose/myapp/docker-compose.yml\n/etc/docker/compose/blog/compose.yml\n")
    );

    const { result } = renderHook(() =>
      useDownedStacksScan("/etc/docker/compose", [])
    );

    act(() => { result.current.scan(); });

    await waitFor(() => expect(result.current.scanning).toBe(false));

    expect(result.current.downedStacks).toHaveLength(2);
    expect(result.current.downedStacks[0]).toEqual({
      name: "myapp",
      configFile: "/etc/docker/compose/myapp/docker-compose.yml",
    });
    expect(result.current.downedStacks[1]).toEqual({
      name: "blog",
      configFile: "/etc/docker/compose/blog/compose.yml",
    });
    expect(result.current.error).toBeNull();
    expect(result.current.hasScanned).toBe(true);
  });

  it("sets hasScanned=true when scan finds nothing", async () => {
    const { useDownedStacksScan } = await import("./useDownedStacksScan");
    mockFindComposeFiles.mockReturnValue(mockProcess(""));

    const { result } = renderHook(() =>
      useDownedStacksScan("/etc/docker/compose", [])
    );

    act(() => { result.current.scan(); });
    await waitFor(() => expect(result.current.scanning).toBe(false));

    expect(result.current.hasScanned).toBe(true);
    expect(result.current.downedStacks).toHaveLength(0);
  });

  it("sets hasScanned=false when scan errors", async () => {
    const { useDownedStacksScan } = await import("./useDownedStacksScan");
    mockFindComposeFiles.mockReturnValue(mockProcess("", "permission denied"));

    const { result } = renderHook(() =>
      useDownedStacksScan("/etc", [])
    );

    act(() => { result.current.scan(); });
    await waitFor(() => expect(result.current.scanning).toBe(false));

    expect(result.current.hasScanned).toBe(false);
  });

  it("clear() resets hasScanned to false", async () => {
    const { useDownedStacksScan } = await import("./useDownedStacksScan");
    mockFindComposeFiles.mockReturnValue(mockProcess(""));

    const { result } = renderHook(() =>
      useDownedStacksScan("/etc/docker/compose", [])
    );

    act(() => { result.current.scan(); });
    await waitFor(() => expect(result.current.hasScanned).toBe(true));

    act(() => { result.current.clear(); });
    expect(result.current.hasScanned).toBe(false);
  });

  it("scan() clears previous stale results before producing new ones", async () => {
    const { useDownedStacksScan } = await import("./useDownedStacksScan");
    mockFindComposeFiles.mockReturnValue(
      mockProcess("/etc/docker/compose/myapp/docker-compose.yml\n")
    );

    const { result } = renderHook(() =>
      useDownedStacksScan("/etc/docker/compose", [])
    );

    act(() => { result.current.scan(); });
    await waitFor(() => expect(result.current.downedStacks).toHaveLength(1));

    mockFindComposeFiles.mockReturnValue(mockProcess(""));
    act(() => { result.current.scan(); });
    // immediately after scan() starts, stale results are gone
    expect(result.current.downedStacks).toHaveLength(0);
    await act(async () => {});
  });

  it("filters out stacks already in existingStacks (case-insensitive)", async () => {
    const { useDownedStacksScan } = await import("./useDownedStacksScan");
    mockFindComposeFiles.mockReturnValue(
      mockProcess("/etc/docker/compose/myapp/docker-compose.yml\n/etc/docker/compose/blog/compose.yml\n")
    );

    const { result } = renderHook(() =>
      useDownedStacksScan("/etc/docker/compose", [
        { Name: "myapp", Status: "running(1)", ConfigFiles: "/etc/docker/compose/myapp/docker-compose.yml" },
      ])
    );

    act(() => { result.current.scan(); });

    await waitFor(() => expect(result.current.scanning).toBe(false));

    expect(result.current.downedStacks).toHaveLength(1);
    expect(result.current.downedStacks[0].name).toBe("blog");
  });

  it("deduplicates stacks with the same name", async () => {
    const { useDownedStacksScan } = await import("./useDownedStacksScan");
    mockFindComposeFiles.mockReturnValue(
      mockProcess(
        "/etc/docker/compose/myapp/compose.yml\n/etc/docker/compose/myapp/docker-compose.yml\n"
      )
    );

    const { result } = renderHook(() =>
      useDownedStacksScan("/etc/docker/compose", [])
    );

    act(() => { result.current.scan(); });

    await waitFor(() => expect(result.current.scanning).toBe(false));

    expect(result.current.downedStacks).toHaveLength(1);
    expect(result.current.downedStacks[0].name).toBe("myapp");
  });

  it("sets error state when find command fails", async () => {
    const { useDownedStacksScan } = await import("./useDownedStacksScan");
    mockFindComposeFiles.mockReturnValue(mockProcess("", "No such file or directory"));

    const { result } = renderHook(() =>
      useDownedStacksScan("/nonexistent", [])
    );

    act(() => { result.current.scan(); });

    await waitFor(() => expect(result.current.scanning).toBe(false));

    expect(result.current.error).toContain("No such file or directory");
    expect(result.current.downedStacks).toEqual([]);
  });

  it("clears results and hasScanned when clear() is called", async () => {
    const { useDownedStacksScan } = await import("./useDownedStacksScan");
    mockFindComposeFiles.mockReturnValue(
      mockProcess("/etc/docker/compose/myapp/docker-compose.yml\n")
    );

    const { result } = renderHook(() =>
      useDownedStacksScan("/etc/docker/compose", [])
    );

    act(() => { result.current.scan(); });
    await waitFor(() => expect(result.current.scanning).toBe(false));
    expect(result.current.downedStacks).toHaveLength(1);

    act(() => { result.current.clear(); });

    expect(result.current.downedStacks).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.hasScanned).toBe(false);
  });

  it("sets scanning to true while running", async () => {
    const { useDownedStacksScan } = await import("./useDownedStacksScan");
    mockFindComposeFiles.mockReturnValue(mockProcess(""));

    const { result } = renderHook(() =>
      useDownedStacksScan("/etc/docker/compose", [])
    );

    act(() => { result.current.scan(); });
    expect(result.current.scanning).toBe(true);

    await waitFor(() => expect(result.current.scanning).toBe(false));
  });

  it("removeStack removes an entry by name (case-insensitive)", async () => {
    const { useDownedStacksScan } = await import("./useDownedStacksScan");
    mockFindComposeFiles.mockReturnValue(
      mockProcess("/etc/docker/compose/myapp/docker-compose.yml\n/etc/docker/compose/blog/compose.yml\n")
    );

    const { result } = renderHook(() =>
      useDownedStacksScan("/etc/docker/compose", [])
    );

    act(() => { result.current.scan(); });
    await waitFor(() => expect(result.current.scanning).toBe(false));
    expect(result.current.downedStacks).toHaveLength(2);

    act(() => { result.current.removeStack("MYAPP"); });
    expect(result.current.downedStacks).toHaveLength(1);
    expect(result.current.downedStacks[0].name).toBe("blog");
  });

  it("addStack adds an entry", async () => {
    const { useDownedStacksScan } = await import("./useDownedStacksScan");
    const { result } = renderHook(() =>
      useDownedStacksScan("/etc/docker/compose", [])
    );

    act(() => {
      result.current.addStack({ name: "manual", configFile: "/etc/docker/compose/manual/docker-compose.yml" });
    });

    expect(result.current.downedStacks).toHaveLength(1);
    expect(result.current.downedStacks[0].name).toBe("manual");
  });

  it("addStack deduplicates case-insensitively", async () => {
    const { useDownedStacksScan } = await import("./useDownedStacksScan");
    mockFindComposeFiles.mockReturnValue(
      mockProcess("/etc/docker/compose/myapp/docker-compose.yml\n")
    );

    const { result } = renderHook(() =>
      useDownedStacksScan("/etc/docker/compose", [])
    );

    act(() => { result.current.scan(); });
    await waitFor(() => expect(result.current.scanning).toBe(false));

    act(() => {
      result.current.addStack({ name: "MYAPP", configFile: "/etc/docker/compose/myapp/docker-compose.yml" });
    });

    expect(result.current.downedStacks).toHaveLength(1);
  });

  it("ignores empty lines in find output", async () => {
    const { useDownedStacksScan } = await import("./useDownedStacksScan");
    mockFindComposeFiles.mockReturnValue(mockProcess("\n\n/etc/docker/compose/myapp/docker-compose.yml\n\n"));

    const { result } = renderHook(() =>
      useDownedStacksScan("/etc/docker/compose", [])
    );

    act(() => { result.current.scan(); });
    await waitFor(() => expect(result.current.scanning).toBe(false));

    expect(result.current.downedStacks).toHaveLength(1);
  });

  it("uses name: field from compose file when present", async () => {
    const { useDownedStacksScan } = await import("./useDownedStacksScan");
    mockFindComposeFiles.mockReturnValue(
      mockProcess("/etc/docker/compose/mydir/docker-compose.yml\n")
    );
    mockReadComposeFile.mockImplementation(() =>
      mockProcess("name: custom-project-name\nservices:\n  web:\n    image: nginx\n")
    );

    const { result } = renderHook(() =>
      useDownedStacksScan("/etc/docker/compose", [])
    );

    act(() => { result.current.scan(); });
    await waitFor(() => expect(result.current.scanning).toBe(false));

    expect(result.current.downedStacks).toHaveLength(1);
    expect(result.current.downedStacks[0].name).toBe("custom-project-name");
  });

  it("uses COMPOSE_PROJECT_NAME from .env when no name: field", async () => {
    const { useDownedStacksScan } = await import("./useDownedStacksScan");
    mockFindComposeFiles.mockReturnValue(
      mockProcess("/etc/docker/compose/mydir/docker-compose.yml\n")
    );
    mockReadEnvFile.mockResolvedValue({
      content: "COMPOSE_PROJECT_NAME=env-project\nFOO=bar\n",
      exists: true,
    });

    const { result } = renderHook(() =>
      useDownedStacksScan("/etc/docker/compose", [])
    );

    act(() => { result.current.scan(); });
    await waitFor(() => expect(result.current.scanning).toBe(false));

    expect(result.current.downedStacks).toHaveLength(1);
    expect(result.current.downedStacks[0].name).toBe("env-project");
  });

  it("name: field takes precedence over COMPOSE_PROJECT_NAME in .env", async () => {
    const { useDownedStacksScan } = await import("./useDownedStacksScan");
    mockFindComposeFiles.mockReturnValue(
      mockProcess("/etc/docker/compose/mydir/docker-compose.yml\n")
    );
    mockReadComposeFile.mockImplementation(() =>
      mockProcess("name: compose-name\nservices:\n  web:\n    image: nginx\n")
    );
    mockReadEnvFile.mockResolvedValue({
      content: "COMPOSE_PROJECT_NAME=env-name\n",
      exists: true,
    });

    const { result } = renderHook(() =>
      useDownedStacksScan("/etc/docker/compose", [])
    );

    act(() => { result.current.scan(); });
    await waitFor(() => expect(result.current.scanning).toBe(false));

    expect(result.current.downedStacks[0].name).toBe("compose-name");
  });

  it("falls back to directory name when compose file is unreadable", async () => {
    const { useDownedStacksScan } = await import("./useDownedStacksScan");
    mockFindComposeFiles.mockReturnValue(
      mockProcess("/etc/docker/compose/fallback-dir/docker-compose.yml\n")
    );
    mockReadComposeFile.mockImplementation(() => mockProcess("", "permission denied"));

    const { result } = renderHook(() =>
      useDownedStacksScan("/etc/docker/compose", [])
    );

    act(() => { result.current.scan(); });
    await waitFor(() => expect(result.current.scanning).toBe(false));

    expect(result.current.downedStacks).toHaveLength(1);
    expect(result.current.downedStacks[0].name).toBe("fallback-dir");
  });
});
