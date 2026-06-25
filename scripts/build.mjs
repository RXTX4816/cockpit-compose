import { createEsbuildConfig, copyPatternFlyAssets } from "@rxtx4816/cockpit-plugin-base-react/esbuild.config.base";
import * as esbuild from "esbuild";

await copyPatternFlyAssets("src/assets");
await esbuild.build(createEsbuildConfig({ entryPoint: "src/index.tsx" }));
