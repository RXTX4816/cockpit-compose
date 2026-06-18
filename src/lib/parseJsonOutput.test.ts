import { describe, it, expect } from "vitest";
import { parseJsonOutput } from "./parseJsonOutput";

describe("parseJsonOutput", () => {
  it("returns empty array for empty string", () => {
    expect(parseJsonOutput("")).toEqual([]);
  });

  it("returns empty array for 'null'", () => {
    expect(parseJsonOutput("null")).toEqual([]);
  });

  it("parses a JSON array", () => {
    expect(parseJsonOutput<{ id: number }>('[{"id":1},{"id":2}]')).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("wraps a single JSON object in an array", () => {
    expect(parseJsonOutput<{ id: number }>('{"id":1}')).toEqual([{ id: 1 }]);
  });

  it("parses JSONL (one object per line)", () => {
    const jsonl = '{"id":1}\n{"id":2}\n{"id":3}';
    expect(parseJsonOutput<{ id: number }>(jsonl)).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  it("ignores blank lines in JSONL", () => {
    const jsonl = '{"id":1}\n\n{"id":2}';
    expect(parseJsonOutput<{ id: number }>(jsonl)).toEqual([{ id: 1 }, { id: 2 }]);
  });
});
