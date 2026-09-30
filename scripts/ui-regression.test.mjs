import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const app = read("desk-app.js");
const walletConnect = read("wallet-connect.js");
const onchain = read("desk-onchain.js");
const html = read("index.html");
const css = read("desk.css");

test("POA reader receives the current proof object", () => {
  assert.match(app, /currentPOA=j\.proof;window\.currentPOA=j\.proof/);
});

test("POA anchor gate uses the resolved wallet chain", () => {
  assert.match(app, /const\s*\{\s*api\s*,\s*address\s*,\s*chainId\s*\}\s*=\s*await resolveWalletForAnchor\(\)/);
  assert.match(app, /Number\(chainId \|\| walletChainId \|\| 0\)!==56/);
});
