import { createWatchConfig, copyPatternFlyAssets } from "@rxtx4816/cockpit-plugin-base-react/esbuild.config.base";
import * as esbuild from "esbuild";
import { ensureNotices } from "./ensure-notices.mjs";

await copyPatternFlyAssets("src/assets");
// AppFooter imports this; only a full build regenerates it.
await ensureNotices();
const ctx = await esbuild.context(createWatchConfig({ entryPoint: "src/index.tsx" }));
await ctx.watch();
console.log("Watching for changes...");
