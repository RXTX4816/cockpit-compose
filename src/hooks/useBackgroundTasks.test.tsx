import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { BackgroundTasksProvider, useBackgroundTasks } from "./useBackgroundTasks";
import type { ReactNode } from "react";

function wrapper({ children }: { children: ReactNode }) {
  return <BackgroundTasksProvider>{children}</BackgroundTasksProvider>;
}

function fakeProcess(behavior: "resolve" | "reject" = "resolve"): CockpitProcess {
  let resolveFn: (() => void) | undefined;
  let rejectFn: ((err: Error) => void) | undefined;
  const p = new Promise<string>((resolve, reject) => {
    resolveFn = () => resolve("");
    rejectFn = reject;
  });
  const close = vi.fn(() => rejectFn?.(new Error("terminated")));
  if (behavior === "resolve") queueMicrotask(() => resolveFn?.());
  if (behavior === "reject") queueMicrotask(() => rejectFn?.(new Error("boom")));
  return Object.assign(p, {
    stream: () => p as CockpitProcess,
    close,
    input: vi.fn(),
    wait: () => p,
  }) as unknown as CockpitProcess;
}

describe("useBackgroundTasks", () => {
  it("starts empty and the noop fallback outside a provider is safe to call", () => {
    const { result } = renderHook(() => useBackgroundTasks());
    expect(result.current.tasks).toEqual([]);
    expect(() => result.current.enqueue("a", "up", "Up a", launch => launch(fakeProcess()))).not.toThrow();
  });

  it("enqueue adds a pending task, which transitions to running then success", async () => {
    const { result } = renderHook(() => useBackgroundTasks(), { wrapper });
    const start = vi.fn((launch: (p: CockpitProcess) => void) => launch(fakeProcess("resolve")));

    act(() => { result.current.enqueue("myapp", "up", "Up myapp", start); });
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].status).toBe("running");

    await waitFor(() => expect(result.current.tasks[0].status).toBe("success"));
    expect(start).toHaveBeenCalledOnce();
  });

  it("calls the optional onSuccess callback once the task settles as success, but not for a failed task", async () => {
    const { result } = renderHook(() => useBackgroundTasks(), { wrapper });
    const onSuccess = vi.fn();
    act(() => {
      result.current.enqueue("myapp", "down", "Down myapp", launch => launch(fakeProcess("resolve")), onSuccess);
    });

    await waitFor(() => expect(result.current.tasks[0].status).toBe("success"));
    expect(onSuccess).toHaveBeenCalledOnce();

    onSuccess.mockClear();
    act(() => {
      result.current.enqueue("otherapp", "down", "Down otherapp", launch => launch(fakeProcess("reject")), onSuccess);
    });
    await waitFor(() => expect(result.current.tasks[1].status).toBe("error"));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("a failed task ends in 'error' status with the error message", async () => {
    const { result } = renderHook(() => useBackgroundTasks(), { wrapper });
    act(() => { result.current.enqueue("myapp", "up", "Up myapp", launch => launch(fakeProcess("reject"))); });

    await waitFor(() => expect(result.current.tasks[0].status).toBe("error"));
    expect(result.current.tasks[0].errorMsg).toBe("boom");
  });

  it("runs tasks one at a time (single runner)", async () => {
    const { result } = renderHook(() => useBackgroundTasks(), { wrapper });
    const proc1 = fakeProcess("resolve");
    const proc2 = fakeProcess("resolve");
    const start1 = vi.fn((launch: (p: CockpitProcess) => void) => launch(proc1));
    const start2 = vi.fn((launch: (p: CockpitProcess) => void) => launch(proc2));

    act(() => {
      result.current.enqueue("a", "up", "Up a", start1);
      result.current.enqueue("b", "up", "Up b", start2);
    });

    expect(result.current.tasks[0].status).toBe("running");
    expect(result.current.tasks[1].status).toBe("pending");
    expect(start2).not.toHaveBeenCalled();

    await waitFor(() => expect(result.current.tasks[0].status).toBe("success"));
    await waitFor(() => expect(result.current.tasks[1].status).not.toBe("pending"));
    expect(start2).toHaveBeenCalledOnce();
  });

  it("stop() marks the task 'stopped' once its process settles, and closes the process", async () => {
    const { result } = renderHook(() => useBackgroundTasks(), { wrapper });
    const proc = fakeProcess("reject");
    const start = vi.fn((launch: (p: CockpitProcess) => void) => launch(proc));

    act(() => { result.current.enqueue("myapp", "up", "Up myapp", start); });
    const id = result.current.tasks[0].id;
    act(() => { result.current.stop(id); });

    await waitFor(() => expect(result.current.tasks[0].status).toBe("stopped"));
    expect(proc.close).toHaveBeenCalled();
  });

  it("remove() removes a finished task, but not a running one", async () => {
    const { result } = renderHook(() => useBackgroundTasks(), { wrapper });
    act(() => { result.current.enqueue("myapp", "up", "Up myapp", launch => launch(fakeProcess("resolve"))); });
    const id = result.current.tasks[0].id;

    act(() => { result.current.remove(id); });
    expect(result.current.tasks).toHaveLength(1); // still running, remove is a no-op

    await waitFor(() => expect(result.current.tasks[0].status).toBe("success"));
    act(() => { result.current.remove(id); });
    expect(result.current.tasks).toHaveLength(0);
  });

  it("a starter whose setup work rejects before calling launch ends in 'error', not stuck at 'running' forever", async () => {
    // Regression test: e.g. readAllProfiles()/composeFileSuperuser() throwing before launch()
    // is ever called must not leave the task permanently stuck at "running".
    const { result } = renderHook(() => useBackgroundTasks(), { wrapper });
    const start = vi.fn(() => Promise.reject(new Error("setup failed")));

    act(() => { result.current.enqueue("myapp", "pull", "Pull myapp", start); });
    expect(result.current.tasks[0].status).toBe("running");

    await waitFor(() => expect(result.current.tasks[0].status).toBe("error"));
    expect(result.current.tasks[0].errorMsg).toBe("setup failed");
  });

  it("accumulates streamed output into task.lines", async () => {
    const { result } = renderHook(() => useBackgroundTasks(), { wrapper });
    let streamCb: ((data: string) => void) | undefined;
    const proc = fakeProcess("resolve");
    proc.stream = (cb: (data: string) => void) => { streamCb = cb; return proc; };

    act(() => { result.current.enqueue("myapp", "up", "Up myapp", launch => launch(proc)); });
    act(() => { streamCb?.("Container myapp-web-1  Starting\n"); });

    await waitFor(() => expect(result.current.tasks[0].lines).toEqual(["Container myapp-web-1  Starting"]));
  });

  it("enqueueing a pending (not-yet-started) task and removing it never invokes its starter", () => {
    const { result } = renderHook(() => useBackgroundTasks(), { wrapper });
    const start1 = vi.fn((launch: (p: CockpitProcess) => void) => launch(fakeProcess("resolve")));
    const start2 = vi.fn();

    act(() => {
      result.current.enqueue("a", "up", "Up a", start1); // occupies the single runner slot
      result.current.enqueue("b", "up", "Up b", start2); // stays pending
    });
    const pendingId = result.current.tasks[1].id;
    act(() => { result.current.remove(pendingId); });

    expect(result.current.tasks).toHaveLength(1);
    expect(start2).not.toHaveBeenCalled();
  });

  describe("clearPending", () => {
    it("removes only pending tasks, leaving the running one alone, and returns the removed count", () => {
      const { result } = renderHook(() => useBackgroundTasks(), { wrapper });
      const start2 = vi.fn();
      const start3 = vi.fn();

      act(() => {
        result.current.enqueue("a", "up", "Up a", launch => launch(fakeProcess("resolve"))); // becomes running
        result.current.enqueue("b", "up", "Up b", start2); // stays pending
        result.current.enqueue("c", "up", "Up c", start3); // stays pending
      });
      expect(result.current.tasks[0].status).toBe("running");
      expect(result.current.tasks[1].status).toBe("pending");
      expect(result.current.tasks[2].status).toBe("pending");

      let removedCount = -1;
      act(() => { removedCount = result.current.clearPending(); });

      expect(removedCount).toBe(2);
      expect(result.current.tasks).toHaveLength(1);
      expect(result.current.tasks[0].stackName).toBe("a");
      expect(start2).not.toHaveBeenCalled();
      expect(start3).not.toHaveBeenCalled();
    });

    it("does not affect a task that has already started running by the time it's called", async () => {
      const { result } = renderHook(() => useBackgroundTasks(), { wrapper });
      act(() => { result.current.enqueue("a", "up", "Up a", launch => launch(fakeProcess("resolve"))); });
      await waitFor(() => expect(result.current.tasks[0].status).toBe("success"));

      const removedCount = result.current.clearPending();
      expect(removedCount).toBe(0);
      expect(result.current.tasks).toHaveLength(1);
    });

    it("returns 0 and is a no-op when there are no tasks at all (noop fallback outside a provider)", () => {
      const { result } = renderHook(() => useBackgroundTasks());
      expect(result.current.clearPending()).toBe(0);
    });
  });
});
