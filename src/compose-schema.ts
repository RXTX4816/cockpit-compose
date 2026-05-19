import Ajv from "ajv";

const composeSchema = {
  type: "object",
  properties: {
    version: { type: ["string", "number"] },
    services: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          image: { type: "string" },
          build: { oneOf: [{ type: "string" }, { type: "object" }] },
          container_name: { type: "string" },
          ports: { type: "array" },
          environment: { oneOf: [{ type: "object" }, { type: "array" }] },
          volumes: { type: "array" },
          networks: { oneOf: [{ type: "array" }, { type: "object" }] },
          depends_on: { oneOf: [{ type: "array" }, { type: "object" }] },
          restart_policy: { oneOf: [{ type: "string" }, { type: "object" }] },
          restart: { type: "string" },
          working_dir: { type: "string" },
          command: { oneOf: [{ type: "string" }, { type: "array" }] },
          entrypoint: { oneOf: [{ type: "string" }, { type: "array" }] },
          expose: { type: "array" },
          labels: { oneOf: [{ type: "object" }, { type: "array" }] },
          cpus: { type: ["string", "number"] },
          cpu_shares: { type: "integer" },
          cpu_quota: { type: "integer" },
          cpu_period: { type: "integer" },
          cpuset: { type: "string" },
          mem_limit: { type: ["string", "integer"] },
          memswap_limit: { type: ["string", "integer"] },
          mem_reservation: { type: ["string", "integer"] },
          stdin_open: { type: "boolean" },
          tty: { type: "boolean" },
          privileged: { type: "boolean" },
          user: { type: "string" },
          hostname: { type: "string" },
          domainname: { type: "string" },
          ipc: { type: "string" },
          pid: { type: "string" },
          ulimits: { oneOf: [{ type: "object" }, { type: "array" }] },
          logging: { type: "object" },
          healthcheck: { type: "object" },
          cap_add: { type: "array" },
          cap_drop: { type: "array" },
          extends: { oneOf: [{ type: "string" }, { type: "object" }] },
          pull_policy: { type: "string" },
          profiles: { type: "array" },
          platform: { type: "string" },
          security_opt: { type: "array" },
          extra_hosts: { oneOf: [{ type: "array" }, { type: "object" }] },
          shm_size: { type: ["string", "integer"] },
          network_mode: { type: "string" },
          sysctls: { oneOf: [{ type: "object" }, { type: "array" }] },
          deploy: { type: "object" },
          links: { type: "array" },
          dns: { oneOf: [{ type: "string" }, { type: "array" }] },
          init: { type: "boolean" },
          stop_signal: { type: "string" },
          stop_grace_period: { type: "string" },
          runtime: { type: "string" },
          devices: { type: "array" },
          tmpfs: { oneOf: [{ type: "string" }, { type: "array" }] },
          annotations: { oneOf: [{ type: "object" }, { type: "array" }] },
          read_only: { type: "boolean" },
          scale: { type: "integer" },
          env_file: { oneOf: [{ type: "string" }, { type: "array" }] },
          secrets: { type: "array" },
          configs: { type: "array" },
          external_links: { type: "array" },
          group_add: { type: "array" },
          isolation: { type: "string" },
          oom_kill_disable: { type: "boolean" },
          oom_score_adj: { type: "integer" },
          pids_limit: { type: "integer" },
          userns_mode: { type: "string" },
          volumes_from: { type: "array" },
        },
        additionalProperties: true,
      },
    },
    networks: { type: "object" },
    volumes: { type: "object" },
    secrets: { type: "object" },
    configs: { type: "object" },
  },
  additionalProperties: false,
};

const ajv = new Ajv({ strictTypes: false, useDefaults: false });
const validateCompose = ajv.compile(composeSchema);

export function validateComposeSpec(data: unknown): string[] {
  const errors: string[] = [];
  const valid = validateCompose(data);

  if (!valid && validateCompose.errors) {
    validateCompose.errors.forEach((err) => {
      if (err.keyword === "additionalProperties") {
        const path = err.instancePath || "/";
        const params = err.params as Record<string, unknown>;
        const extra = params.additionalProperty as string;
        errors.push(`${path || "root"}: unknown property "${extra}"`);
      } else {
        const path = err.instancePath || "/";
        errors.push(`${path || "root"}: ${err.message}`);
      }
    });
  }

  return errors;
}
