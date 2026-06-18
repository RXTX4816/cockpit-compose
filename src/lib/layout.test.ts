import { describe, it, expect, beforeEach } from "vitest";
import { isValidLayout, loadLayoutFromStorage, LAYOUT_KEY } from "./layout";

describe("isValidLayout", () => {
  it("accepts valid layout values", () => {
    expect(isValidLayout("minimal")).toBe(true);
    expect(isValidLayout("poweruser")).toBe(true);
    expect(isValidLayout("pretty")).toBe(true);
    expect(isValidLayout("unix")).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(isValidLayout("grid")).toBe(false);
    expect(isValidLayout("")).toBe(false);
    expect(isValidLayout(null)).toBe(false);
    expect(isValidLayout(42)).toBe(false);
  });
});

describe("loadLayoutFromStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns poweruser when nothing is stored", () => {
    expect(loadLayoutFromStorage()).toBe("poweruser");
  });

  it("returns the stored valid layout", () => {
    localStorage.setItem(LAYOUT_KEY, "minimal");
    expect(loadLayoutFromStorage()).toBe("minimal");
  });

  it("falls back to poweruser for invalid stored value", () => {
    localStorage.setItem(LAYOUT_KEY, "bogus");
    expect(loadLayoutFromStorage()).toBe("poweruser");
  });
});
