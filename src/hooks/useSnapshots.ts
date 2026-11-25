import { drainProcess } from "../lib/drainProcess";
import { useState, useCallback } from "react";
import {
  listSnapshots,
  restoreSnapshot as restoreSnapshotApi,
  deleteSnapshot as deleteSnapshotApi,
} from "../api";
import type { Snapshot } from "../api";

export function useSnapshots(configFile: string) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  const load = useCallback(async () => {
    try {
      const raw = await drainProcess(listSnapshots(configFile));
      const snapshotPaths = raw.trim().split("\n").filter(Boolean);
      const list: Snapshot[] = snapshotPaths
        .map(path => {
          const match = path.match(/\.snapshot\.(\d+)$/);
          if (!match) return null;
          const timestamp = parseInt(match[1], 10);
          return { timestamp, name: new Date(timestamp).toLocaleString(), path };
        })
        .filter((s): s is Snapshot => s !== null)
        .sort((a, b) => b.timestamp - a.timestamp);
      setSnapshots(list);
    } catch {
      setSnapshots([]);
    }
  }, [configFile]);

  const restore = useCallback(async (path: string): Promise<string> => {
    return restoreSnapshotApi(path);
  }, []);

  const remove = useCallback(async (path: string): Promise<void> => {
    await deleteSnapshotApi(path);
    await load();
  }, [load]);

  return { snapshots, load, restore, remove };
}
