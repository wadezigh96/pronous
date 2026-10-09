#!/usr/bin/env node
/**
 * One-off live response-contract check. Read-only: GET only; no wallet, quote
 * submission, signing, calldata or transaction path.
 */
import assert from "node:assert/strict";

const url = process.env.PRONOUS_SCAN_URL ||
  "https://pronous.vercel.app/api/agent?action=scan&ticker=CRWD";

const response = await fetch(url, {
  headers: { Accept: "application/json", "User-Agent": "PRONOUS-scan-contract-verifier/1.0" },
  signal: AbortSignal.timeout(20000)
});
const payload = await response.json().catch(() => null);

const result = {
  checkedUrl: url,
  httpStatus: response.status,
  contentType: response.headers.get("content-type"),
  topLevelKeys: payload && typeof payload === "object" ? Object.keys(payload) : [],
  action: payload?.action ?? null,
  mode: payload?.mode ?? null,
  ticker: payload?.ticker ?? null,
  hasAsset: Boolean(payload?.asset && typeof payload.asset === "object"),
  hasMarket: Boolean(payload?.market && typeof payload.market === "object"),
  hasSignal: Boolean(payload?.signal && typeof payload.signal === "object"),
  hasRisk: Boolean(payload?.risk && typeof payload.risk === "object"),
  planAction: payload?.plan?.action ?? null,
  asset: payload?.asset ? {
    ticker: payload.asset.ticker,
    platformId: payload.asset.platformId,
    tokenPrice: payload.asset.tokenPrice,
    referencePrice: payload.asset.referencePrice,
    shareRatio: payload.asset.shareRatio ?? payload.asset.tokenToShareRatio ?? null,
    rawSpreadPct: payload.asset.rawSpreadPct ?? null,
    adjustedSpreadPct: payload.asset.adjustedSpreadPct ?? null,
    dataQuality: payload.asset.dataQuality ?? null,
    actionable: payload.asset.actionable ?? false,
    marketStatus: payload.asset.marketStatus ?? null
  } : null,
  signal: payload?.signal ?? null,
  radarLikeKeys: ["monitor", "assets", "summary", "routeAvailable", "onchainGapPct"]
    .filter((key) => Object.hasOwn(payload || {}, key)),
  broadcast: payload?.execution?.broadcast ?? payload?.broadcast ?? null
};
console.log("PRODUCTION_SCAN_CONTRACT=" + JSON.stringify(result));

assert.equal(response.ok, true, "production scan endpoint must return 2xx");
assert.ok(payload && typeof payload === "object", "endpoint must return JSON object");
assert.equal(payload.action, "scan", "scan endpoint must identify action=scan");
assert.equal(String(payload.ticker || "").toUpperCase(), "CRWD", "scan response ticker must be CRWD");
assert.ok(payload.asset && typeof payload.asset === "object", "scan response must include asset object");
assert.ok(payload.market && typeof payload.market === "object", "scan response must include market object");
assert.ok(payload.signal && typeof payload.signal === "object", "scan response must include signal object");
assert.ok(payload.risk && typeof payload.risk === "object", "scan response must include risk object");
assert.ok(payload.plan && typeof payload.plan === "object", "scan response must include plan object");
assert.equal(payload.monitor, undefined, "scan response must not be the radar monitor payload");
assert.equal(payload.assets, undefined, "scan response must not be the radar assets payload");
assert.equal(payload.summary, undefined, "scan response must not be the radar summary payload");
assert.equal(payload.execution?.broadcast, false, "scan response must keep broadcast=false");
console.log("PRODUCTION_SCAN_CONTRACT_PASS");
