import { describe, it, expect } from "vitest";
import { validateComposeSpec } from "./compose-schema";

const minimalValid = {
  services: {
    web: { image: "nginx:latest" },
  },
};

describe("validateComposeSpec", () => {
  it("accepts a minimal valid compose spec", () => {
    expect(validateComposeSpec(minimalValid)).toEqual([]);
  });

  it("accepts compose with version field", () => {
    expect(validateComposeSpec({ version: "3.8", ...minimalValid })).toEqual([]);
  });

  it("accepts top-level name: field", () => {
    expect(validateComposeSpec({ name: "my-project", ...minimalValid })).toEqual([]);
  });

  it("rejects non-string top-level name", () => {
    const errors = validateComposeSpec({ name: 42, ...minimalValid });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes("name"))).toBe(true);
  });

  it("accepts services with all common fields", () => {
    const spec = {
      services: {
        app: {
          image: "myapp:latest",
          ports: ["8080:80"],
          environment: { NODE_ENV: "production" },
          volumes: ["./data:/data"],
          restart: "unless-stopped",
          depends_on: ["db"],
          networks: ["default"],
          labels: { "traefik.enable": "true" },
          healthcheck: { test: ["CMD", "curl", "-f", "http://localhost"] },
        },
      },
    };
    expect(validateComposeSpec(spec)).toEqual([]);
  });

  it("accepts services with platform and security_opt (previously missing)", () => {
    const spec = {
      services: {
        app: {
          image: "myapp:latest",
          platform: "linux/amd64",
          security_opt: ["no-new-privileges:true"],
          init: true,
          stop_signal: "SIGTERM",
          read_only: true,
        },
      },
    };
    expect(validateComposeSpec(spec)).toEqual([]);
  });

  it("accepts deploy block for swarm mode", () => {
    const spec = {
      services: {
        app: {
          image: "myapp:latest",
          deploy: { replicas: 2, resources: { limits: { cpus: "0.5" } } },
        },
      },
    };
    expect(validateComposeSpec(spec)).toEqual([]);
  });

  it("returns error for wrong type on image field", () => {
    const spec = { services: { web: { image: 123 } } };
    const errors = validateComposeSpec(spec);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes("image"))).toBe(true);
  });

  it("accepts networks and volumes at top level", () => {
    const spec = {
      services: { web: { image: "nginx" } },
      networks: { default: { driver: "bridge" } },
      volumes: { data: { driver: "local" } },
    };
    expect(validateComposeSpec(spec)).toEqual([]);
  });

  it("returns errors for invalid top-level type (services must be object)", () => {
    const spec = { services: "invalid" };
    const errors = validateComposeSpec(spec);
    expect(errors.length).toBeGreaterThan(0);
  });
});
