import test from "node:test";
import assert from "node:assert/strict";
import { analyzeRows } from "./verify-derived-price.mjs";

test("derived-price analyzer counts exact derived-price matches and invalid inputs", () => {
  const report = analyzeRows([
    { ticker: "NVDA", platformId: "ondo", tokenPrice: 100, referencePrice: 50, tokenToShareRatio: 2 },
    { ticker: "TSLA", platformId: "bstock", tokenPrice: 99, referencePrice: 50, tokenToShareRatio: 2 },
    { ticker: "BAD", platformId: "ondo", tokenPrice: 10, referencePrice: 10, tokenToShareRatio: null }
  ], { endpoint: "fixture", mode: "test", total: 3 });
  assert.equal(report.summary.assetsAnalyzed, 3);
  assert.equal(report.summary.validRatioAndPrices, 2);
  assert.equal(report.summary.invalidInputs, 1);
  assert.equal(report.summary.outlierCount, 1);
  assert.equal(report.assets[0].deviationPct, 0);
  assert.equal(report.assets[2].qualityFlag, "INVALID_INPUT");
  assert.equal(report.histogram.invalid, 1);
});

test("derived-price analyzer has no false-positive outlier at its configured tolerance", () => {
  const report = analyzeRows([
    { ticker: "A", platformId: "ondo", tokenPrice: 100.00001, referencePrice: 100, tokenToShareRatio: 1 }
  ], { endpoint: "fixture", mode: "test", total: 1 });
  assert.equal(report.summary.outlierCount, 0);
});
