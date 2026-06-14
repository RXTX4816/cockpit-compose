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

interface CockpitChannel {
  send(data: string): void;
  close(options?: { problem?: string }): void;
  addEventListener(event: "message", handler: (ev: Event, payload: string) => void): void;
  addEventListener(event: "close", handler: (ev: Event, options: { problem?: string; message?: string; "exit-status"?: number }) => void): void;
}

declare const cockpit: {
  spawn(
    args: string[],
    options?: {
      superuser?: "try" | "require";
      err?: "out" | "message";
      directory?: string;
      environ?: string[];
    },
  ): CockpitProcess;
  file(
    path: string,
    options?: { superuser?: "try" | "require"; syntax?: { parse: (s: string) => unknown; stringify: (v: unknown) => string } },
  ): CockpitFile;
  channel(options: {
    payload: "stream";
    spawn: string[];
    pty?: boolean;
    directory?: string;
    superuser?: "try" | "require";
    err?: "out";
  }): CockpitChannel;
  user(): Promise<{ id: number; name: string; home: string }>;
};
