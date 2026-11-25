import { runWatch } from "@rxtx4816/cockpit-plugin-base-react/esbuild.config.base";
import * as esbuild from "esbuild";
import { ensureNotices } from "./ensure-notices.mjs";

// AppFooter imports the notices JSON; only a full build regenerates it.
await runWatch({ esbuild, beforeBuild: ensureNotices });
