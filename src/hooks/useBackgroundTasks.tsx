import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { stripAnsi } from "../lib/pullParser";

export type BackgroundTaskStatus = "pending" | "running" | "success" | "error" | "stopped";

export interface BackgroundTask {
  id: number;
  stackName: string;
  action: string;
  label: string;
  status: BackgroundTaskStatus;
  errorMsg?: string;
  lines: string[];
  createdAt: number;
}

// Mirrors the `launch` callback pattern used by useAsyncStream: the starter is
// handed a `launch` function to call once it has produced the CockpitProcess
// (e.g. after resolving superuser). This is deliberate rather than simply
// returning/awaiting the process, since CockpitProcess is itself thenable —
// `Promise.resolve()`-ing it (or returning it from an async function) would
// silently flatten to its *resolved value*, not the process handle.
//
// The starter may return a Promise (its own setup work, e.g. resolving
// superuser) — if that promise rejects *before* `launch` is ever called, the
// task is reported as failed. Without this, a setup failure would otherwise
// leave the task stuck at "running" forever, since nothing would ever settle it.
type TaskStarter = (launch: (proc: CockpitProcess) => void) => void | Promise<void>;

export interface BackgroundTasksContextValue {
  tasks: BackgroundTask[];
  /**
   * Enqueues a task. `start` is only invoked once the task reaches the front of the queue.
   * `onSuccess`, if given, fires once the task settles with status "success".
   */
  enqueue: (stackName: string, action: string, label: string, start: TaskStarter, onSuccess?: () => void) => void;
  /**
   * Takes over a process that is already running (detached from a modal's stream),
   * instead of launching the command again. Relaunching is not safe for every
   * command: a second `compose up` collides with containers the first one already
   * created (#319). The task starts as "running" with `lines` as its log so far;
   * `pending` is output after the last newline that has not become a line yet.
   * It bypasses the queue, since the work is already underway.
   */
  adopt: (stackName: string, action: string, label: string, proc: CockpitProcess, lines: string[], pending: string, onSuccess?: () => void) => void;
  /** Closes the underlying process of a running task (or marks a not-yet-started one to stop as soon as it starts). */
  stop: (id: number) => void;
  /** Removes a task from the list. No-op while the task is still running. */
  remove: (id: number) => void;
  /**
   * Drops every not-yet-started task and returns how many were removed.
   *
   * Pending tasks hold a closure that calls into `compose()`/`cli()`, which read
   * the *live* docker/podman runtime at execution time, not at enqueue time —
   * so a task queued before a runtime switch would otherwise run against the
   * wrong backend once it finally starts. Already-running or finished tasks
   * already dispatched their command under the correct runtime, so they're safe.
   */
  clearPending: () => number;
}

const BackgroundTasksContext = createContext<BackgroundTasksContextValue | null>(null);

const NOOP_BACKGROUND_TASKS: BackgroundTasksContextValue = {
  tasks: [],
  enqueue: () => {},
  adopt: () => {},
  stop: () => {},
  remove: () => {},
  clearPending: () => 0,
};

/**
 * Provides a single-runner FIFO background task queue to the component tree.
 *
 * Tasks are enqueued as a `start` factory rather than an already-spawned
 * process, so a task removed while still pending never touches `cockpit.spawn`.
 * Only one task runs at a time to avoid concurrent side effects on the same stacks.
 */
