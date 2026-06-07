import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock);

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();
vi.stubGlobal("localStorage", localStorageMock);
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Dynamic import ensures localStorage mock is in place before i18n's cockpitDetector
// runs localStorage.getItem(), preventing the Node.js v26 ExperimentalWarning.
await import("../i18n");

const mockSpawn = vi.fn();
vi.stubGlobal("cockpit", { spawn: mockSpawn });

export { mockSpawn };

// jsdom doesn't implement HTMLCanvasElement.getContext; stub it to silence the warning
window.HTMLCanvasElement.prototype.getContext = () => null;
