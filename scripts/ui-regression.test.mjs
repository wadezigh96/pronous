import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const onchain = readFileSync("desk-onchain.js", "utf8");
const css = readFileSync("desk.css", "utf8");
const api = readFileSync("api/onchain.js", "utf8");

test("on-chain script loads after desk app", () => assert.ok(html.indexOf('/desk-app.js') < html.indexOf('/desk-onchain.js')));
test("on-chain auto renderer exists", () => { assert.match(onchain, /async function loadOnchain\(asset\)/); assert.match(onchain, /autoLoadOnchain\(\)/); assert.match(onchain, /\/api\/onchain\?chain=56&token=/); });
test("on-chain density styles exist", () => { assert.match(css, /PRONOUS ON-CHAIN DENSITY REPAIR/); assert.match(css, /\.onchain-kpis/); assert.match(css, /\.onchain-columns/); });
test("on-chain API remains BSC-only", () => { assert.match(api, /Only BSC mainnet is supported/); assert.match(api, /isAddress\(token\)/); });
