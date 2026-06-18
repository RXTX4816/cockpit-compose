import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useModalState } from "./useModalState";
import type { ComposeStack } from "../api";

const stack: ComposeStack = { Name: "myapp", Status: "running(1)", ConfigFiles: "/myapp/compose.yml" };
const stack2: ComposeStack = { Name: "otherapp", Status: "running(1)", ConfigFiles: "/otherapp/compose.yml" };

describe("useModalState", () => {
  it("starts with all modals null and empty profiles", () => {
    const { result } = renderHook(() => useModalState());
    expect(result.current.state.logs).toBeNull();
    expect(result.current.state.up).toBeNull();
    expect(result.current.state.upProfiles).toEqual([]);
  });

  it("open sets the target for a modal", () => {
    const { result } = renderHook(() => useModalState());
    act(() => { result.current.open("logs", stack); });
    expect(result.current.state.logs).toBe(stack);
  });

  it("open does not affect other modals", () => {
    const { result } = renderHook(() => useModalState());
    act(() => { result.current.open("logs", stack); });
    expect(result.current.state.up).toBeNull();
  });

  it("close nulls the target for a modal", () => {
    const { result } = renderHook(() => useModalState());
    act(() => { result.current.open("logs", stack); });
    act(() => { result.current.close("logs"); });
    expect(result.current.state.logs).toBeNull();
  });

  it("transition swaps from→to using the current target by default", () => {
    const { result } = renderHook(() => useModalState());
    act(() => { result.current.open("upConfirm", stack); });
    act(() => { result.current.transition("upConfirm", "up"); });
    expect(result.current.state.upConfirm).toBeNull();
    expect(result.current.state.up).toBe(stack);
  });

  it("transition uses an explicit target when provided", () => {
    const { result } = renderHook(() => useModalState());
    act(() => { result.current.open("upConfirm", stack); });
    act(() => { result.current.transition("upConfirm", "up", stack2); });
    expect(result.current.state.up).toBe(stack2);
  });

  it("dispatch setProfiles stores profiles", () => {
    const { result } = renderHook(() => useModalState());
    act(() => { result.current.dispatch({ type: "setProfiles", profiles: ["prod", "debug"] }); });
    expect(result.current.state.upProfiles).toEqual(["prod", "debug"]);
  });
});
