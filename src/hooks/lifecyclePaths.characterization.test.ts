import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";
import { useStackActions } from "./useStackActions";
import { useUpStream } from "./useUpStream";
import { usePullStream } from "./usePullStream";
import { useKillStack } from "./useKillStack";
import { useServiceActions } from "./useServiceActions";
import { buildUpStarter, buildPullStarter, buildRestartStarter, buildKillStarter } from "../lib/backgroundActions";
import { setRuntime } from "../api/cockpit";
import type { ComposeStack } from "../api";

// Characterization of Up, Pull, Start, Stop, Restart, Pause, Unpause and Kill as observed at
// the cockpit.spawn seam, across the dialog, drawer and bulk paths. Written before these
// moved onto the stack-operation module, so that move is visibly behaviour-preserving apart
// from the drawer/bulk profile change recorded in the next test block.

vi.mock("../components/ToastProvider", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const stack: ComposeStack = { Name: "myapp", Status: "running(1)", ConfigFiles: "/srv/myapp/compose.yml" };
const files = ["/srv/myapp/compose.yml"];
const COMPOSE = "services:\n  web:\n    image: nginx\n    profiles: [dev]\n";
const P = ["--profile", "dev"];
const base = ["docker", "compose"];

function callWith(verb: string) {
  return mockSpawn.mock.calls.find(c => {
    const a = c[0] as string[];
    return a[0] === "docker" && a[1] === "compose" && a.includes(verb);
  });
}

beforeEach(() => {
  mockSpawn.mockReset();
  setRuntime("docker");
  mockSpawn.mockImplementation((argv: string[]) => {
    if (argv[0] === "cat") return mockProcess(COMPOSE);
    if (argv.includes("ps") && argv.includes("{{.ID}}")) return mockProcess("abc\n");
    if (argv.includes("ps") && argv.includes("--format") && argv.includes("json")) return mockProcess('[{"Id":"abc"}]');
    if (argv.includes("config") && argv.includes("--services")) return mockProcess("web\n");
    return mockProcess("");
  });
});

describe("dialog actions run compose with the stack's files and profiles, escalated", () => {
  const run = async (action: "start" | "stop" | "pause" | "unpause") => {
    const { result } = renderHook(() => useStackActions("myapp", files, vi.fn()));
    await act(() => result.current.doAction(action));
  };

  it.each([
    ["start", "up", [...base, ...P, "-p", "myapp", "-f", files[0], "up", "-d"]],
    ["stop", "stop", [...base, ...P, "-p", "myapp", "-f", files[0], "stop"]],
    ["pause", "pause", [...base, ...P, "-p", "myapp", "-f", files[0], "pause"]],
    ["unpause", "unpause", [...base, ...P, "-p", "myapp", "-f", files[0], "unpause"]],
  ] as const)("%s", async (action, verb, argv) => {
    await run(action);
    const call = callWith(verb);
    expect(call?.[0]).toEqual(argv);
    expect((call?.[1] as { superuser?: string }).superuser).toBe("try");
  });
});

describe("Up", () => {
  it("dialog: activates the chosen profiles, escalated", async () => {
    renderHook(() => useUpStream("myapp", files, ["ops"]));
    await waitFor(() => expect(callWith("up")).toBeDefined());
    const call = callWith("up");
    expect(call?.[0]).toEqual([...base, "--profile", "ops", "--progress", "plain", "-p", "myapp", "-f", files[0], "up", "-d"]);
    expect((call?.[1] as { superuser?: string }).superuser).toBe("try");
  });

  it("drawer and bulk: activate the given profiles, none by default", async () => {
    const launch = vi.fn();
    await buildUpStarter(stack)(launch);
    await launch.mock.calls[0][0];
    expect(callWith("up")?.[0]).toEqual([...base, "--progress", "plain", "-p", "myapp", "-f", files[0], "up", "-d"]);
    mockSpawn.mockClear();
    await buildUpStarter(stack, ["ops"])(launch);
    await launch.mock.calls[1][0];
    expect(callWith("up")?.[0]).toEqual([...base, "--profile", "ops", "--progress", "plain", "-p", "myapp", "-f", files[0], "up", "-d"]);
    expect((callWith("up")?.[1] as { superuser?: string }).superuser).toBe("try");
  });
});

describe("Pull", () => {
  const pullArgv = [...base, ...P, "--progress", "plain", "-p", "myapp", "-f", files[0], "pull"];

  it("dialog: uses the stack's profiles", async () => {
    renderHook(() => usePullStream("myapp", files));
    await waitFor(() => expect(callWith("pull")).toBeDefined());
    expect(callWith("pull")?.[0]).toEqual(pullArgv);
    expect((callWith("pull")?.[1] as { superuser?: string }).superuser).toBe("try");
  });

  it("drawer and bulk: use the stack's profiles", async () => {
    const launch = vi.fn();
    await buildPullStarter(stack)(launch);
    await launch.mock.calls[0][0];
    expect(callWith("pull")?.[0]).toEqual(pullArgv);
  });
});

describe("Restart", () => {
  it("dialog: restarts the running services with the stack's profiles", async () => {
    mockSpawn.mockImplementation((argv: string[]) => {
      if (argv[0] === "cat") return mockProcess(COMPOSE);
      if (argv.includes("ps") && argv.includes("status=running")) return mockProcess("web\n");
      return mockProcess("");
    });
    const { result } = renderHook(() => useStackActions("myapp", files, vi.fn()));
    await act(() => result.current.doAction("restart"));
    const call = callWith("restart");
    expect(call?.[0]).toEqual([...base, ...P, "-p", "myapp", "-f", files[0], "restart", "web"]);
    expect((call?.[1] as { superuser?: string }).superuser).toBe("try");
  });

  it("restarting one service restarts just that service", async () => {
    const { result } = renderHook(() => useServiceActions(stack, vi.fn()));
    await act(() => result.current.doServiceAction("restart", "web"));
    expect(callWith("restart")?.[0]).toEqual([...base, ...P, "-p", "myapp", "-f", files[0], "restart", "web"]);
  });

  it("drawer and bulk: restart the running services with the stack's profiles, like the dialog", async () => {
    mockSpawn.mockImplementation((argv: string[]) => {
      if (argv[0] === "cat") return mockProcess(COMPOSE);
      if (argv.includes("ps") && argv.includes("status=running")) return mockProcess("web\n");
      return mockProcess("");
    });
    const launch = vi.fn();
    await buildRestartStarter(stack)(launch);
    await launch.mock.calls[0][0];
    expect(callWith("restart")?.[0]).toEqual([...base, ...P, "-p", "myapp", "-f", files[0], "restart", "web"]);
  });
});

describe("Kill", () => {
  it("dialog: runs compose kill with the stack's profiles, then force-removes what is left", async () => {
    const { result } = renderHook(() => useKillStack(vi.fn(), vi.fn()));
    act(() => { result.current.open(stack); });
    await act(() => result.current.execute());
    expect(callWith("kill")?.[0]).toEqual([...base, ...P, "-p", "myapp", "-f", files[0], "kill"]);
    expect(mockSpawn.mock.calls.some(c => (c[0] as string[]).includes("rm") && (c[0] as string[]).includes("-f"))).toBe(true);
  });

  it("drawer and bulk: use the stack's profiles, like the dialog", async () => {
    const launch = vi.fn();
    await buildKillStarter(stack)(launch);
    await launch.mock.calls[0][0];
    expect(callWith("kill")?.[0]).toEqual([...base, ...P, "-p", "myapp", "-f", files[0], "kill"]);
  });
});

describe("Start and Stop of a single service", () => {
  it.each([
    ["start", "up", [...base, ...P, "-p", "myapp", "-f", files[0], "up", "-d", "web"]],
    ["stop", "stop", [...base, ...P, "-p", "myapp", "-f", files[0], "stop", "web"]],
  ] as const)("%s runs compose for that service, with the stack's profiles, escalated", async (action, verb, argv) => {
    const { result } = renderHook(() => useServiceActions(stack, vi.fn()));
    await act(() => result.current.doServiceAction(action, "web"));
    const call = callWith(verb);
    expect(call?.[0]).toEqual(argv);
    expect((call?.[1] as { superuser?: string }).superuser).toBe("try");
  });
});
