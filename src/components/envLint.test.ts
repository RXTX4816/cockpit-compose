import { describe, expect, it } from "vitest";

import { lintEnvContent } from "./envLint";

describe("lintEnvContent", () => {
  it("ignores blank lines, comments, and valid assignments", () => {
    const diagnostics = lintEnvContent(
      ["", "# comment", "APP_ENV=production", "_TOKEN=value", "PORT=8080"].join(
        "\n",
      ),
    );

    expect(diagnostics).toEqual([]);
  });

  it("reports lines without an equals sign", () => {
    const diagnostics = lintEnvContent("APP_ENV");

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      from: 0,
      to: 7,
      severity: "error",
      message: "Missing '=': expected KEY=VALUE",
    });
  });

  it("warns when spaces surround an assignment", () => {
    const diagnostics = lintEnvContent("APP_ENV = production");

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      from: 0,
      to: 8,
      severity: "warning",
      message: "Avoid spaces around '='",
    });
  });

  it("warns when a value starts with leading whitespace", () => {
    const diagnostics = lintEnvContent("APP_ENV= production");

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      from: 8,
      to: 19,
      severity: "warning",
      message: "Avoid spaces around '='",
    });
  });

  it("reports invalid key names", () => {
    const diagnostics = lintEnvContent("1APP_ENV=production");

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      from: 0,
      to: 8,
      severity: "error",
      message:
        "Invalid key name: must start with a letter or underscore and contain only letters, digits, or underscores",
    });
  });

  it("warns about duplicate keys", () => {
    const diagnostics = lintEnvContent("APP_ENV=production\nAPP_ENV=local");

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      from: 19,
      to: 26,
      severity: "warning",
      message: "Duplicate key: APP_ENV",
    });
  });
});
