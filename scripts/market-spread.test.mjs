import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { assessQuote, calculateAdjustedSpreadPct, calculateSpreadPct, normalizeAsset, resolveShareRatio } = require("../lib/market");
const { buildGuardChecks } = require("../lib/policy");

// CRWD/NOW/PPLT/GME use the ratio multipliers reported in the live RWA snapshot.
// MSFT, SOXS and ETHA exercise ratio=1, ratio<1 and fractional ratio cases.
// These deterministic fixtures test math, not current exchange quotes.
const fixtures = [
  { ticker: "CRWD", token: 400, reference: 100, ratio: 4, raw: 300 },
  { ticker: "NOW", token: 500, reference: 100, ratio: 5, raw: 400 },
  { ticker: "PPLT", token: 1000, reference: 100, ratio: 10, raw: 900 },
  { ticker: "GME", token: 101.7138, reference: 100, ratio: 1.017138, raw: 1.7138 },
  { ticker: "MSFT", token: 512.3, reference: 512.3, ratio: 1, raw: 0 },
  { ticker: "SOXS", token: 10, reference: 100, ratio: 0.1, raw: -90 },
  { ticker: "ETHA", token: 33.33, reference: 100, ratio: 0.3333, raw: -66.67 }
];

test("ratio-adjusted spread removes token-to-share multiplier from seven RWA examples", () => {
  for (const item of fixtures) {
    const quote = assessQuote(item.token, item.reference, item.ratio);
    assert.equal(quote.rawSpreadPct, item.raw, item.ticker + " raw spread");
    assert.ok(Math.abs(quote.adjustedSpreadPct) < 0.04, item.ticker + " adjusted spread");
    assert.equal(quote.spreadPct, quote.adjustedSpreadPct, item.ticker + " compatibility field is adjusted");
    assert.equal(quote.shareRatio, item.ratio, item.ticker + " share ratio retained");
    assert.equal(quote.dataQuality, "ok", item.ticker + " quality");
    assert.equal(quote.actionable, false, item.ticker + " zero/rounding-only gap is not actionable");
    assert.equal(quote.minActionableGapPct, 1, item.ticker + " reports configurable threshold");
  }
});

test("actionable requires a meaningful configured gap", () => {
  const zero = assessQuote(100, 100, 1);
  assert.equal(zero.adjustedSpreadPct, 0);
  assert.equal(zero.actionable, false);
  const atThreshold = assessQuote(101, 100, 1);
  assert.equal(atThreshold.adjustedSpreadPct, 1);
  assert.equal(atThreshold.actionable, true);
  assert.equal(atThreshold.minActionableGapPct, 1);
});

test("raw and adjusted spread helpers have explicit semantics", () => {
  assert.equal(calculateSpreadPct(400, 100), 300);
  assert.equal(calculateAdjustedSpreadPct(400, 100, 4), 0);
  assert.equal(calculateAdjustedSpreadPct(10, 100, 0.1), 0);
  assert.equal(calculateAdjustedSpreadPct(100, 100, 0), null);
});

test("share ratio resolution falls through invalid price/search fields to the live token-list ratio", () => {
  assert.equal(resolveShareRatio(null, 0, "not-a-ratio", 4), 4);
  assert.equal(resolveShareRatio(undefined, -1, Infinity, "0.125"), 0.125);
  assert.equal(resolveShareRatio(null, "", 0, -1, NaN), null);
});

test("missing or invalid share ratio is never actionable", () => {
  for (const ratio of [undefined, null, 0, -1, NaN, Infinity, "not-a-ratio"]) {
    const quote = assessQuote(101, 100, ratio);
    assert.equal(quote.dataQuality, "missing_ratio");
    assert.equal(quote.adjustedSpreadPct, null);
    assert.equal(quote.actionable, false);
  }
});

test("normalizeAsset retains raw spread and exposes adjusted spread as spreadPct", () => {
  const asset = normalizeAsset({
    ticker: "CRWD",
    tokenPrice: 400,
    referencePrice: 100,
    tokenToShareRatio: 4
  });
  assert.equal(asset.rawSpreadPct, 300);
  assert.equal(asset.adjustedSpreadPct, 0);
  assert.equal(asset.spreadPct, 0);
  assert.equal(asset.shareRatio, 4);
  assert.equal(asset.tokenToShareRatio, 4);
});

test("execution policy blocks missing ratio even when prices and spend cap are valid", () => {
  const checks = buildGuardChecks({
    ticker: "CRWD",
    platformId: "bstock",
    tokenContractAddress: "0x1111111111111111111111111111111111111111",
    network: "BSC",
    tokenPrice: 400,
    referencePrice: 100,
    dataQuality: "missing_ratio"
  }, { amount: 10, maxSpend: 100 });
  assert.equal(checks.find((x) => x.id === "share_ratio").pass, false);
  assert.equal(checks.find((x) => x.id === "data_quality").pass, false);
});
