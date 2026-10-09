import test from "node:test";
import assert from "node:assert/strict";
import { deriveQuoteMetrics, compareSameTicker, withSlippageVsBaseline } from "./measure-quotes.mjs";

const asset = {
  ticker: "NVDA", platformId: "ondo", tokenSymbol: "NVDAon",
  tokenContractAddress: "0x1111111111111111111111111111111111111111",
  referencePrice: 100, tokenToShareRatio: 1, adjustedSpreadPct: 0, volume24H: 5000
};

test("quote metric compares a quote-derived token price to reference times ratio", () => {
  const row = deriveQuoteMetrics(asset, { amountIn: "100", amountOut: "0.98", priceImpact: "0.0123", routeTypes: ["V2"] }, 37);
  assert.equal(row.quotePriceUSDTPerToken, 102.04081633);
  assert.equal(row.onchainGapPct, 2.040816);
  assert.equal(row.priceImpactPct, 1.23);
  assert.equal(row.quoteLatencyMs, 37);
  assert.equal(row.routeAvailable, true);
});

test("no route yields explicit status and never a fabricated zero gap", () => {
  const row = deriveQuoteMetrics(asset, null, 19, "NO_ROUTE");
  assert.equal(row.routeStatus, "NO_ROUTE");
  assert.equal(row.routeAvailable, false);
  assert.equal(row.onchainGapPct, null);
  assert.equal(row.quotePriceUSDTPerToken, null);
});

test("same ticker comparison includes venue route status, volume and on-chain gap", () => {
  const ondo = { ...deriveQuoteMetrics(asset, { amountIn: "10", amountOut: "0.1", priceImpact: "0.001" }, 10), sizeUSDT: 10 };
  const bstock = { ...deriveQuoteMetrics({ ...asset, platformId: "bstock", volume24H: 2000 }, null, 20, "NO_ROUTE"), sizeUSDT: 10 };
  const [comparison] = compareSameTicker([ondo, bstock]);
  assert.equal(comparison.ticker, "NVDA");
  assert.equal(comparison.ondoAvailable, true);
  assert.equal(comparison.bstockAvailable, false);
  assert.equal(comparison.bothRouted, false);
  assert.equal(comparison.ondoVolume24H, 5000);
  assert.equal(comparison.bstockVolume24H, 2000);
});

test("quote size slippage is measured against the same venue's 10 USDT quote", () => {
  const rows = withSlippageVsBaseline([
    { ticker: "NVDA", platformId: "ondo", sizeUSDT: 10, routeAvailable: true, quotePriceUSDTPerToken: 100 },
    { ticker: "NVDA", platformId: "ondo", sizeUSDT: 100, routeAvailable: true, quotePriceUSDTPerToken: 101 },
    { ticker: "NVDA", platformId: "bstock", sizeUSDT: 100, routeAvailable: false, quotePriceUSDTPerToken: null }
  ]);
  assert.equal(rows[0].slippageVs10USDTPct, 0);
  assert.equal(rows[1].slippageVs10USDTPct, 1);
  assert.equal(rows[2].slippageVs10USDTPct, null);
});
