import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("codemirror", () => ({
  EditorView: Object.assign(
    vi.fn().mockImplementation(function() {
      return { destroy: vi.fn(), state: { doc: { toString: vi.fn().mockReturnValue("") } }, dispatch: vi.fn() };
    }),
    { editable: { of: vi.fn().mockReturnValue([]) } },
  ),
  basicSetup: [],
}));
vi.mock("@codemirror/state", () => ({
  EditorState: { create: vi.fn().mockReturnValue({}), readOnly: { of: vi.fn().mockReturnValue([]) } },
}));
vi.mock("@codemirror/lang-yaml", () => ({ yaml: vi.fn().mockReturnValue([]) }));
vi.mock("@codemirror/theme-one-dark", () => ({ oneDark: [] }));
vi.mock("@codemirror/merge", () => ({ unifiedMergeView: vi.fn().mockReturnValue([]) }));

import { YamlDiffView } from "./YamlDiffView";

describe("YamlDiffView", () => {
  it("renders with ye-editor class applied", () => {
    const { container } = render(<YamlDiffView original="a: 1" modified="a: 2" />);
    expect(container.querySelector(".ye-editor")).toBeInTheDocument();
  });
});
