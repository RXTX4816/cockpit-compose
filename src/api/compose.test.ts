import { describe, it, expect, vi, afterEach } from "vitest";
import * as cockpitMod from "./cockpit";
import { declaredJobs } from "./compose";

const FILE = "services:\n  web:\n    image: nginx\njobs:\n  migrate:\n    image: app\n    manual: true\n";

afterEach(() => vi.restoreAllMocks());

describe("declaredJobs", () => {
  it("lists the jobs a compose file declares", () => {
    vi.spyOn(cockpitMod, "composeIsLimitedBackend").mockReturnValue(false);
    expect(declaredJobs(FILE).map(j => j.name)).toEqual(["migrate"]);
  });

  it("lists none on podman-compose, which has no jobs", () => {
    vi.spyOn(cockpitMod, "composeIsLimitedBackend").mockReturnValue(true);
    expect(declaredJobs(FILE)).toEqual([]);
  });
});
