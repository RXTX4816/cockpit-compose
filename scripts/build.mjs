import {
  createEsbuildConfig,
  copyPatternFlyAssets,
  writeThirdPartyNotices,
} from "@rxtx4816/cockpit-plugin-base-react/esbuild.config.base";
import * as esbuild from "esbuild";

await copyPatternFlyAssets("src/assets");
const result = await esbuild.build(
  createEsbuildConfig({ entryPoint: "src/index.tsx", metafile: true }),
);
await writeThirdPartyNotices({
  metafile: result.metafile,
  product: "cockpit-compose",
  strict: true,
});
