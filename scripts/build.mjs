import { runBuild } from "@rxtx4816/cockpit-plugin-base-react/esbuild.config.base";
import * as esbuild from "esbuild";
import { ensureNotices, NOTICES_PATH } from "./ensure-notices.mjs";

// AppFooter imports the generated notices JSON (for the licenses modal), so the build runs
// twice: the first pass tells us which packages got bundled, the second embeds the result.
await runBuild({
  esbuild,
  product: "cockpit-compose",
  beforeBuild: ensureNotices,
  embedNotices: true,
  // The .txt stays at the repo root for packaging (%doc, debian/docs, PKGBUILD);
  // the JSON goes where the bundle can import it, with the license texts included.
  notices: { jsonOut: NOTICES_PATH, includeText: true },
});
