#!/usr/bin/env node
/**
 * One-off live response-contract check. Read-only: GET only; no wallet, quote
 * submission, signing, calldata or transaction path.
 */
import assert from "node:assert/strict";

const base = process.env.PRONOUS_BASE_URL || "https://pronous.vercel.app";
async function getJson(path) {
  const url = new URL(path, base).toString();
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "PRONOUS-production-contract-verifier/1.0" },
    signal: AbortSignal.timeout(30000)
  });
  const payload = await response.json().catch(() => null);
  return { url, response, payload };
}

const scan = await getJson("/api/agent?action=scan&ticker=CRWD");
const s = scan.payload;
const scanResult = {
  checkedUrl: scan.url,
  httpStatus: scan.response.status,
  contentType: scan.response.headers.get("content-type"),
  topLevelKeys: s && typeof s === "object" ? Object.keys(s) : [],
  action: s?.action ?? null,
  mode: s?.mode ?? null,
  ticker: s?.ticker ?? null,
  hasAsset: Boolean(s?.asset && typeof s.asset === "object"),
  hasMarket: Boolean(s?.market && typeof s.market === "object"),
  hasSignal: Boolean(s?.signal && typeof s.signal === "object"),
  hasRisk: Boolean(s?.risk && typeof s.risk === "object"),
  planAction: s?.plan?.action ?? null,
  asset: s?.asset ? {
    ticker: s.asset.ticker,
    platformId: s.asset.platformId,
    tokenPrice: s.asset.tokenPrice,
    referencePrice: s.asset.referencePrice,
    shareRatio: s.asset.shareRatio ?? s.asset.tokenToShareRatio ?? null,
    shareRatioSource: s.asset.shareRatioSource ?? null,
    rawSpreadPct: s.asset.rawSpreadPct ?? null,
    adjustedSpreadPct: s.asset.adjustedSpreadPct ?? null,
    dataQuality: s.asset.dataQuality ?? null,
    actionable: s.asset.actionable ?? false,
    marketStatus: s.asset.marketStatus ?? null
  } : null,
  signal: s?.signal ?? null,
  radarLikeKeys: ["monitor", "assets", "summary", "routeAvailable", "onchainGapPct"]
    .filter((key) => Object.hasOwn(s || {}, key)),
  broadcast: s?.execution?.broadcast ?? s?.broadcast ?? null
};
console.log("PRODUCTION_SCAN_CONTRACT=" + JSON.stringify(scanResult));

assert.equal(scan.response.ok, true, "production scan endpoint must return 2xx");
assert.ok(s && typeof s === "object", "scan endpoint must return JSON object");
assert.equal(s.action, "scan", "scan endpoint must identify action=scan");
assert.equal(String(s.ticker || "").toUpperCase(), "CRWD", "scan response ticker must be CRWD");
assert.ok(s.asset && typeof s.asset === "object", "scan response must include asset object");
assert.ok(s.market && typeof s.market === "object", "scan response must include market object");
assert.ok(s.signal && typeof s.signal === "object", "scan response must include signal object");
assert.ok(s.risk && typeof s.risk === "object", "scan response must include risk object");
assert.ok(s.plan && typeof s.plan === "object", "scan response must include plan object");
assert.equal(s.monitor, undefined, "scan response must not be radar-shaped");
assert.equal(s.assets, undefined, "scan response must not be radar-shaped");
assert.equal(s.summary, undefined, "scan response must not be radar-shaped");
assert.equal(s.execution?.broadcast, false, "scan response must keep broadcast=false");

