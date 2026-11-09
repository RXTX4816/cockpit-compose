import { describe, it, expect, beforeEach } from "vitest";
import { mockSpawn } from "../../test/setup";
import { mockProcess } from "../../test/helpers";
import { setRuntime } from "../cockpit";
import { engine } from "./engine";

// engine() is the one place the Runtime decides between variants; the behaviour of each
// variant is covered per operation in lifecycle.test.ts, prune.test.ts and query.test.ts.

const files = ["/srv/a/compose.yml"];
const verbOf = (i = 0) => mockSpawn.mock.calls[i][0] as string[];

beforeEach(() => {
  mockSpawn.mockReset();
  mockSpawn.mockImplementation(() => mockProcess("[]"));
});

describe("engine()", () => {
  it("on Docker runs compose directly", () => {
    setRuntime("docker");
    engine().pause("p", files, ["dev"], "try");
    expect(verbOf()).toEqual(["docker", "compose", "--profile", "dev", "-p", "p", "-f", files[0], "pause"]);
    mockSpawn.mockClear();
    engine().pruneContainers("p");
    expect(verbOf().slice(0, 3)).toEqual(["docker", "container", "prune"]);
  });

  it("on Podman pauses and prunes through the container CLI, project by label", async () => {
    setRuntime("podman");
    await engine().pause("p", files, [], "try");
    expect(verbOf()).toEqual(expect.arrayContaining(["podman", "ps", "--filter", "label=com.docker.compose.project=p"]));
    mockSpawn.mockClear();
    await engine().pruneContainers("p");
    expect(verbOf()).toEqual(expect.arrayContaining(["status=exited"]));
    expect(verbOf()).not.toContain("prune");
  });
});
