import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useEventStream, EVENTS_MAX } from "./useEventStream";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";

const event1 = JSON.stringify({ time: 1, type: "container", action: "start", actor: { ID: "abc", Attributes: { service: "web" } } });
const event2 = JSON.stringify({ time: 2, type: "container", action: "stop", actor: { ID: "abc", Attributes: { service: "web" } } });

beforeEach(() => { mockSpawn.mockReset(); });

describe("useEventStream", () => {
  it("starts with streaming=false and no events", () => {
    const { result } = renderHook(() => useEventStream("myapp"));
    expect(result.current.streaming).toBe(false);
    expect(result.current.events).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("start() sets streaming=true and spawns process", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() => useEventStream("myapp"));
    act(() => { result.current.start(); });
    expect(result.current.streaming).toBe(true);
    expect(mockSpawn).toHaveBeenCalledOnce();
  });

  it("parses JSON event lines", async () => {
    mockSpawn.mockReturnValue(mockProcess(`${event1}\n${event2}\n`));
    const { result } = renderHook(() => useEventStream("myapp"));
    act(() => { result.current.start(); });
    await waitFor(() => expect(result.current.events).toHaveLength(2));
    expect(result.current.events[0].action).toBe("start");
    expect(result.current.events[1].action).toBe("stop");
  });

  it("skips malformed JSON lines", async () => {
    mockSpawn.mockReturnValue(mockProcess(`not-json\n${event1}\n`));
    const { result } = renderHook(() => useEventStream("myapp"));
    act(() => { result.current.start(); });
    await waitFor(() => expect(result.current.events).toHaveLength(1));
  });

  it("sets streaming=false when process resolves", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() => useEventStream("myapp"));
    act(() => { result.current.start(); });
    await waitFor(() => expect(result.current.streaming).toBe(false));
  });

  it("sets error and streaming=false when process rejects", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "stream failed"));
    const { result } = renderHook(() => useEventStream("myapp"));
    act(() => { result.current.start(); });
    await waitFor(() => expect(result.current.error).toBe("stream failed"));
    expect(result.current.streaming).toBe(false);
  });

  it("stop() closes process and sets streaming=false", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() => useEventStream("myapp"));
    act(() => { result.current.start(); });
    act(() => { result.current.stop(); });
    expect(result.current.streaming).toBe(false);
  });

  it("clear() empties events", async () => {
    mockSpawn.mockReturnValue(mockProcess(`${event1}\n`));
    const { result } = renderHook(() => useEventStream("myapp"));
    act(() => { result.current.start(); });
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    act(() => { result.current.clear(); });
    expect(result.current.events).toEqual([]);
  });

  it("caps events at EVENTS_MAX", async () => {
    const lines = Array.from({ length: EVENTS_MAX + 10 }, (_, i) =>
      JSON.stringify({ time: i, type: "container", action: "start", actor: { ID: "x", Attributes: {} } }),
    ).join("\n") + "\n";
    mockSpawn.mockReturnValue(mockProcess(lines));
    const { result } = renderHook(() => useEventStream("myapp"));
    act(() => { result.current.start(); });
    await waitFor(() => expect(result.current.events.length).toBe(EVENTS_MAX));
  });

  it("spawns docker compose events --json without --since/--until flags", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() => useEventStream("myapp"));
    act(() => { result.current.start(); });
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("events");
    expect(args).toContain("--json");
    expect(args).not.toContain("--since");
    expect(args).not.toContain("--until");
  });

  it("start() resets previous events before spawning", async () => {
    mockSpawn.mockReturnValue(mockProcess(`${event1}\n`));
    const { result } = renderHook(() => useEventStream("myapp"));
    act(() => { result.current.start(); });
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    mockSpawn.mockReturnValue(mockProcess(""));
    act(() => { result.current.start(); });
    expect(result.current.events).toHaveLength(0);
  });
});