const assetsCall = await getJson("/api/agent?action=assets&limit=1&offset=0");
const a = assetsCall.payload;
const assetsResult = {
  checkedUrl: assetsCall.url,
  httpStatus: assetsCall.response.status,
  mode: a?.mode ?? null,
  total: a?.pagination?.total ?? a?.summary?.total ?? null,
  pageRows: Array.isArray(a?.assets) ? a.assets.length : null,
  feedActionable: a?.summary?.actionable ?? null,
  minActionableGapPct: a?.summary?.minActionableGapPct ?? null,
  sample: a?.assets?.[0] ? {
    ticker: a.assets[0].ticker,
    adjustedSpreadPct: a.assets[0].adjustedSpreadPct,
    shareRatio: a.assets[0].shareRatio,
    dataQuality: a.assets[0].dataQuality,
    actionable: a.assets[0].actionable
  } : null
};
console.log("PRODUCTION_ASSETS_CONTRACT=" + JSON.stringify(assetsResult));
assert.equal(assetsCall.response.ok, true, "assets endpoint must return 2xx");
assert.equal(a?.mode, "live-data", "assets endpoint must report live-data");
assert.ok(Array.isArray(a.assets), "assets response must contain an assets array");
assert.ok(a.assets.length <= 1, "limit=1 must return at most one row");
assert.ok(Number(a.pagination?.total ?? 0) > 0, "assets response must expose total count");
assert.ok(Number(a.summary?.actionable ?? 0) < Number(a.summary?.total ?? Infinity),
  "actionable count must not blindly equal every asset");

const radarCall = await getJson("/api/agent?action=radar&limit=5&sizeUSDT=100");
const r = radarCall.payload;
const radarRows = Array.isArray(r?.assets) ? r.assets : [];
const radarResult = {
  checkedUrl: radarCall.url,
  httpStatus: radarCall.response.status,
  mode: r?.mode ?? null,
  monitor: r?.monitor ?? null,
  formula: r?.formula ?? null,
  quoteSide: r?.quoteSide ?? null,
  summary: r?.summary ?? null,
  rows: radarRows.map((row) => ({
    ticker: row.ticker,
    platformId: row.platformId,
    routeStatus: row.routeStatus ?? null,
    quoteSizeUSDT: row.quoteSizeUSDT ?? null,
    quotePriceUSDTPerToken: row.quotePriceUSDTPerToken ?? null,
    referencePrice: row.referencePrice ?? null,
    shareRatio: row.shareRatio ?? row.tokenToShareRatio ?? null,
    onchainGapPct: row.onchainGapPct ?? null,
    priceImpactPct: row.priceImpactPct ?? null,
    marketStatus: row.marketStatus ?? null,
    marketContext: row.marketContext ?? null,
    actionable: row.actionable ?? false
  })),
  broadcast: r?.broadcast ?? null
};
console.log("PRODUCTION_RADAR_CONTRACT=" + JSON.stringify(radarResult));

assert.equal(radarCall.response.ok, true, "radar endpoint must return 2xx");
assert.equal(r?.mode, "live-data", "radar must report live data when feed is available");
assert.equal(r?.monitor, "onchain-vs-reference", "radar must use quote-based monitor");
assert.match(String(r?.formula || ""), /quotePriceUSDTPerToken/);
assert.equal(r?.quoteSide, "BUY; quote-only and not a round-trip arbitrage estimate");
assert.ok(radarRows.length <= 5, "radar must bound quote candidates to five or fewer");
assert.ok(Number(r?.summary?.actionable ?? Infinity) <= radarRows.length,
  "actionable count must be limited to quoted radar candidates");
assert.equal(r?.broadcast, false, "radar must not broadcast");
for (const row of radarRows) {
  if (row.routeStatus !== "ROUTE") {
    assert.equal(row.onchainGapPct, null, "non-route rows must not get a numeric gap");
    assert.equal(row.actionable, false, "non-route rows must not be actionable");
  }
  if (row.actionable) {
    assert.equal(row.routeStatus, "ROUTE");
    assert.ok(Number.isFinite(Number(row.onchainGapPct)));
    assert.ok(Number.isFinite(Number(row.priceImpactPct)));
    assert.ok(Number(row.priceImpactPct) <= Number(r.maxActionablePriceImpactPct));
    assert.equal(row.marketContext, "MARKET_STATUS_REPORTED");
  }
}
console.log("PRODUCTION_SCAN_ASSETS_RADAR_CONTRACT_PASS");
