import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StackSkeleton } from "./StackSkeleton";

describe("StackSkeleton", () => {
  it("renders a loading region", () => {
    render(<StackSkeleton />);
    expect(screen.getByLabelText(/loading stacks/i)).toBeInTheDocument();
  });
});
