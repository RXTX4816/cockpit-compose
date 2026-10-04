import { describe, it, expect } from "vitest";
import { extractComposeWarning, extractComposeWarnings } from "./composeWarnings";

describe("extractComposeWarning", () => {
  it("reads current Compose's logfmt warnings, unescaping quotes", () => {
    expect(extractComposeWarning(
      'time="2026-10-03T19:36:47+02:00" level=warning msg="service \\"web\\": deploy.update_config: deploy.update_config only applies to rolling updates in Swarm mode"',
    )).toBe('service "web": deploy.update_config: deploy.update_config only applies to rolling updates in Swarm mode');
  });

  it("reads the jobs hint Compose 5.6.0 prints on up", () => {
    expect(extractComposeWarning(
      'time="2026-10-03T19:36:38+02:00" level=warning msg="jobs are not started by up; trigger them with `docker compose run`: migrate"',
    )).toBe("jobs are not started by up; trigger them with `docker compose run`: migrate");
  });

  it("reads the older WARN[0000] style", () => {
    expect(extractComposeWarning("WARN[0000] /srv/app/docker-compose.yml: the attribute `version` is obsolete, it will be ignored"))
      .toBe("/srv/app/docker-compose.yml: the attribute `version` is obsolete, it will be ignored");
  });

  it("ignores progress lines and other log levels", () => {
    expect(extractComposeWarning(" Container web-1 Started")).toBeNull();
    expect(extractComposeWarning('time="…" level=info msg="something"')).toBeNull();
    expect(extractComposeWarning('time="…" level=error msg="boom"')).toBeNull();
  });
});

describe("extractComposeWarnings", () => {
  it("keeps each distinct warning once, in order", () => {
    expect(extractComposeWarnings([
      'level=warning msg="b"',
      " Container web-1 Started",
      "WARN[0000] a",
      'level=warning msg="b"',
    ])).toEqual(["b", "a"]);
  });
});
