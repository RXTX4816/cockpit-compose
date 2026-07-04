import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInputHistory } from "./useInputHistory";

beforeEach(() => {
  localStorage.clear();
});

describe("useInputHistory", () => {
  it("starts empty when nothing is stored", () => {
    const { result } = renderHook(() => useInputHistory("run-command"));
    expect(result.current.history).toEqual([]);
  });

  it("record() adds a value to the front of history", () => {
    const { result } = renderHook(() => useInputHistory("run-command"));
    act(() => { result.current.record("echo hello"); });
    expect(result.current.history).toEqual(["echo hello"]);
  });

  it("newer entries appear before older ones", () => {
    const { result } = renderHook(() => useInputHistory("run-command"));
    act(() => { result.current.record("first"); });
    act(() => { result.current.record("second"); });
    expect(result.current.history).toEqual(["second", "first"]);
  });

  it("re-recording an existing value moves it to the front instead of duplicating it", () => {
    const { result } = renderHook(() => useInputHistory("run-command"));
    act(() => { result.current.record("a"); });
    act(() => { result.current.record("b"); });
    act(() => { result.current.record("a"); });
    expect(result.current.history).toEqual(["a", "b"]);
  });

  it("ignores blank/whitespace-only values", () => {
    const { result } = renderHook(() => useInputHistory("run-command"));
    act(() => { result.current.record("   "); });
    expect(result.current.history).toEqual([]);
  });

  it("trims values before storing", () => {
    const { result } = renderHook(() => useInputHistory("run-command"));
    act(() => { result.current.record("  echo hi  "); });
    expect(result.current.history).toEqual(["echo hi"]);
  });

  it("caps history at the given max, dropping the oldest entries", () => {
    const { result } = renderHook(() => useInputHistory("run-command", 2));
    act(() => { result.current.record("a"); });
    act(() => { result.current.record("b"); });
    act(() => { result.current.record("c"); });
    expect(result.current.history).toEqual(["c", "b"]);
  });

  it("persists to localStorage under a namespaced key and is read back by a new hook instance", () => {
    const { result } = renderHook(() => useInputHistory("run-command"));
    act(() => { result.current.record("echo hi"); });

    expect(JSON.parse(localStorage.getItem("cockpit-compose:history:run-command")!)).toEqual(["echo hi"]);

    const { result: result2 } = renderHook(() => useInputHistory("run-command"));
    expect(result2.current.history).toEqual(["echo hi"]);
  });

  it("keeps separate histories for different storage keys", () => {
    const { result: runResult } = renderHook(() => useInputHistory("run-command"));
    const { result: execResult } = renderHook(() => useInputHistory("exec-command"));
    act(() => { runResult.current.record("run value"); });
    expect(runResult.current.history).toEqual(["run value"]);
    expect(execResult.current.history).toEqual([]);
  });
});
