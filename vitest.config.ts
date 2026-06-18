import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    pool: "forks",
    maxWorkers: 4,
    minWorkers: 2,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/index.tsx",
        "src/cockpit-dark-theme.ts",
        "src/api/stacks/**",
        "src/api/types.ts",
        "src/api/templates.ts",
        "src/api/index.ts",
        "src/components/Downed/index.ts",
        "src/components/Modals/index.ts",
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
});
