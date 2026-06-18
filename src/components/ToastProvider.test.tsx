import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ToastProvider, useToast } from "./ToastProvider";

function ToastConsumer({ action }: { action: (ctx: ReturnType<typeof useToast>) => void }) {
  const toast = useToast();
  return <button onClick={() => action(toast)}>trigger</button>;
}

describe("ToastProvider", () => {
  it("renders children", () => {
    render(<ToastProvider><span>hello</span></ToastProvider>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("success() displays a toast with the given title", async () => {
    render(
      <ToastProvider>
        <ToastConsumer action={ctx => ctx.success("Upload complete")} />
      </ToastProvider>
    );
    await act(async () => { screen.getByRole("button").click(); });
    expect(screen.getByText("Upload complete")).toBeInTheDocument();
  });

  it("error() displays a danger toast", async () => {
    render(
      <ToastProvider>
        <ToastConsumer action={ctx => ctx.error("Something broke")} />
      </ToastProvider>
    );
    await act(async () => { screen.getByRole("button").click(); });
    expect(screen.getByText("Something broke")).toBeInTheDocument();
  });

  it("useToast() outside provider returns NOOP and does not throw", () => {
    const fn = vi.fn();
    render(<ToastConsumer action={ctx => { ctx.success("x"); fn(); }} />);
    act(() => { screen.getByRole("button").click(); });
    expect(fn).toHaveBeenCalled();
  });

  it("warn() displays a warning toast", async () => {
    render(
      <ToastProvider>
        <ToastConsumer action={ctx => ctx.warn("Warning message")} />
      </ToastProvider>
    );
    await act(async () => { screen.getByRole("button").click(); });
    expect(screen.getByText("Warning message")).toBeInTheDocument();
  });

  it("info() displays an info toast", async () => {
    render(
      <ToastProvider>
        <ToastConsumer action={ctx => ctx.info("Info message")} />
      </ToastProvider>
    );
    await act(async () => { screen.getByRole("button").click(); });
    expect(screen.getByText("Info message")).toBeInTheDocument();
  });

  it("dismiss closes toast when close button is clicked", async () => {
    render(
      <ToastProvider>
        <ToastConsumer action={ctx => ctx.success("Closeable toast")} />
      </ToastProvider>
    );
    await act(async () => { screen.getByRole("button").click(); });
    expect(screen.getByText("Closeable toast")).toBeInTheDocument();
    const closeBtn = screen.getByLabelText(/close/i);
    await act(async () => { closeBtn.click(); });
    expect(screen.queryByText("Closeable toast")).not.toBeInTheDocument();
  });

  it("addToast() supports optional body text", async () => {
    render(
      <ToastProvider>
        <ToastConsumer action={ctx => ctx.addToast("info", "Title", "Body text")} />
      </ToastProvider>
    );
    await act(async () => { screen.getByRole("button").click(); });
    expect(screen.getByText("Body text")).toBeInTheDocument();
  });
});
