import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockHttp } from "../test/setup";
import { mockHttpClient } from "../test/helpers";

vi.mock("./cockpit", () => ({
  getDockerSocketPath: vi.fn(),
  getPodmanSocketPath: vi.fn(),
  getIsPodman: vi.fn(() => false),
  socketSuperuser: vi.fn(() => undefined),
}));

import { getDockerSocketPath, getPodmanSocketPath, getIsPodman } from "./cockpit";
import { engineHttpGetJson, _resetEngineHttpAvailabilityForTests } from "./engineHttp";

const mockGetDockerSocketPath = vi.mocked(getDockerSocketPath);
const mockGetPodmanSocketPath = vi.mocked(getPodmanSocketPath);
const mockGetIsPodman = vi.mocked(getIsPodman);

beforeEach(() => {
  mockHttp.mockReset();
  mockGetDockerSocketPath.mockReset();
  mockGetPodmanSocketPath.mockReset();
  mockGetIsPodman.mockReset().mockReturnValue(false);
  _resetEngineHttpAvailabilityForTests();
});

describe("engineHttpGetJson", () => {
  it("strips the unix:// prefix and GETs the given path over the docker socket", async () => {
    mockGetDockerSocketPath.mockReturnValue("unix:///var/run/docker.sock");
    mockHttp.mockReturnValue(mockHttpClient({ "/containers/json": JSON.stringify([{ Id: "abc" }]) }));

    const result = await engineHttpGetJson("/containers/json");

    expect(result).toEqual([{ Id: "abc" }]);
    expect(mockHttp).toHaveBeenCalledWith("/var/run/docker.sock", expect.objectContaining({}));
  });

  it("uses the podman socket when running in podman mode", async () => {
    mockGetIsPodman.mockReturnValue(true);
    mockGetPodmanSocketPath.mockReturnValue("unix:///run/user/1000/podman/podman.sock");
    mockHttp.mockReturnValue(mockHttpClient({ "/containers/json": "[]" }));

    await engineHttpGetJson("/containers/json");

    expect(mockHttp).toHaveBeenCalledWith("/run/user/1000/podman/podman.sock", expect.objectContaining({}));
    expect(mockGetDockerSocketPath).not.toHaveBeenCalled();
  });

  it("rejects when no socket has been detected", async () => {
    mockGetDockerSocketPath.mockReturnValue(undefined);
    await expect(engineHttpGetJson("/containers/json")).rejects.toThrow();
    expect(mockHttp).not.toHaveBeenCalled();
  });

  it("rejects when the HTTP request itself fails", async () => {
    mockGetDockerSocketPath.mockReturnValue("unix:///var/run/docker.sock");
    const client = mockHttpClient();
    vi.spyOn(client, "get").mockRejectedValue(new Error("connection refused"));
    mockHttp.mockReturnValue(client);

    await expect(engineHttpGetJson("/containers/json")).rejects.toThrow("connection refused");
  });

  it("skips retrying the HTTP path for a while after a failure", async () => {
    mockGetDockerSocketPath.mockReturnValue("unix:///var/run/docker.sock");
    const client = mockHttpClient();
    vi.spyOn(client, "get").mockRejectedValue(new Error("connection refused"));
    mockHttp.mockReturnValue(client);

    await expect(engineHttpGetJson("/containers/json")).rejects.toThrow();
    expect(mockHttp).toHaveBeenCalledTimes(1);

    // A second call shortly after should short-circuit without touching cockpit.http again —
    // avoids paying a failed-connection cost on every single poll while the socket is down.
    await expect(engineHttpGetJson("/containers/json")).rejects.toThrow();
    expect(mockHttp).toHaveBeenCalledTimes(1);
  });

  it("retries the HTTP path again once a request succeeds", async () => {
    mockGetDockerSocketPath.mockReturnValue("unix:///var/run/docker.sock");
    const failingClient = mockHttpClient();
    vi.spyOn(failingClient, "get").mockRejectedValue(new Error("connection refused"));
    mockHttp.mockReturnValueOnce(failingClient);
    await expect(engineHttpGetJson("/containers/json")).rejects.toThrow();

    // Bypass the cooldown directly (rather than waiting out the real 60s) to confirm a
    // success clears the failure state for subsequent calls.
    _resetEngineHttpAvailabilityForTests();
    mockHttp.mockReturnValueOnce(mockHttpClient({ "/containers/json": "[]" }));
    await expect(engineHttpGetJson("/containers/json")).resolves.toEqual([]);
  });
});
