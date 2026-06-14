import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

// Use vi.hoisted so these variables are available inside hoisted vi.mock factories
const { MockEditorView, mockDispatch, mockDestroy, mockDocToString } = vi.hoisted(() => {
  const mockDocToString = vi.fn().mockReturnValue("");
  const mockDispatch = vi.fn();
  const mockDestroy = vi.fn();
  const mockEditorInstance = {
    state: { doc: { toString: mockDocToString } },
    dispatch: mockDispatch,
    destroy: mockDestroy,
  };
  const MockEditorView = Object.assign(
    vi.fn().mockImplementation(function() { return mockEditorInstance; }),
    {
      editable: { of: vi.fn().mockReturnValue([]) },
      updateListener: { of: vi.fn().mockReturnValue([]) },
    },
  );
  return { MockEditorView, mockDispatch, mockDestroy, mockDocToString };
});

vi.mock("codemirror", () => ({
  EditorView: MockEditorView,
  basicSetup: [],
}));

vi.mock("@codemirror/state", () => ({
  EditorState: {
    create: vi.fn().mockReturnValue({}),
    readOnly: { of: vi.fn().mockReturnValue([]) },
  },
}));

vi.mock("@codemirror/lint", () => ({
  linter: (fn: unknown) => fn,
}));

vi.mock("@codemirror/lang-yaml", () => ({
  yaml: vi.fn().mockReturnValue([]),
}));

vi.mock("@codemirror/theme-one-dark", () => ({
  oneDark: ["oneDark-extension"],
}));

vi.mock("../compose-schema", () => ({
  validateComposeSpec: vi.fn().mockReturnValue([]),
}));

vi.mock("js-yaml", () => ({
  load: vi.fn().mockReturnValue(null),
}));

import { YamlEditor } from "./YamlEditor";
import { EditorState } from "@codemirror/state";
import { load } from "js-yaml";
import { validateComposeSpec } from "../compose-schema";

function getLinterFn(): (view: unknown) => unknown[] {
  const createCall = vi.mocked(EditorState.create).mock.calls[0];
  const extensions = (createCall[0] as { extensions: unknown[] }).extensions;
  const fn = extensions.find((e): e is (view: unknown) => unknown[] => typeof e === "function");
  if (!fn) throw new Error("linter function not found in extensions");
  return fn;
}

const mockView = {
  state: {
    doc: {
      toString: () => "some: yaml",
      line: (_n: number) => ({ from: 0, to: 10 }),
      length: 10,
    },
  },
};

beforeEach(() => {
  MockEditorView.mockClear();
  vi.mocked(EditorState.create).mockClear();
  vi.mocked(EditorState.readOnly.of).mockClear();
  MockEditorView.editable.of.mockClear();
  MockEditorView.updateListener.of.mockClear();
  mockDispatch.mockClear();
  mockDestroy.mockClear();
  mockDocToString.mockReturnValue("");
  vi.mocked(load).mockClear().mockReturnValue(null);
  vi.mocked(validateComposeSpec).mockClear().mockReturnValue([]);
});

afterEach(() => {
  document.documentElement.classList.remove("pf-v6-theme-dark");
});

