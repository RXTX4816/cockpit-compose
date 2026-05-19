interface CockpitProcess extends Promise<string> {
  input(data: string, stream?: boolean): void;
  stream(callback: (data: string) => void): CockpitProcess;
  close(problem?: string): void;
}

interface CockpitFile {
  read(): Promise<string>;
  replace(content: string): Promise<void>;
  watch(callback: (content: string | null, tag: string) => void): { remove(): void };
  close(): void;
}

declare const cockpit: {
  spawn(
    args: string[],
    options?: {
      superuser?: "try" | "require";
      err?: "out" | "message";
      directory?: string;
    },
  ): CockpitProcess;
  file(
    path: string,
    options?: { superuser?: "try" | "require"; syntax?: { parse: (s: string) => unknown; stringify: (v: unknown) => string } },
  ): CockpitFile;
  user(): Promise<{ id: number; name: string; home: string }>;
};
