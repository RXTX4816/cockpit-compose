import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

const mockSpawn = vi.fn();

const mockPermission = {
  allowed: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  close: vi.fn(),
};

// Fails by default so existing tests (which only mock `spawn`) keep exercising the CLI
// fallback path unaffected. Tests exercising the HTTP-first path override this per-test with
// `mockHttp.mockReturnValue(mockHttpClient({...}))` (from the base package's testing helpers).
const mockHttp = vi.fn((): CockpitHttpClient => ({
  get: vi.fn(() => Promise.reject(new Error("cockpit.http not mocked in this test"))),
  post: vi.fn(() => Promise.reject(new Error("cockpit.http not mocked in this test"))),
  request: vi.fn(() => Promise.reject(new Error("cockpit.http not mocked in this test"))),
  close: vi.fn(),
}));

vi.stubGlobal("cockpit", {
  spawn: mockSpawn,
  http: mockHttp,
  permission: vi.fn().mockReturnValue(mockPermission),
});

// Dynamic import ensures localStorage mock (from base setup) is in place before
// i18n's cockpitDetector runs localStorage.getItem()
await import("../i18n");

export { mockSpawn, mockHttp };
