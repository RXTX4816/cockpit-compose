import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

const mockSpawn = vi.fn();

const mockPermission = {
  allowed: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  close: vi.fn(),
};

vi.stubGlobal("cockpit", {
  spawn: mockSpawn,
  permission: vi.fn().mockReturnValue(mockPermission),
});

// Dynamic import ensures localStorage mock (from base setup) is in place before
// i18n's cockpitDetector runs localStorage.getItem()
await import("../i18n");

export { mockSpawn };
