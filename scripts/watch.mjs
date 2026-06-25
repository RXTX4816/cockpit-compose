import { createWatchConfig, copyPatternFlyAssets } from "@rxtx4816/cockpit-plugin-base-react/esbuild.config.base";
import * as esbuild from "esbuild";

await copyPatternFlyAssets("src/assets");
const ctx = await esbuild.context(createWatchConfig({ entryPoint: "src/index.tsx" }));
await ctx.watch();
console.log("Watching for changes...");
