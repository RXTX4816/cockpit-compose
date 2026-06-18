import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DownModal } from "./DownModal";
import type { ComposeStack, SharedNetwork } from "../api";

const stack: ComposeStack = { Name: "myapp", Status: "running(1)", ConfigFiles: "/myapp/compose.yml" };

describe("DownModal", () => {
  it("renders the stack name in the title", () => {
    render(
      <DownModal target={stack} downing={false} error={null}
        sharedNetworks={[]} networksLoading={false} onConfirm={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByRole("heading", { name: /myapp/ })).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button clicked", () => {
    const onConfirm = vi.fn();
    render(
      <DownModal target={stack} downing={false} error={null}
        sharedNetworks={[]} networksLoading={false} onConfirm={onConfirm} onClose={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: /down/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onClose when cancel button clicked", () => {
    const onClose = vi.fn();
    render(
      <DownModal target={stack} downing={false} error={null}
        sharedNetworks={[]} networksLoading={false} onConfirm={vi.fn()} onClose={onClose} />
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows a spinner while networks are loading", () => {
    render(
      <DownModal target={stack} downing={false} error={null}
        sharedNetworks={[]} networksLoading={true} onConfirm={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText(/checking/i)).toBeInTheDocument();
  });

  it("shows shared network warning when networks are shared", () => {
    const sharedNetworks: SharedNetwork[] = [{ name: "my-net", sharedWith: ["otherapp"] }];
    render(
      <DownModal target={stack} downing={false} error={null}
        sharedNetworks={sharedNetworks} networksLoading={false} onConfirm={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText(/my-net/)).toBeInTheDocument();
    expect(screen.getByText(/otherapp/)).toBeInTheDocument();
  });

  it("shows error alert when error is provided", () => {
    render(
      <DownModal target={stack} downing={false} error="down failed"
        sharedNetworks={[]} networksLoading={false} onConfirm={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText("down failed")).toBeInTheDocument();
  });

  it("calls onClose when modal close (X) button is clicked and not downing", () => {
    const onClose = vi.fn();
    render(
      <DownModal target={stack} downing={false} error={null}
        sharedNetworks={[]} networksLoading={false} onConfirm={vi.fn()} onClose={onClose} />
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose when modal X button is clicked while downing", () => {
    const onClose = vi.fn();
    render(
      <DownModal target={stack} downing={true} error={null}
        sharedNetworks={[]} networksLoading={false} onConfirm={vi.fn()} onClose={onClose} />
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
