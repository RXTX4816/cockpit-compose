import { useState, useEffect, useCallback } from "react";
import { type ConfiguredDirectory, type FoundCompose, getConfiguredDirectories, saveConfiguredDirectories, scanDirectoriesForCompose } from "../api";

interface UseComposeDirectoriesResult {
  directories: ConfiguredDirectory[];
  foundCompose: FoundCompose[];
  loading: boolean;
  error: string | null;
  addDirectory: (path: string) => Promise<void>;
  removeDirectory: (path: string) => Promise<void>;
  scan: () => Promise<void>;
}

export function useComposeDirectories(): UseComposeDirectoriesResult {
  const [directories, setDirectories] = useState<ConfiguredDirectory[]>([]);
  const [foundCompose, setFoundCompose] = useState<FoundCompose[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scanDirs = useCallback(async (dirs: ConfiguredDirectory[]) => {
    if (dirs.length === 0) {
      setFoundCompose([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const found = await scanDirectoriesForCompose(dirs);
      setFoundCompose(found);
    } catch (ex) {
      const msg = ex instanceof Error ? ex.message : String(ex);
      setError(`Failed to scan directories: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load directories from config on mount
  useEffect(() => {
    const load = async () => {
      try {
        const dirs = await getConfiguredDirectories();
        setDirectories(dirs);
        // Auto-scan if directories are configured
        if (dirs.length > 0) {
          await scanDirs(dirs);
        }
      } catch (ex) {
        setError(ex instanceof Error ? ex.message : String(ex));
      }
    };
    void load();
  }, [scanDirs]);

  const scan = useCallback(async () => {
    await scanDirs(directories);
  }, [directories, scanDirs]);

  const addDirectory = useCallback(
    async (path: string) => {
      const newDirs = [...directories, { path, addedAt: Date.now() }];
      setDirectories(newDirs);
      await saveConfiguredDirectories(newDirs);
      await scanDirs(newDirs);
    },
    [directories, scanDirs]
  );

  const removeDirectory = useCallback(
    async (path: string) => {
      const newDirs = directories.filter(d => d.path !== path);
      setDirectories(newDirs);
      await saveConfiguredDirectories(newDirs);
      await scanDirs(newDirs);
    },
    [directories, scanDirs]
  );

  return {
    directories,
    foundCompose,
    loading,
    error,
    addDirectory,
    removeDirectory,
    scan,
  };
}
