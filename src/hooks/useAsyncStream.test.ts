import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAsyncStream } from "./useAsyncStream";
import { mockProcess } from "../test/helpers";
import { mockSpawn } from "../test/setup";

beforeEach(() => { mockSpawn.mockReset(); });

describe("useAsyncStream", () => {
  it("starts with empty lines, done=false, failed=false", () => {
    const { result } = renderHook(() =>
      useAsyncStream(launch => { launch(mockProcess("")); return Promise.resolve(); }, [])
    );
    expect(result.current.lines).toEqual([]);
    expect(result.current.done).toBe(false);
    expect(result.current.failed).toBe(false);
  });

  it("accumulates streamed output lines", async () => {
    const { result } = renderHook(() =>
      useAsyncStream(launch => { launch(mockProcess("Pulling image...\nStep 1/2\n")); return Promise.resolve(); }, [])
    );
    await waitFor(() => expect(result.current.lines.length).toBeGreaterThan(0));
    const texts = result.current.lines.map(l => l.text);
    expect(texts).toContain("Pulling image...");
    expect(texts).toContain("Step 1/2");
  });

  it("sets done=true on success", async () => {
    const { result } = renderHook(() =>
      useAsyncStream(launch => { launch(mockProcess("done\n")); return Promise.resolve(); }, [])
    );
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.failed).toBe(false);
  });

  it("sets done=true and failed=true on error", async () => {
    const { result } = renderHook(() =>
      useAsyncStream(launch => { launch(mockProcess("", "something went wrong")); return Promise.resolve(); }, [])
    );
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.failed).toBe(true);
    expect(result.current.errorMsg).toBe("something went wrong");
  });

  it("sets failed=true when startProcess promise rejects", async () => {
    const { result } = renderHook(() =>
      useAsyncStream(() => Promise.reject(new Error("setup failed")), [])
    );
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.errorMsg).toBe("setup failed");
  });

  it("cancel closes the process", async () => {
    const closeFn = vi.fn();
    const proc = Object.assign(
      new Promise<string>(() => {}),
      { stream: vi.fn().mockReturnThis(), close: closeFn, input: vi.fn() },
    ) as CockpitProcess;
    const { result } = renderHook(() =>
      useAsyncStream(launch => { launch(proc); return Promise.resolve(); }, [])
    );
    await act(async () => {});
    act(() => { result.current.cancel(); });
    expect(closeFn).toHaveBeenCalled();
  });

  it("uses String(ex) for non-Error proc rejection", async () => {
    const proc = Object.assign(
      new Promise<string>((_, reject) => queueMicrotask(() => reject("plain string error"))),
      { stream: vi.fn().mockReturnThis(), close: vi.fn(), input: vi.fn() },
    ) as CockpitProcess;
    const { result } = renderHook(() =>
      useAsyncStream(launch => { launch(proc); return Promise.resolve(); }, [])
    );
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.errorMsg).toBe("plain string error");
  });

  it("uses String(ex) for non-Error startProcess rejection", async () => {
    const { result } = renderHook(() =>
      useAsyncStream(() => Promise.reject("setup string error"), [])
    );
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.errorMsg).toBe("setup string error");
  });

  it("does not update state after unmount (cancelled proc error)", async () => {
    const closeFn = vi.fn();
    let triggerReject!: (e: unknown) => void;
    const proc = Object.assign(
      new Promise<string>((_, reject) => { triggerReject = reject; }),
      { stream: vi.fn().mockReturnThis(), close: closeFn, input: vi.fn() },
    ) as CockpitProcess;
    const { result, unmount } = renderHook(() =>
      useAsyncStream(launch => { launch(proc); return Promise.resolve(); }, [])
    );
    await act(async () => {});
    unmount();
    await act(async () => { triggerReject(new Error("error after unmount")); });
    // Should not have set failed=true since component was unmounted
    expect(result.current.failed).toBe(false);
  });

  it("resets state when deps change", async () => {
    let dep = 1;
    let resolveProc!: () => void;
    const makeNeverEndingProc = () => {
      const p = new Promise<string>(resolve => { resolveProc = () => resolve(""); });
      return Object.assign(p, {
        stream: vi.fn().mockReturnThis(),
        close: vi.fn(),
        input: vi.fn(),
      }) as CockpitProcess;
    };

    const { result, rerender } = renderHook(() =>
      useAsyncStream(launch => { launch(makeNeverEndingProc()); return Promise.resolve(); }, [dep])
    );
    await act(async () => { resolveProc(); });
    await waitFor(() => expect(result.current.done).toBe(true));

    dep = 2;
    act(() => { rerender(); });
    expect(result.current.done).toBe(false);
  });
});
