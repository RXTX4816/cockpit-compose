import { describe, it, expect } from "vitest";
import { isValidLayout } from "./layout";

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
