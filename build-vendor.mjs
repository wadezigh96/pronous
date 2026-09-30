import { mkdir, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";

const outfile = "vendor/privy-bundle.js";
await mkdir("vendor", { recursive: true });

let build;
try {
  ({ build } = await import("esbuild"));
} catch (err) {
  try {
    await access(outfile, constants.R_OK);
    console.log("esbuild not installed; using existing vendor/privy-bundle.js");
    process.exit(0);
  } catch (_) {
    console.error("esbuild is required to build vendor/privy-bundle.js:", err.message);
    process.exit(1);
  }
}

await build({
  entryPoints: ["vendor/privy-entry.jsx"],
  outfile,
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
