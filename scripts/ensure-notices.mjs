// Guarantees src/generated/third-party-notices.json exists.
//
// AppFooter imports that file so the licenses modal can show every bundled package's
// license text, but the file is generated from the esbuild metafile — i.e. by the very
// build that consumes it. On a clean checkout (and for typecheck / vitest / watch, which
// never run the notices generator) there is nothing to import, so seed an empty one.
// A real build overwrites it; see scripts/build.mjs.

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

export const NOTICES_PATH = "src/generated/third-party-notices.json";

// Deliberately no `generatedAt`: nothing has been generated yet, and the field is
// optional, so omitting it keeps the placeholder assignable to NoticesData.
const PLACEHOLDER = {
  bundle: "main.js",
  packageCount: 0,
  licenses: [],
  packages: [],
};

export async function ensureNotices(path = NOTICES_PATH) {
  if (existsSync(path)) return false;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(PLACEHOLDER, null, 2) + "\n");
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const wrote = await ensureNotices();
  if (wrote) console.log(`Seeded placeholder ${NOTICES_PATH} (run a build for the real one)`);
}
