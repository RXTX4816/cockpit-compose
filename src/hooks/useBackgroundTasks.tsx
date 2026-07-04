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
  /** Enqueues a task. `start` is only invoked once the task reaches the front of the queue. */
  enqueue: (stackName: string, action: string, label: string, start: TaskStarter) => void;
  /** Closes the underlying process of a running task (or marks a not-yet-started one to stop as soon as it starts). */
  stop: (id: number) => void;
  /** Removes a task from the list. No-op while the task is still running. */
  remove: (id: number) => void;
}

const BackgroundTasksContext = createContext<BackgroundTasksContextValue | null>(null);

const NOOP_BACKGROUND_TASKS: BackgroundTasksContextValue = {
  tasks: [],
  enqueue: () => {},
  stop: () => {},
  remove: () => {},
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
  const procsRef = useRef(new Map<number, CockpitProcess>());
  const stoppedRef = useRef(new Set<number>());
  const bufsRef = useRef(new Map<number, string>());
  const runningRef = useRef(false);
  const settledRef = useRef(new Set<number>());

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
    const finish = (status: "success" | "error" | "stopped", errorMsg?: string) => {
      if (settledRef.current.has(next.id)) return;
      settledRef.current.add(next.id);
      setTasks(prev => prev.map(t => (t.id === next.id ? { ...t, status, errorMsg } : t)));
      procsRef.current.delete(next.id);
      startersRef.current.delete(next.id);
      stoppedRef.current.delete(next.id);
      bufsRef.current.delete(next.id);
      settledRef.current.delete(next.id);
      runningRef.current = false;
    };

    const appendLine = (chunk: string) => {
      const clean = stripAnsi(chunk);
      const buffered = (bufsRef.current.get(next.id) ?? "") + clean;
      const parts = buffered.split("\n");
      bufsRef.current.set(next.id, parts.pop() ?? "");
      const newLines = parts.map(l => l.split("\r").pop() ?? "").filter(l => l.trim() !== "");
      if (newLines.length > 0) {
        setTasks(prev => prev.map(t => (t.id === next.id ? { ...t, lines: [...t.lines, ...newLines] } : t)));
      }
    };

    const setupResult = starter?.(proc => {
      procsRef.current.set(next.id, proc);
      if (stoppedRef.current.has(next.id)) { proc.close(); return; }
      proc.stream(appendLine);
      proc
        .then(() => finish(stoppedRef.current.has(next.id) ? "stopped" : "success"))
        .catch((ex: unknown) => finish(
          stoppedRef.current.has(next.id) ? "stopped" : "error",
          ex instanceof Error ? ex.message : String(ex),
        ));
    });

    // If the starter's own setup work (before `launch` is called) rejects,
    // the task must still be settled — otherwise it's stuck at "running" forever.
    if (setupResult && typeof setupResult.then === "function") {
      setupResult.catch((ex: unknown) => finish("error", ex instanceof Error ? ex.message : String(ex)));
    }
  }, [tasks]);

  const enqueue = useCallback((stackName: string, action: string, label: string, start: TaskStarter) => {
    const id = ++countersRef.current;
    startersRef.current.set(id, start);
    setTasks(prev => [...prev, { id, stackName, action, label, status: "pending", lines: [], createdAt: Date.now() }]);
  }, []);

  const stop = useCallback((id: number) => {
    stoppedRef.current.add(id);
    procsRef.current.get(id)?.close();
  }, []);

  const remove = useCallback((id: number) => {
    setTasks(prev => prev.filter(t => !(t.id === id && t.status !== "running")));
    startersRef.current.delete(id);
  }, []);

  return (
    <BackgroundTasksContext.Provider value={{ tasks, enqueue, stop, remove }}>
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
