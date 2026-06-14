import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EnvTable } from "./EnvTable";

function setup(content = "", onChange = vi.fn(), onDuplicatesChange = vi.fn()) {
  render(<EnvTable content={content} onChange={onChange} onDuplicatesChange={onDuplicatesChange} />);
  return { onChange, onDuplicatesChange };
}

describe("EnvTable — rendering", () => {
  it("renders column headers", () => {
    setup();
    expect(screen.getByText("Key")).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
  });

  it("renders nothing for empty content", () => {
    setup("");
    expect(screen.queryAllByRole("row").length).toBe(1); // header row only
  });

  it("renders a comment row as a single cell", () => {
    setup("# This is a comment");
    expect(screen.getByText("# This is a comment")).toBeInTheDocument();
  });

  it("skips blank lines (returns null row)", () => {
    // Use non-sensitive keys so value inputs have type="text" (textbox role)
    setup("HOST=value\n\nURL=example");
    const inputs = screen.getAllByRole("textbox");
    // 2 entries × 2 inputs each = 4
    expect(inputs).toHaveLength(4);
  });

  it("renders key and value text inputs for entry rows", () => {
    setup("KEY=value");
    expect(screen.getByDisplayValue("KEY")).toBeInTheDocument();
    expect(screen.getByDisplayValue("value")).toBeInTheDocument();
  });

  it("renders multiple entries in order", () => {
    setup("FIRST=1\nSECOND=2");
    const keys = screen.getAllByPlaceholderText("KEY");
    expect(keys[0]).toHaveValue("FIRST");
    expect(keys[1]).toHaveValue("SECOND");
  });

  it("treats lines without '=' as comment rows", () => {
    setup("not-an-entry");
    expect(screen.getByText("not-an-entry")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("KEY")).toBeNull();
  });
});

describe("EnvTable — sensitive key detection", () => {
  it("masks password-like keys as password inputs by default", () => {
    setup("DB_PASSWORD=secret");
    const valueInput = screen.getByPlaceholderText("value");
    expect(valueInput).toHaveAttribute("type", "password");
  });

  it("masks TOKEN keys as password inputs", () => {
    setup("API_TOKEN=abc");
    expect(screen.getByPlaceholderText("value")).toHaveAttribute("type", "password");
  });

  it("masks SECRET keys as password inputs", () => {
    setup("MY_SECRET=xyz");
    expect(screen.getByPlaceholderText("value")).toHaveAttribute("type", "password");
  });

  it("does not mask non-sensitive keys", () => {
    setup("HOST=localhost");
    expect(screen.getByPlaceholderText("value")).toHaveAttribute("type", "text");
  });

  it("shows reveal button for sensitive entries", () => {
    setup("DB_PASSWORD=secret");
    expect(screen.getByRole("button", { name: /show value/i })).toBeInTheDocument();
  });

  it("does not show reveal button for non-sensitive entries", () => {
    setup("HOST=localhost");
    expect(screen.queryByRole("button", { name: /show value|hide value/i })).toBeNull();
  });
});

describe("EnvTable — toggle sensitivity", () => {
  it("clicking the lock icon on a sensitive entry removes masking", () => {
    setup("DB_PASSWORD=secret");
    const lockBtn = screen.getByRole("button", { name: /mark as not sensitive/i });
    fireEvent.click(lockBtn);
    expect(screen.getByPlaceholderText("value")).toHaveAttribute("type", "text");
  });

  it("clicking the unlock icon on a non-sensitive entry adds masking", () => {
    setup("HOST=localhost");
    const unlockBtn = screen.getByRole("button", { name: /mark as sensitive/i });
    fireEvent.click(unlockBtn);
    expect(screen.getByPlaceholderText("value")).toHaveAttribute("type", "password");
  });

  it("hides reveal button after unlocking a sensitive entry", () => {
    setup("DB_PASSWORD=secret");
    fireEvent.click(screen.getByRole("button", { name: /mark as not sensitive/i }));
    expect(screen.queryByRole("button", { name: /show value|hide value/i })).toBeNull();
  });
});

describe("EnvTable — reveal toggle", () => {
  it("clicking the eye icon reveals the masked value", () => {
    setup("DB_PASSWORD=secret");
    fireEvent.click(screen.getByRole("button", { name: /show value/i }));
    expect(screen.getByPlaceholderText("value")).toHaveAttribute("type", "text");
  });

  it("clicking the eye-slash icon re-masks the value", () => {
    setup("DB_PASSWORD=secret");
    fireEvent.click(screen.getByRole("button", { name: /show value/i }));
    fireEvent.click(screen.getByRole("button", { name: /hide value/i }));
    expect(screen.getByPlaceholderText("value")).toHaveAttribute("type", "password");
  });
});

