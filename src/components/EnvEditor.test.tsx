import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

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
  },
}));

vi.mock("@codemirror/lint", () => ({
  linter: (fn: unknown) => fn,
}));

vi.mock("@codemirror/theme-one-dark", () => ({
  oneDark: ["oneDark-extension"],
}));

vi.mock("./envLint", () => ({
  lintEnvContent: vi.fn().mockReturnValue([]),
}));

import { EnvEditor } from "./EnvEditor";
import { EditorState } from "@codemirror/state";

beforeEach(() => {
  MockEditorView.mockClear();
  MockEditorView.updateListener.of.mockClear();
  MockEditorView.editable.of.mockClear();
  mockDispatch.mockClear();
  mockDestroy.mockClear();
  mockDocToString.mockReturnValue("");
  vi.mocked(EditorState.create).mockClear();
});

afterEach(() => {
  document.documentElement.classList.remove("pf-v6-theme-dark");
});

describe("EnvEditor", () => {
  it("renders a div with the ye-editor class", () => {
    const { container } = render(<EnvEditor content="" onChange={vi.fn()} />);
    expect(container.querySelector(".ye-editor")).toBeInTheDocument();
  });

  it("creates an EditorView instance on mount", () => {
    render(<EnvEditor content="" onChange={vi.fn()} />);
    expect(MockEditorView).toHaveBeenCalledOnce();
  });

  it("destroys the editor on unmount", () => {
    const { unmount } = render(<EnvEditor content="" onChange={vi.fn()} />);
    unmount();
    expect(mockDestroy).toHaveBeenCalledOnce();
  });

  it("dispatches a change when content prop updates to a different value", async () => {
    mockDocToString.mockReturnValue("HOST=old");
    const { rerender } = render(<EnvEditor content="HOST=old" onChange={vi.fn()} />);
    await act(async () => {
      rerender(<EnvEditor content="HOST=new" onChange={vi.fn()} />);
    });
    expect(mockDispatch).toHaveBeenCalled();
  });

  it("does not dispatch when content prop matches current doc", async () => {
    mockDocToString.mockReturnValue("HOST=same");
    const { rerender } = render(<EnvEditor content="HOST=same" onChange={vi.fn()} />);
    mockDispatch.mockClear();
    await act(async () => {
      rerender(<EnvEditor content="HOST=same" onChange={vi.fn()} />);
    });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("adds EditorView.editable.of(false) when readOnly is true", () => {
    render(<EnvEditor content="" onChange={vi.fn()} readOnly />);
    expect(MockEditorView.editable.of).toHaveBeenCalledWith(false);
  });

  it("adds updateListener when readOnly is false", () => {
    render(<EnvEditor content="" onChange={vi.fn()} readOnly={false} />);
    expect(MockEditorView.updateListener.of).toHaveBeenCalled();
  });

  it("calls onChange when updateListener fires with docChanged=true", () => {
    const onChange = vi.fn();
    render(<EnvEditor content="" onChange={onChange} />);
    type ListenerArg = { docChanged: boolean; state: { doc: { toString: () => string } } };
    const listenerCb = MockEditorView.updateListener.of.mock.calls[0][0] as (u: ListenerArg) => void;
    listenerCb({ docChanged: true, state: { doc: { toString: () => "NEW=value" } } });
    expect(onChange).toHaveBeenCalledWith("NEW=value");
  });

  it("does not call onChange when updateListener fires with docChanged=false", () => {
    const onChange = vi.fn();
    render(<EnvEditor content="" onChange={onChange} />);
    type ListenerArg = { docChanged: boolean; state: { doc: { toString: () => string } } };
    const listenerCb = MockEditorView.updateListener.of.mock.calls[0][0] as (u: ListenerArg) => void;
    listenerCb({ docChanged: false, state: { doc: { toString: () => "unchanged" } } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("includes oneDark extension when dark mode class is set", () => {
    document.documentElement.classList.add("pf-v6-theme-dark");
    render(<EnvEditor content="" onChange={vi.fn()} />);
    const createCall = vi.mocked(EditorState.create).mock.calls[0];
    const extensions = (createCall[0] as { extensions: unknown[] }).extensions;
    const flat = extensions.flat(10);
    expect(flat).toContain("oneDark-extension");
  });

  it("does not include oneDark extension when not in dark mode", () => {
    render(<EnvEditor content="" onChange={vi.fn()} />);
    const createCall = vi.mocked(EditorState.create).mock.calls[0];
    const extensions = (createCall[0] as { extensions: unknown[] }).extensions;
    const flat = extensions.flat(10);
    expect(flat).not.toContain("oneDark-extension");
  });
});
