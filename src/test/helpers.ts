import { vi } from "vitest";

export function mockProcess(data: string | string[], error?: string): CockpitProcess {
  const chunks = Array.isArray(data) ? data : [data];
  let streamCb: ((data: string) => void) | null = null;
  const p = new Promise<string>((resolve, reject) => {
    queueMicrotask(() => {
      for (const chunk of chunks) {
        if (streamCb && chunk) streamCb(chunk);
      }
      if (error) reject(new Error(error));
      else resolve(chunks.join(""));
    });
  });
  return Object.assign(p, {
    stream: (cb: (data: string) => void) => { streamCb = cb; return p as CockpitProcess; },
    close: vi.fn(),
    input: vi.fn(),
  }) as CockpitProcess;
}
