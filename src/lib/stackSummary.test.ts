import { describe, it, expect } from "vitest";
import { summarizePorts, sumStats, groupByProject } from "./stackSummary";
import type { ComposeContainer, ContainerStats } from "../api";

const c = (over: Partial<ComposeContainer>): ComposeContainer =>
  ({ ID: "id", Name: "n", Image: "i", State: "running", Status: "Up", Ports: "", Service: "web", ...over });

describe("summarizePorts", () => {
  it("lists published ports once, preferring the widest bind, and the running container ids", () => {
    const r = summarizePorts([
      c({ ID: "a", Ports: "127.0.0.1:8080->80/tcp" }),
      c({ ID: "b", Ports: "0.0.0.0:8080->80/tcp", State: "exited" }),
    ]);
    expect(r.ports).toHaveLength(1);
    expect(r.ports[0].bindType).toBe("external");
    expect(r.runningIds).toEqual(["a"]);
  });
  it("ignores containers without an id when collecting running ids", () => {
    expect(summarizePorts([c({ ID: "" })]).runningIds).toEqual([]);
  });
});

describe("sumStats", () => {
  const s = (cpu: string, mem: string): ContainerStats => ({ id: "x", name: "x", cpu, mem, memPerc: "", net: "", block: "" });
  it("adds CPU percentages and used memory", () => {
    const r = sumStats([s("0.5%", "50MiB / 1GiB"), s("1.5%", "50MiB / 1GiB")]);
    expect(r?.cpu).toBeCloseTo(2);
    expect(r?.mem).toBe(2 * 50 * 1024 * 1024);
  });
  it("is null when there is nothing to add", () => {
    expect(sumStats([])).toBeNull();
  });
});

describe("groupByProject", () => {
  it("groups containers under their compose project and keeps unknown ones out", () => {
    const g = groupByProject([{ project: "a", container: c({ ID: "1" }) }, { project: "b", container: c({ ID: "2" }) }, { project: "a", container: c({ ID: "3" }) }]);
    expect(g.get("a")?.map(x => x.ID)).toEqual(["1", "3"]);
    expect(g.get("b")?.map(x => x.ID)).toEqual(["2"]);
    expect(g.has("c")).toBe(false);
  });
});
