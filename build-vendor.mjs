import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";

await mkdir("vendor", { recursive: true });
await build({
  entryPoints: ["vendor/privy-entry.jsx"],
  outfile: "vendor/privy-bundle.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  sourcemap: false,
  legalComments: "none",
});
await writeFile("vendor/.gitkeep", "");
console.log("Built vendor/privy-bundle.js");
