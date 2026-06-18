import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useModalTargets } from "./useModalTargets";
import type { ComposeStack } from "../api";

const stack: ComposeStack = { Name: "myapp", Status: "running(1)", ConfigFiles: "/myapp/compose.yml" };

describe("useModalTargets", () => {
  it("all targets start as null", () => {
    const { result } = renderHook(() => useModalTargets());
    expect(result.current.logsTarget).toBeNull();
    expect(result.current.yamlTarget).toBeNull();
    expect(result.current.upTarget).toBeNull();
    expect(result.current.scaleTarget).toBeNull();
  });

  it("setLogsTarget updates logsTarget", () => {
    const { result } = renderHook(() => useModalTargets());
    act(() => { result.current.setLogsTarget(stack); });
    expect(result.current.logsTarget).toBe(stack);
  });

  it("setUpTargetProfiles updates upTargetProfiles", () => {
    const { result } = renderHook(() => useModalTargets());
    act(() => { result.current.setUpTargetProfiles(["prod"]); });
    expect(result.current.upTargetProfiles).toEqual(["prod"]);
  });

  it("setScaleTarget updates scaleTarget independently", () => {
    const { result } = renderHook(() => useModalTargets());
    act(() => { result.current.setScaleTarget(stack); });
    expect(result.current.scaleTarget).toBe(stack);
    expect(result.current.logsTarget).toBeNull();
  });

  it("setting one target does not affect others", () => {
    const { result } = renderHook(() => useModalTargets());
    act(() => { result.current.setPruneTarget(stack); });
    expect(result.current.execTarget).toBeNull();
    expect(result.current.backupTarget).toBeNull();
  });
});
