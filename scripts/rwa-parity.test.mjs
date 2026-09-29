import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { compareTokenisedRepresentations, normaliseTicker } = require("../lib/rwa-parity.js");

test("normaliseTicker canonicalises symbols", () => {
  assert.equal(normaliseTicker(" nvda "), "NVDA");
});

test("cross-platform parity compares supported representations only", () => {
  const result = compareTokenisedRepresentations("nvda", [
    { ticker: "NVDA", platformId: "ondo", tokenSymbol: "NVDAon", tokenPrice: "230.75", referencePrice: "230.355", spreadPct: 0.172, dataQuality: "ok", actionable: true },
    { ticker: "NVDA", platformId: "bstock", tokenSymbol: "NVDAB", tokenPrice: "231.25", referencePrice: "230.355", spreadPct: 0.389, dataQuality: "ok", actionable: true },
    { ticker: "NVDA", platformId: "xstocks", tokenSymbol: "NVDAX", tokenPrice: "230.57", referencePrice: "230.355", spreadPct: 0.093, dataQuality: "ok", actionable: true },
    { ticker: "NVDA", platformId: "other", tokenSymbol: "FAKE", tokenPrice: "999", referencePrice: "230", spreadPct: 334, dataQuality: "ok", actionable: true }
  ]);

  assert.equal(result.ticker, "NVDA");
  assert.equal(result.platformCount, 3);
  assert.equal(result.comparable, true);
  assert.equal(result.referencePrice, 230.355);
  assert.equal(result.crossPlatformGapPct, 0.295);
  assert.deepEqual(result.platforms.map(x => x.platformId), ["ondo", "bstock", "xstocks"]);
  assert.equal(result.platforms.every(x => x.available), true);
});

test("missing platform is explicit and does not become a zero-price quote", () => {
  const result = compareTokenisedRepresentations("AAPL", [
    { ticker: "AAPL", platformId: "ondo", tokenSymbol: "AAPLon", tokenPrice: "337.88", referencePrice: "337.25", spreadPct: 0.187, dataQuality: "ok", actionable: true }
  ]);

  assert.equal(result.platformCount, 1);
  assert.equal(result.comparable, false);
  assert.equal(result.platforms[0].available, true);
  assert.equal(result.platforms[1].available, false);
  assert.equal(result.platforms[2].available, false);
  assert.equal(result.crossPlatformGapPct, 0);
});

test("invalid ticker is rejected", () => {
  assert.throws(() => compareTokenisedRepresentations("bad ticker", []), /INVALID_TICKER/);
});