describe("EnvTable — editing", () => {
  it("calls onChange with updated serialized content when key changes", () => {
    const onChange = vi.fn();
    setup("OLD=val", onChange);
    fireEvent.change(screen.getByDisplayValue("OLD"), { target: { value: "NEW" } });
    expect(onChange).toHaveBeenCalledWith("NEW=val");
  });

  it("calls onChange with updated serialized content when value changes", () => {
    const onChange = vi.fn();
    setup("KEY=old", onChange);
    fireEvent.change(screen.getByDisplayValue("old"), { target: { value: "new" } });
    expect(onChange).toHaveBeenCalledWith("KEY=new");
  });

  it("updating key to a sensitive name re-masks the value input", () => {
    setup("LABEL=visible");
    const keyInput = screen.getByDisplayValue("LABEL");
    fireEvent.change(keyInput, { target: { value: "DB_PASSWORD" } });
    expect(screen.getByPlaceholderText("value")).toHaveAttribute("type", "password");
  });
});

describe("EnvTable — delete row", () => {
  it("removes the row and calls onChange", () => {
    const onChange = vi.fn();
    setup("KEY=value", onChange);
    fireEvent.click(screen.getByRole("button", { name: /delete row/i }));
    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.queryByDisplayValue("KEY")).toBeNull();
  });

  it("removes only the targeted row when there are multiple", () => {
    const onChange = vi.fn();
    setup("FIRST=1\nSECOND=2", onChange);
    const deleteButtons = screen.getAllByRole("button", { name: /delete row/i });
    fireEvent.click(deleteButtons[0]);
    expect(onChange).toHaveBeenCalledWith("SECOND=2");
  });
});

describe("EnvTable — add row", () => {
  it("adds an empty entry row when Add variable is clicked", () => {
    setup("KEY=value");
    const before = screen.getAllByPlaceholderText("KEY").length;
    fireEvent.click(screen.getByRole("button", { name: /add variable/i }));
    expect(screen.getAllByPlaceholderText("KEY")).toHaveLength(before + 1);
  });

  it("calls onChange after adding a row", () => {
    const onChange = vi.fn();
    setup("KEY=value", onChange);
    onChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /add variable/i }));
    expect(onChange).toHaveBeenCalled();
  });
});

describe("EnvTable — duplicate key detection", () => {
  it("calls onDuplicatesChange(true) when a key is changed to match another", () => {
    const onDuplicatesChange = vi.fn();
    setup("HOST=1\nURL=2", vi.fn(), onDuplicatesChange);
    // Change URL to HOST to create a duplicate
    const keyInputs = screen.getAllByPlaceholderText("KEY");
    fireEvent.change(keyInputs[1], { target: { value: "HOST" } });
    expect(onDuplicatesChange).toHaveBeenCalledWith(true);
  });

  it("calls onDuplicatesChange(false) when duplicates are resolved", () => {
    const onDuplicatesChange = vi.fn();
    setup("HOST=1\nURL=2", vi.fn(), onDuplicatesChange);
    // Create then remove a duplicate
    const keyInputs = screen.getAllByPlaceholderText("KEY");
    fireEvent.change(keyInputs[1], { target: { value: "HOST" } });
    onDuplicatesChange.mockClear();
    fireEvent.change(keyInputs[1], { target: { value: "PORT" } });
    expect(onDuplicatesChange).toHaveBeenCalledWith(false);
  });

  it("shows error validation on duplicate key inputs", () => {
    setup("HOST=1\nURL=2");
    const keyInputs = screen.getAllByPlaceholderText("KEY");
    fireEvent.change(keyInputs[1], { target: { value: "HOST" } });
    const dupInputs = screen.getAllByDisplayValue("HOST");
    for (const input of dupInputs) {
      expect(input).toHaveAttribute("aria-invalid", "true");
    }
  });

  it("resolves duplicates when the conflicting key is changed to a unique value", () => {
    const onDuplicatesChange = vi.fn();
    setup("HOST=1\nURL=2", vi.fn(), onDuplicatesChange);
    const keyInputs = screen.getAllByPlaceholderText("KEY");
    // Create a duplicate
    fireEvent.change(keyInputs[1], { target: { value: "HOST" } });
    onDuplicatesChange.mockClear();
    // Resolve the duplicate by renaming to a unique key
    fireEvent.change(keyInputs[1], { target: { value: "DATABASE_URL" } });
    expect(onDuplicatesChange).toHaveBeenCalledWith(false);
  });
});

describe("EnvTable — external content update", () => {
  it("re-parses rows when content prop changes from outside", () => {
    const { rerender } = render(
      <EnvTable content="A=1" onChange={vi.fn()} onDuplicatesChange={vi.fn()} />
    );
    expect(screen.getByDisplayValue("A")).toBeInTheDocument();
    rerender(<EnvTable content="B=2" onChange={vi.fn()} onDuplicatesChange={vi.fn()} />);
    expect(screen.queryByDisplayValue("A")).toBeNull();
    expect(screen.getByDisplayValue("B")).toBeInTheDocument();
  });
});