describe("YamlEditor", () => {
  it("renders a div with the ye-editor class", () => {
    const { container } = render(<YamlEditor content="" onChange={vi.fn()} />);
    expect(container.querySelector(".ye-editor")).toBeInTheDocument();
  });

  it("creates an EditorView instance on mount", () => {
    render(<YamlEditor content="" onChange={vi.fn()} />);
    expect(MockEditorView).toHaveBeenCalledOnce();
  });

  it("destroys the editor on unmount", () => {
    const { unmount } = render(<YamlEditor content="" onChange={vi.fn()} />);
    unmount();
    expect(mockDestroy).toHaveBeenCalledOnce();
  });

  it("dispatches a change when content prop updates to a different value", async () => {
    mockDocToString.mockReturnValue("old content");
    const { rerender } = render(<YamlEditor content="old content" onChange={vi.fn()} />);
    await act(async () => {
      rerender(<YamlEditor content="new content" onChange={vi.fn()} />);
    });
    expect(mockDispatch).toHaveBeenCalled();
  });

  it("does not dispatch when content prop matches current doc", async () => {
    mockDocToString.mockReturnValue("same content");
    const { rerender } = render(<YamlEditor content="same content" onChange={vi.fn()} />);
    mockDispatch.mockClear();
    await act(async () => {
      rerender(<YamlEditor content="same content" onChange={vi.fn()} />);
    });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("passes readOnly.of(true) when readOnly prop is true", () => {
    render(<YamlEditor content="" onChange={vi.fn()} readOnly />);
    expect(EditorState.readOnly.of).toHaveBeenCalledWith(true);
  });

  it("passes updateListener when readOnly is false", () => {
    render(<YamlEditor content="" onChange={vi.fn()} readOnly={false} />);
    expect(MockEditorView.updateListener.of).toHaveBeenCalled();
  });

  it("includes oneDark extension when dark mode class is set", () => {
    document.documentElement.classList.add("pf-v6-theme-dark");
    render(<YamlEditor content="" onChange={vi.fn()} />);
    const createCall = vi.mocked(EditorState.create).mock.calls[0];
    const extensions = (createCall[0] as { extensions: unknown[] }).extensions;
    const flat = extensions.flat(10);
    expect(flat).toContain("oneDark-extension");
  });

  it("does not include oneDark extension when not in dark mode", () => {
    render(<YamlEditor content="" onChange={vi.fn()} />);
    const createCall = vi.mocked(EditorState.create).mock.calls[0];
    const extensions = (createCall[0] as { extensions: unknown[] }).extensions;
    const flat = extensions.flat(10);
    expect(flat).not.toContain("oneDark-extension");
  });
});

describe("YamlEditor — updateListener callback", () => {
  it("calls onChange when docChanged is true", () => {
    const onChange = vi.fn();
    render(<YamlEditor content="" onChange={onChange} />);
    const callback = MockEditorView.updateListener.of.mock.calls[0][0] as (update: unknown) => void;
    callback({ docChanged: true, state: { doc: { toString: () => "typed content" } } });
    expect(onChange).toHaveBeenCalledWith("typed content");
  });

  it("does not call onChange when docChanged is false", () => {
    const onChange = vi.fn();
    render(<YamlEditor content="" onChange={onChange} />);
    const callback = MockEditorView.updateListener.of.mock.calls[0][0] as (update: unknown) => void;
    onChange.mockClear();
    callback({ docChanged: false, state: { doc: { toString: () => "no change" } } });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("YamlEditor — YAML linter", () => {
  it("returns empty diagnostics for valid YAML (null parse result)", () => {
    vi.mocked(load).mockReturnValue(null);
    render(<YamlEditor content="null" onChange={vi.fn()} />);
    const linterFn = getLinterFn();
    const diagnostics = linterFn(mockView);
    expect(diagnostics).toEqual([]);
  });

  it("calls onDiagnosticsChange with empty array for valid YAML", () => {
    const onDiagnosticsChange = vi.fn();
    vi.mocked(load).mockReturnValue(null);
    render(<YamlEditor content="" onChange={vi.fn()} onDiagnosticsChange={onDiagnosticsChange} />);
    const linterFn = getLinterFn();
    linterFn(mockView);
    expect(onDiagnosticsChange).toHaveBeenCalledWith([]);
  });

  it("reports error diagnostic when YAML parse fails with mark", () => {
    const onDiagnosticsChange = vi.fn();
    vi.mocked(load).mockImplementationOnce(() => {
      const err = new Error("unexpected indent at line 1");
      Object.assign(err, { mark: { line: 0, column: 3 } });
      throw err;
    });
    render(<YamlEditor content="bad: yaml:" onChange={vi.fn()} onDiagnosticsChange={onDiagnosticsChange} />);
    const linterFn = getLinterFn();
    const diagnostics = linterFn(mockView) as { severity: string }[];
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("error");
    expect(onDiagnosticsChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ severity: "error" })]));
  });

  it("returns empty diagnostics when YAML parse fails without mark", () => {
    const onDiagnosticsChange = vi.fn();
    vi.mocked(load).mockImplementationOnce(() => {
      throw new Error("parse error without mark");
    });
    render(<YamlEditor content="" onChange={vi.fn()} onDiagnosticsChange={onDiagnosticsChange} />);
    const linterFn = getLinterFn();
    const diagnostics = linterFn(mockView) as unknown[];
    expect(diagnostics).toHaveLength(0);
    expect(onDiagnosticsChange).toHaveBeenCalledWith([]);
  });

  it("reports schema validation warnings when compose spec is invalid", () => {
    const onDiagnosticsChange = vi.fn();
    vi.mocked(load).mockReturnValue({ version: "3", services: {} });
    vi.mocked(validateComposeSpec).mockReturnValue(["services must not be empty"]);
    render(<YamlEditor content="version: '3'" onChange={vi.fn()} onDiagnosticsChange={onDiagnosticsChange} />);
    const linterFn = getLinterFn();
    const diagnostics = linterFn(mockView) as { severity: string; message: string }[];
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("warning");
    expect(diagnostics[0].message).toContain("Docker Compose:");
    expect(onDiagnosticsChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ severity: "warning" })]));
  });

  it("skips schema validation when parsed value is not an object", () => {
    vi.mocked(load).mockReturnValue("just a string");
    render(<YamlEditor content="just a string" onChange={vi.fn()} />);
    const linterFn = getLinterFn();
    const diagnostics = linterFn(mockView) as unknown[];
    expect(validateComposeSpec).not.toHaveBeenCalled();
    expect(diagnostics).toEqual([]);
  });

  it("does not crash when onDiagnosticsChange is not provided", () => {
    vi.mocked(load).mockReturnValue(null);
    render(<YamlEditor content="" onChange={vi.fn()} />);
    const linterFn = getLinterFn();
    expect(() => linterFn(mockView)).not.toThrow();
  });

  it("returns no diagnostics when YAML is valid with no schema errors", () => {
    vi.mocked(load).mockReturnValue({ services: { web: { image: "nginx" } } });
    vi.mocked(validateComposeSpec).mockReturnValue([]);
    render(<YamlEditor content="services:\n  web:\n    image: nginx" onChange={vi.fn()} />);
    const linterFn = getLinterFn();
    const diagnostics = linterFn(mockView) as unknown[];
    expect(diagnostics).toHaveLength(0);
    expect(validateComposeSpec).toHaveBeenCalled();
  });

  it("uses 'Invalid YAML' fallback when error has mark but no message", () => {
    vi.mocked(load).mockImplementationOnce(() => {
      const err: { mark?: { line: number; column: number }; message: string } = { mark: { line: 0, column: 0 }, message: "" };
      throw err;
    });
    render(<YamlEditor content="bad" onChange={vi.fn()} />);
    const linterFn = getLinterFn();
    const diagnostics = linterFn(mockView) as { message: string }[];
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].message).toBe("Invalid YAML");
  });
});
