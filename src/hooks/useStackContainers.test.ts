import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useStackContainers } from "./useStackContainers";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";

// Lazy factory: proc is created when mockSpawn is called, so queueMicrotask fires
// AFTER proc.stream() is registered — avoiding the race where the microtask fires
// before the stream callback is set.
const lazy = (data: string, err?: string) => () => mockProcess(data, err);

beforeEach(() => { mockSpawn.mockReset(); });

const composeYaml = `
services:
  web:
    image: nginx
  db:
    image: postgres
`;

const runningContainersJson = JSON.stringify([
  { ID: "abc", Name: "myapp_web_1", Image: "nginx", State: "running", Status: "Up 1h", Ports: "", Service: "web" },
]);

describe("useStackContainers", () => {
  it("starts with empty containers and loading=false", () => {
    const { result } = renderHook(() =>
      useStackContainers("myapp", ["/path/compose.yml"], "running"),
    );
    expect(result.current.containers).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("load() fetches running containers and merges with compose services", async () => {
    mockSpawn
      .mockImplementationOnce(lazy(runningContainersJson))
      .mockImplementationOnce(lazy(composeYaml));

    const { result } = renderHook(() =>
      useStackContainers("myapp", ["/path/compose.yml"], "running"),
    );
    void act(() => { void result.current.load(); });
    await waitFor(() => expect(result.current.containers).toHaveLength(2));

    const web = result.current.containers.find(c => c.Service === "web");
    expect(web?.State).toBe("running");
    const db = result.current.containers.find(c => c.Service === "db");
    expect(db?.State).toBe("down");
  });

  it("load() falls back to compose file on container list error", async () => {
    mockSpawn
      .mockImplementationOnce(lazy("", "docker error"))
      .mockImplementationOnce(lazy(composeYaml));

    const { result } = renderHook(() =>
      useStackContainers("myapp", ["/path/compose.yml"], "stopped"),
    );
    void act(() => { void result.current.load(); });
    await waitFor(() => expect(result.current.containers).toHaveLength(2));
    expect(result.current.containers.every(c => c.State === "down")).toBe(true);
  });

  it("load() uses cached service names if both fetches fail", async () => {
    mockSpawn
      .mockImplementationOnce(lazy(runningContainersJson))
      .mockImplementationOnce(lazy(composeYaml));

    const { result } = renderHook(() =>
      useStackContainers("myapp", ["/path/compose.yml"], "running"),
    );
    void act(() => { void result.current.load(); });
    await waitFor(() => expect(result.current.containers).toHaveLength(2));

    // Second load — both fail; cached names should be used
    mockSpawn
      .mockImplementationOnce(lazy("", "error"))
      .mockImplementationOnce(lazy("", "error"));
    void act(() => { void result.current.load(); });
    await waitFor(() => expect(result.current.containers).toHaveLength(2));
  });

  it("clear() empties containers", async () => {
    mockSpawn
      .mockImplementationOnce(lazy(runningContainersJson))
      .mockImplementationOnce(lazy(composeYaml));

    const { result } = renderHook(() =>
      useStackContainers("myapp", ["/path/compose.yml"], "running"),
    );
    void act(() => { void result.current.load(); });
    await waitFor(() => expect(result.current.containers).toHaveLength(2));

    act(() => { result.current.clear(); });
    expect(result.current.containers).toEqual([]);
  });

  it("keeps containers visible when status changes (avoids flash of empty content)", async () => {
    mockSpawn
      .mockImplementationOnce(lazy(runningContainersJson))
      .mockImplementationOnce(lazy(composeYaml));

    let status: "running" | "stopped" = "running";
    const { result, rerender } = renderHook(() =>
      useStackContainers("myapp", ["/path/compose.yml"], status),
    );
    void act(() => { void result.current.load(); });
    await waitFor(() => expect(result.current.containers).toHaveLength(2));

    status = "stopped";
    rerender();
    // Containers stay visible until the next load completes — no flash of empty content.
    expect(result.current.containers).toHaveLength(2);
  });

  it("does not clear containers when status re-renders with same value", async () => {
    mockSpawn
      .mockImplementationOnce(lazy(runningContainersJson))
      .mockImplementationOnce(lazy(composeYaml));

    const { result, rerender } = renderHook(() =>
      useStackContainers("myapp", ["/path/compose.yml"], "running"),
    );
    void act(() => { void result.current.load(); });
    await waitFor(() => expect(result.current.containers).toHaveLength(2));

    rerender();
    expect(result.current.containers).toHaveLength(2);
  });

  it("returns empty containers when both fetches fail on first load", async () => {
    mockSpawn
      .mockImplementationOnce(lazy("", "error"))
      .mockImplementationOnce(lazy("", "error"));

    const { result } = renderHook(() =>
      useStackContainers("myapp", ["/path/compose.yml"], "running"),
    );
    void act(() => { void result.current.load(); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.containers).toEqual([]);
  });

  it("deduplicates service names across multiple config files", async () => {
    const overlappingYaml = `
services:
  web:
    image: nginx
  db:
    image: postgres
`;
    mockSpawn
      .mockImplementationOnce(lazy("[]"))
      .mockImplementationOnce(lazy(overlappingYaml))
      .mockImplementationOnce(lazy(overlappingYaml));

    const { result } = renderHook(() =>
      useStackContainers("myapp", ["/path/compose.yml", "/path/override.yml"], "running"),
    );
    void act(() => { void result.current.load(); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.containers).toHaveLength(2);
  });
});