export function BackgroundTasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const countersRef = useRef(0);
  const startersRef = useRef(new Map<number, TaskStarter>());
  const onSuccessRef = useRef(new Map<number, () => void>());
  const procsRef = useRef(new Map<number, CockpitProcess>());
  const stoppedRef = useRef(new Set<number>());
  const bufsRef = useRef(new Map<number, string>());
  const runningRef = useRef(false);
  const settledRef = useRef(new Set<number>());

  // Streams a task's process into its log and settles the task when it exits.
  // Shared by queued tasks and adopted ones; `onSettled` lets the queue release
  // its single runner slot, which an adopted task never held.
  const supervise = useCallback((id: number, onSettled: () => void) => {
    const finish = (status: "success" | "error" | "stopped", errorMsg?: string) => {
      if (settledRef.current.has(id)) return;
      settledRef.current.add(id);
      setTasks(prev => prev.map(t => (t.id === id ? { ...t, status, errorMsg } : t)));
      if (status === "success") onSuccessRef.current.get(id)?.();
      procsRef.current.delete(id);
      startersRef.current.delete(id);
      onSuccessRef.current.delete(id);
      stoppedRef.current.delete(id);
      bufsRef.current.delete(id);
      settledRef.current.delete(id);
      onSettled();
    };

    const appendLine = (chunk: string) => {
      const clean = stripAnsi(chunk);
      const buffered = (bufsRef.current.get(id) ?? "") + clean;
      const parts = buffered.split("\n");
      bufsRef.current.set(id, parts.pop() ?? "");
      const newLines = parts.map(l => l.split("\r").pop() ?? "").filter(l => l.trim() !== "");
      if (newLines.length > 0) {
        setTasks(prev => prev.map(t => (t.id === id ? { ...t, lines: [...t.lines, ...newLines] } : t)));
      }
    };

    const track = (proc: CockpitProcess) => {
      proc.stream(appendLine);
      proc
        .then(() => finish(stoppedRef.current.has(id) ? "stopped" : "success"))
        .catch((ex: unknown) => finish(
          stoppedRef.current.has(id) ? "stopped" : "error",
          ex instanceof Error ? ex.message : String(ex),
        ));
    };

    return { finish, track };
  }, []);

  // Picks the next pending task once the previous one finishes (or on enqueue).
  // Re-fires whenever `tasks` changes, including the status updates this same
  // effect makes — that's what lets it chain through the whole queue.
  useEffect(() => {
    if (runningRef.current) return;
    const next = tasks.find(t => t.status === "pending");
    if (!next) return;

    runningRef.current = true;
    setTasks(prev => prev.map(t => (t.id === next.id ? { ...t, status: "running" } : t)));

    const starter = startersRef.current.get(next.id);
    const { finish, track } = supervise(next.id, () => { runningRef.current = false; });

    const setupResult = starter?.(proc => {
      procsRef.current.set(next.id, proc);
      if (stoppedRef.current.has(next.id)) { proc.close(); return; }
      track(proc);
    });

    // If the starter's own setup work (before `launch` is called) rejects,
    // the task must still be settled — otherwise it's stuck at "running" forever.
    if (setupResult && typeof setupResult.then === "function") {
      setupResult.catch((ex: unknown) => finish("error", ex instanceof Error ? ex.message : String(ex)));
    }
  }, [tasks, supervise]);

  const enqueue = useCallback((stackName: string, action: string, label: string, start: TaskStarter, onSuccess?: () => void) => {
    const id = ++countersRef.current;
    startersRef.current.set(id, start);
    if (onSuccess) onSuccessRef.current.set(id, onSuccess);
    setTasks(prev => [...prev, { id, stackName, action, label, status: "pending", lines: [], createdAt: Date.now() }]);
  }, []);

  const adopt = useCallback((
    stackName: string, action: string, label: string,
    proc: CockpitProcess, lines: string[], pending: string, onSuccess?: () => void,
  ) => {
    const id = ++countersRef.current;
    if (onSuccess) onSuccessRef.current.set(id, onSuccess);
    procsRef.current.set(id, proc);
    bufsRef.current.set(id, stripAnsi(pending));
    setTasks(prev => [...prev, { id, stackName, action, label, status: "running", lines, createdAt: Date.now() }]);
    supervise(id, () => {}).track(proc);
  }, [supervise]);

  const stop = useCallback((id: number) => {
    stoppedRef.current.add(id);
    procsRef.current.get(id)?.close();
  }, []);

  const remove = useCallback((id: number) => {
    setTasks(prev => prev.filter(t => !(t.id === id && t.status !== "running")));
    startersRef.current.delete(id);
    onSuccessRef.current.delete(id);
  }, []);

  const clearPending = useCallback((): number => {
    const pendingIds = tasks.filter(t => t.status === "pending").map(t => t.id);
    if (pendingIds.length === 0) return 0;
    setTasks(prev => prev.filter(t => t.status !== "pending"));
    for (const id of pendingIds) {
      startersRef.current.delete(id);
      onSuccessRef.current.delete(id);
    }
    return pendingIds.length;
  }, [tasks]);

  return (
    <BackgroundTasksContext.Provider value={{ tasks, enqueue, adopt, stop, remove, clearPending }}>
      {children}
    </BackgroundTasksContext.Provider>
  );
}

/**
 * Returns the nearest {@link BackgroundTasksProvider}'s context value.
 *
 * Falls back to a no-op implementation when called outside a provider, so
 * it is safe to use in unit tests without a provider wrapper.
 */
export function useBackgroundTasks(): BackgroundTasksContextValue {
  return useContext(BackgroundTasksContext) ?? NOOP_BACKGROUND_TASKS;
}
