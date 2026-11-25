import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { ComposeContainer, ContainerStats } from "../api";

const listAll = vi.fn();
const statsFor = vi.fn();
vi.mock("../api", async orig => ({
  ...(await orig<typeof import("../api")>()),
  listAllStackContainers: (...a: unknown[]) => listAll(...a),
  getAllContainerStats: (...a: unknown[]) => statsFor(...a),
}));

import { StacksLiveProvider, useStackLive } from "./useStacksLive";
import { useContainerStats } from "./useContainerStats";
import { mockSpawn } from "../test/setup";

const web = (id: string): ComposeContainer => ({ ID: id, Name: id, Image: "i", State: "running", Status: "Up", Ports: "0.0.0.0:8080->80/tcp", Service: "web" });
const st = (id: string): ContainerStats => ({ id, name: id, cpu: "1%", mem: "10MiB / 1GiB", memPerc: "", net: "", block: "" });

beforeEach(() => { listAll.mockReset(); statsFor.mockReset(); });

const wrap = (enabled = true) => {
  function Wrapper({ children }: { children: ReactNode }) {
    return <StacksLiveProvider enabled={enabled} intervalMs={60_000}>{children}</StacksLiveProvider>;
  }
  return Wrapper;
};

describe("StacksLiveProvider", () => {
  it("asks the engine once for every stack and hands each its own ports and stats", async () => {
    listAll.mockResolvedValue(new Map([["a", [web("a1")]], ["b", [web("b1"), web("b2")]]]));
    statsFor.mockResolvedValue([st("a1"), st("b1"), st("b2")]);
    const { result } = renderHook(() => ({ a: useStackLive("a"), b: useStackLive("b") }), { wrapper: wrap() });
    await waitFor(() => expect(result.current.b?.stats?.cpu).toBeCloseTo(2));
    expect(result.current.a?.stats?.cpu).toBeCloseTo(1);
    expect(result.current.a?.ports[0].label).toBe("8080→80");
    expect(listAll).toHaveBeenCalledTimes(1);
    expect(statsFor).toHaveBeenCalledTimes(1);
    expect(statsFor.mock.calls[0][0].sort()).toEqual(["a1", "b1", "b2"]);
  });

  it("gives a stack with no containers empty data rather than nothing", async () => {
    listAll.mockResolvedValue(new Map([["a", [web("a1")]]]));
    statsFor.mockResolvedValue([st("a1")]);
    const { result } = renderHook(() => useStackLive("idle"), { wrapper: wrap() });
    await waitFor(() => expect(result.current).toEqual({ ports: [], stats: null }));
  });

  it("gives nothing when the engine cannot be asked in one go, so the caller polls for itself", async () => {
    listAll.mockRejectedValue(new Error("no socket"));
    const { result } = renderHook(() => useStackLive("a"), { wrapper: wrap() });
    await waitFor(() => expect(listAll).toHaveBeenCalled());
    expect(result.current).toBeUndefined();
  });

  it("does not poll while disabled", async () => {
    renderHook(() => useStackLive("a"), { wrapper: wrap(false) });
    await Promise.resolve();
    expect(listAll).not.toHaveBeenCalled();
  });

  it("is undefined outside a provider", () => {
    const { result } = renderHook(() => useStackLive("a"));
    expect(result.current).toBeUndefined();
  });
});

describe("useContainerStats under the provider", () => {
  it("takes its data from the shared read and spawns nothing itself", async () => {
    mockSpawn.mockReset();
    listAll.mockResolvedValue(new Map([["myapp", [web("abc123")]]]));
    statsFor.mockResolvedValue([st("abc123")]);
    const { result } = renderHook(() => useContainerStats("myapp", "running"), { wrapper: wrap() });
    await waitFor(() => expect(result.current.stats?.cpu).toBeCloseTo(1));
    expect(result.current.ports[0]?.label).toBe("8080→80");
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(listAll).toHaveBeenCalledTimes(1);
  });

  it("shows nothing for a stopped stack even when the shared read lists containers for it", async () => {
    listAll.mockResolvedValue(new Map([["myapp", [web("abc123")]]]));
    statsFor.mockResolvedValue([st("abc123")]);
    const { result } = renderHook(() => useContainerStats("myapp", "stopped"), { wrapper: wrap() });
    await waitFor(() => expect(listAll).toHaveBeenCalled());
    expect(result.current).toEqual({ ports: [], stats: null });
  });
});
