import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { assessQuote, calculateAdjustedSpreadPct, calculateImpactAdjustedGapPct, calculateSpreadPct, normalizeAsset, resolveShareRatio, resolveAssetShareRatio, isMarketClosed, classifyAssetSignal } = require("../lib/market");
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


test("NVDA and CRWD recover share ratios when price and search fixtures omit them", () => {
  const fixtures = [
    { ticker: "NVDA", platformId: "ondo", address: "0x1111111111111111111111111111111111111111", ratio: 1, listAddressMatches: true },
    { ticker: "CRWD", platformId: "ondo", address: "0x2222222222222222222222222222222222222222", ratio: 4, listAddressMatches: false }
  ];
  for (const f of fixtures) {
    const price = { tokenPrice: f.ticker === "CRWD" ? 1100 : 100, referencePrice: f.ticker === "CRWD" ? 275 : 100, tokenToShareRatio: null, shareRatio: null };
    const search = { ticker: f.ticker, platformId: f.platformId, tokenContractAddress: f.address, tokenToShareRatio: null, shareRatio: null };
    const tokenList = [{ ticker:f.ticker,underlyingTicker:f.ticker,platformId:f.platformId,
      tokenContractAddress:f.listAddressMatches?f.address:"0x3333333333333333333333333333333333333333",tokenToShareRatio:f.ratio }];
    const result = resolveAssetShareRatio({price,search,tokenList,tokenAddress:f.address,platformId:f.platformId,ticker:f.ticker});
    assert.equal(result.shareRatio,f.ratio,f.ticker+" fallback ratio");
    assert.equal(result.source,"rwa-tokens-list",f.ticker+" fallback source");
    assert.equal(result.feedAsset.ticker,f.ticker);
    const quality=assessQuote(price.tokenPrice,price.referencePrice,result.shareRatio);
    assert.equal(quality.dataQuality,"ok",f.ticker+" no longer missing_ratio");
    assert.equal(quality.actionable,false);
  }
});

test("price and search ratio precedence is maintained before full-list fallback", () => {
  const tokenList=[{ticker:"NVDA",platformId:"ondo",tokenToShareRatio:9}];
  assert.deepEqual(resolveAssetShareRatio({price:{tokenToShareRatio:2},search:{tokenToShareRatio:3},tokenList,ticker:"NVDA",platformId:"ondo"}),{shareRatio:2,source:"price",feedAsset:null});
  assert.equal(resolveAssetShareRatio({price:{},search:{shareRatio:3},tokenList,ticker:"NVDA",platformId:"ondo"}).source,"search");
});

test("closed sessions expose OFF_HOURS_DRIFT and remain non-actionable", () => {
  const asset={ticker:"NVDA",dataQuality:"ok",adjustedSpreadPct:2.5,shareRatio:1,actionable:false,marketStatus:"postmarket",openState:true};
  assert.equal(isMarketClosed(asset),true);
  assert.equal(classifyAssetSignal(asset),"OFF_HOURS_DRIFT");
  assert.equal(asset.actionable,false);
  assert.equal(isMarketClosed({marketStatus:"open",openState:true}),false);
  assert.equal(classifyAssetSignal({dataQuality:"missing_ratio",marketStatus:"postmarket"}),"MISSING_RATIO");
});


test("impact-adjusted quote gap removes the quote's reported fractional price impact", () => {
  assert.equal(calculateImpactAdjustedGapPct(102, 0.02, 100, 1), 0);
  assert.equal(calculateImpactAdjustedGapPct(104, 0.02, 100, 1), 1.960784);
  assert.equal(calculateImpactAdjustedGapPct(null, 0.02, 100, 1), null);
  assert.equal(calculateImpactAdjustedGapPct(102, null, 100, 1), null);
  assert.equal(calculateImpactAdjustedGapPct(102, -1, 100, 1), null);
});
