import { createVitestConfig } from "@rxtx4816/cockpit-plugin-base-react/vitest.config.base";

export default createVitestConfig({
  pool: "forks",
  minWorkers: 2,
  setupFiles: ["./src/test/setup.ts"],
  coverage: {
    exclude: [
      "src/test/**",
      "src/**/*.test.{ts,tsx}",
      "src/index.tsx",
      "src/api/stacks/**",
      "src/api/types.ts",
      "src/api/templates.ts",
      "src/api/index.ts",
      "src/components/Downed/index.ts",
      "src/components/Modals/index.ts",
    ],
  },
});
