import { describe, it, expect } from "vitest";
import { groupPodmanContainers } from "./query";

describe("groupPodmanContainers", () => {
  it("groups single-container project", () => {
    const result = groupPodmanContainers([
      { State: "running", Labels: { "com.docker.compose.project": "myapp", "com.docker.compose.project.config_files": "/myapp/compose.yml" } },
    ]);
    expect(result).toEqual([{ Name: "myapp", Status: "running(1)", ConfigFiles: "/myapp/compose.yml" }]);
  });

  it("groups multi-container project into single entry", () => {
    const result = groupPodmanContainers([
      { State: "running", Labels: { "com.docker.compose.project": "myapp", "com.docker.compose.project.config_files": "/myapp/compose.yml" } },
      { State: "running", Labels: { "com.docker.compose.project": "myapp", "com.docker.compose.project.config_files": "/myapp/compose.yml" } },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].Status).toBe("running(2)");
  });

  it("produces mixed status when containers have different states", () => {
    const result = groupPodmanContainers([
      { State: "running", Labels: { "com.docker.compose.project": "myapp", "com.docker.compose.project.config_files": "/myapp/compose.yml" } },
      { State: "exited", Labels: { "com.docker.compose.project": "myapp", "com.docker.compose.project.config_files": "/myapp/compose.yml" } },
    ]);
    expect(result[0].Status).toBe("exited(1), running(1)");
  });

  it("handles multiple distinct projects", () => {
    const result = groupPodmanContainers([
      { State: "running", Labels: { "com.docker.compose.project": "alpha", "com.docker.compose.project.config_files": "/alpha/compose.yml" } },
      { State: "exited", Labels: { "com.docker.compose.project": "beta", "com.docker.compose.project.config_files": "/beta/compose.yml" } },
    ]);
    expect(result).toHaveLength(2);
    expect(result.find(r => r.Name === "alpha")?.Status).toBe("running(1)");
    expect(result.find(r => r.Name === "beta")?.Status).toBe("exited(1)");
  });

  it("skips containers without the project label", () => {
    const result = groupPodmanContainers([
      { State: "running", Labels: {} },
      { State: "running", Labels: { "com.docker.compose.project": "myapp", "com.docker.compose.project.config_files": "/myapp/compose.yml" } },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].Name).toBe("myapp");
  });

  it("returns empty array for empty input", () => {
    expect(groupPodmanContainers([])).toEqual([]);
  });

  it("uses config_files from the first container seen for a project", () => {
    const result = groupPodmanContainers([
      { State: "running", Labels: { "com.docker.compose.project": "myapp", "com.docker.compose.project.config_files": "/first/compose.yml" } },
      { State: "running", Labels: { "com.docker.compose.project": "myapp", "com.docker.compose.project.config_files": "/first/compose.yml" } },
    ]);
    expect(result[0].ConfigFiles).toBe("/first/compose.yml");
  });

  // podman-compose (Python) may record a bare relative filename in config_files (whatever was
  // passed on the CLI), unlike docker compose / podman compose v2 which always store an absolute
  // path. Resolving against the working_dir label (also standard) prevents every subsequent
  // action from failing with "missing files" once the process's cwd doesn't match.
  it("resolves a relative config_files entry against the working_dir label", () => {
    const result = groupPodmanContainers([
      {
        State: "running",
        Labels: {
          "com.docker.compose.project": "gotify",
          "com.docker.compose.project.config_files": "docker-compose.yml",
          "com.docker.compose.project.working_dir": "/home/test/testcompose/gotify",
        },
      },
    ]);
    expect(result[0].ConfigFiles).toBe("/home/test/testcompose/gotify/docker-compose.yml");
  });

  it("resolves multiple comma-separated relative config_files entries", () => {
    const result = groupPodmanContainers([
      {
        State: "running",
        Labels: {
          "com.docker.compose.project": "myapp",
          "com.docker.compose.project.config_files": "docker-compose.yml,overrides.yml",
          "com.docker.compose.project.working_dir": "/home/test/testcompose/myapp",
        },
      },
    ]);
    expect(result[0].ConfigFiles).toBe(
      "/home/test/testcompose/myapp/docker-compose.yml,/home/test/testcompose/myapp/overrides.yml",
    );
  });

  it("leaves an already-absolute config_files entry untouched even with a working_dir label present", () => {
    const result = groupPodmanContainers([
      {
        State: "running",
        Labels: {
          "com.docker.compose.project": "myapp",
          "com.docker.compose.project.config_files": "/myapp/compose.yml",
          "com.docker.compose.project.working_dir": "/somewhere/else",
        },
      },
    ]);
    expect(result[0].ConfigFiles).toBe("/myapp/compose.yml");
  });

  it("leaves a relative config_files entry as-is when no working_dir label is present", () => {
    const result = groupPodmanContainers([
      {
        State: "running",
        Labels: {
          "com.docker.compose.project": "myapp",
          "com.docker.compose.project.config_files": "docker-compose.yml",
        },
      },
    ]);
    expect(result[0].ConfigFiles).toBe("docker-compose.yml");
  });

  it("strips a trailing slash from working_dir before joining", () => {
    const result = groupPodmanContainers([
      {
        State: "running",
        Labels: {
          "com.docker.compose.project": "myapp",
          "com.docker.compose.project.config_files": "docker-compose.yml",
          "com.docker.compose.project.working_dir": "/home/test/testcompose/myapp/",
        },
      },
    ]);
    expect(result[0].ConfigFiles).toBe("/home/test/testcompose/myapp/docker-compose.yml");
  });
});
