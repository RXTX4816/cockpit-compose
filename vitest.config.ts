import { createVitestConfig } from "@rxtx4816/cockpit-plugin-base-react/vitest.config.base";
import { ensureNotices } from "./scripts/ensure-notices.mjs";

// AppFooter imports the generated notices JSON, which only a full build produces.
// Seed it here rather than only from a pretest hook, so a bare `npx vitest` or an
// IDE-launched run resolves the import too.
await ensureNotices();

export default createVitestConfig({
  pool: "forks",
  minWorkers: 2,
  setupFiles: ["./src/test/setup.ts"],
  coverage: {
    // The shared excludes (tests, src/test, src/index.tsx, src/api/index.ts, src/api/types.ts)
    // come from the base.
    exclude: [
      "src/api/stacks/index.ts",
      "src/api/templates.ts",
      "src/components/Downed/index.ts",
      "src/components/Modals/index.ts",
    ],
  },
});
