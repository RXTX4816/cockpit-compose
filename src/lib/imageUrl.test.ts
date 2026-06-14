import { describe, it, expect } from "vitest";
import { getImageChangelogUrl } from "./imageUrl";

describe("getImageChangelogUrl", () => {
  describe("Docker Hub official images", () => {
    it("handles bare name", () => {
      expect(getImageChangelogUrl("nginx")).toBe("https://hub.docker.com/_/nginx");
    });

    it("handles bare name with tag", () => {
      expect(getImageChangelogUrl("nginx:latest")).toBe("https://hub.docker.com/_/nginx");
    });

    it("handles bare name with version tag", () => {
      expect(getImageChangelogUrl("postgres:16")).toBe("https://hub.docker.com/_/postgres");
    });

    it("handles docker.io/library/ prefix", () => {
      expect(getImageChangelogUrl("docker.io/library/nginx:latest")).toBe("https://hub.docker.com/_/nginx");
    });

    it("handles docker.io/ prefix without library/", () => {
      expect(getImageChangelogUrl("docker.io/nginx")).toBe("https://hub.docker.com/_/nginx");
    });
  });

  describe("GitHub Container Registry", () => {
    it("links to specific release when tag is a version", () => {
      expect(getImageChangelogUrl("ghcr.io/owner/myapp:v1.0")).toBe("https://github.com/owner/myapp/releases/tag/v1.0");
    });

    it("links to specific release for bare version tag", () => {
      expect(getImageChangelogUrl("ghcr.io/linuxserver/jellyfin:10.9.0")).toBe("https://github.com/linuxserver/jellyfin/releases/tag/10.9.0");
    });

    it("links to general releases page for latest tag", () => {
      expect(getImageChangelogUrl("ghcr.io/owner/myapp:latest")).toBe("https://github.com/owner/myapp/releases");
    });

    it("links to general releases page without tag", () => {
      expect(getImageChangelogUrl("ghcr.io/linuxserver/jellyfin")).toBe("https://github.com/linuxserver/jellyfin/releases");
    });

    it("returns null for ghcr.io with only one path segment", () => {
      expect(getImageChangelogUrl("ghcr.io/orphan")).toBeNull();
    });
  });

  describe("Quay.io", () => {
    it("handles quay.io/namespace/name", () => {
      expect(getImageChangelogUrl("quay.io/prometheus/prometheus:v3.0")).toBe("https://quay.io/repository/prometheus/prometheus");
    });

    it("handles quay.io without tag", () => {
      expect(getImageChangelogUrl("quay.io/keycloak/keycloak")).toBe("https://quay.io/repository/keycloak/keycloak");
    });
  });

  describe("Unknown registries", () => {
    it("returns null for unknown registry with hostname", () => {
      expect(getImageChangelogUrl("myregistry.example.com/myapp:latest")).toBeNull();
    });

    it("returns null for registry with port", () => {
      expect(getImageChangelogUrl("localhost:5000/myapp:latest")).toBeNull();
    });
  });
});
