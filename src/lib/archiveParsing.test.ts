import { describe, it, expect } from "vitest";
import { parseArchiveRootDir, findPrimaryComposeMember, parseComposeName } from "./archiveParsing";

describe("parseArchiveRootDir", () => {
  it("returns null for empty string", () => {
    expect(parseArchiveRootDir("")).toBeNull();
  });

  it("returns null when no entry has a slash", () => {
    expect(parseArchiveRootDir("README.md\ncompose.yaml")).toBeNull();
  });

  it("extracts root dir from first entry with a slash", () => {
    expect(parseArchiveRootDir("myapp/\nmyapp/compose.yaml\nmyapp/.env")).toBe("myapp");
  });

  it("handles leading whitespace on lines", () => {
    const contents = "myapp/compose.yaml";
    expect(parseArchiveRootDir(contents)).toBe("myapp");
  });
});

describe("findPrimaryComposeMember", () => {
  it("returns null when no compose file found", () => {
    expect(findPrimaryComposeMember("myapp/README.md\nmyapp/.env", "myapp")).toBeNull();
  });

  it("finds compose.yaml as primary", () => {
    const contents = "myapp/docker-compose.yml\nmyapp/compose.yaml";
    expect(findPrimaryComposeMember(contents, "myapp")).toBe("myapp/compose.yaml");
  });

  it("respects precedence: compose.yaml > compose.yml > docker-compose.yaml > docker-compose.yml", () => {
    const contents = "myapp/docker-compose.yml\nmyapp/docker-compose.yaml\nmyapp/compose.yml\nmyapp/compose.yaml";
    expect(findPrimaryComposeMember(contents, "myapp")).toBe("myapp/compose.yaml");
  });

  it("falls back to docker-compose.yml when others absent", () => {
    const contents = "myapp/docker-compose.yml\nmyapp/README.md";
    expect(findPrimaryComposeMember(contents, "myapp")).toBe("myapp/docker-compose.yml");
  });

  it("ignores entries from different root dirs", () => {
    const contents = "otherapp/compose.yaml\nmyapp/docker-compose.yml";
    expect(findPrimaryComposeMember(contents, "myapp")).toBe("myapp/docker-compose.yml");
  });
});

describe("parseComposeName", () => {
  it("returns null when no name field", () => {
    expect(parseComposeName("services:\n  web:\n    image: nginx")).toBeNull();
  });

  it("extracts name from YAML content", () => {
    expect(parseComposeName("name: myapp\nservices:\n  web:\n    image: nginx")).toBe("myapp");
  });

  it("only matches name at the start of a line", () => {
    expect(parseComposeName("  name: indented")).toBeNull();
  });
});
