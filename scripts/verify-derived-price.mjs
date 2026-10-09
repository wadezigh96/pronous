#!/usr/bin/env node
/**
 * Verify whether tokenPrice is numerically consistent with referencePrice * shareRatio.
 * Read-only; never broadcasts.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_URL = "https://pronous.vercel.app/api/agent?action=assets";
const PAGE_SIZE = 100;
const MAX_ASSETS = 2000;
const OUTLIER_THRESHOLD_PCT = Number(process.env.DERIVED_PRICE_OUTLIER_PCT || 0.1);
const EPSILON_PCT = 1e-9;

function numeric(value) {
  const n = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(n) ? n : null;
}

function bucketFor(pct) {
  if (pct === null) return "invalid";
  if (pct <= EPSILON_PCT) return "≤0.000001% (rounding/equal)";
  if (pct <= 0.001) return "≤0.001%";
  if (pct <= 0.01) return "≤0.01%";
  if (pct <= 0.1) return "≤0.1%";
  if (pct <= 1) return "≤1%";
  if (pct <= 5) return "≤5%";
  return ">5%";
}

async function fetchPages(baseUrl) {
  const all = [];
  const seen = new Set();
  let expectedTotal = null;
  let firstMode = null;
  let firstUpdatedAt = null;
  for (let offset = 0; offset < MAX_ASSETS; offset += PAGE_SIZE) {
    const url = new URL(baseUrl);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    const started = Date.now();
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "PRONOUS-derived-price-verifier/1.0" },
      signal: AbortSignal.timeout(20000)
    });
    const latencyMs = Date.now() - started;
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || !Array.isArray(body.assets)) {
      throw new Error("ASSETS_ENDPOINT_FAILED status=" + response.status + " body=" + JSON.stringify(body).slice(0, 500));
    }
    if (!firstMode) {
      firstMode = body.mode || "unknown";
      firstUpdatedAt = body.updatedAt ?? null;
    }
    if (firstMode !== "live-data") {
      throw new Error("LIVE_DATA_REQUIRED mode=" + firstMode + "; refuses to treat demo rows as measurements");
    }
    const rows = body.assets;
    const total = numeric(body.pagination?.total ?? body.total ?? body.summary?.total);
    if (total !== null) expectedTotal = total;
    for (const row of rows) {
      const key = [
        String(row.platformId || "").toLowerCase(),
        String(row.tokenContractAddress || "").toLowerCase(),
        String(row.ticker || row.underlyingTicker || "").toUpperCase()
      ].join(":");
      if (!seen.has(key)) {
        seen.add(key);
        all.push({ ...row, _sourcePageLatencyMs: latencyMs });
      }
    }
    if (!rows.length) break;
    // Backwards compatibility: endpoint may ignore limit/offset and return all rows.
    if (rows.length > PAGE_SIZE) break;
    if (expectedTotal !== null && all.length >= expectedTotal) break;
    if (rows.length < PAGE_SIZE) break;
  }
  return { rows: all.slice(0, MAX_ASSETS), total: expectedTotal ?? all.length, mode: firstMode, updatedAt: firstUpdatedAt };
}

export function analyzeRows(rows, metadata = {}) {
  const histogram = {
    "≤0.000001% (rounding/equal)": 0,
    "≤0.001%": 0,
    "≤0.01%": 0,
    "≤0.1%": 0,
    "≤1%": 0,
    "≤5%": 0,
    ">5%": 0,
    invalid: 0
  };
  const assets = rows.map((row) => {
    const tokenPrice = numeric(row.tokenPrice ?? row.price);
    const referencePrice = numeric(row.referencePrice);
    const shareRatio = numeric(row.tokenToShareRatio ?? row.shareRatio);
    const inputsValid = tokenPrice !== null && tokenPrice > 0 &&
      referencePrice !== null && referencePrice > 0 &&
      shareRatio !== null && shareRatio > 0;
    const derivedPrice = inputsValid ? referencePrice * shareRatio : null;
    const deviationFraction = inputsValid ? Math.abs(tokenPrice - derivedPrice) / tokenPrice : null;
    const deviationPct = deviationFraction === null ? null : deviationFraction * 100;
    const bucket = bucketFor(deviationPct);
    histogram[bucket] += 1;
    return {
      ticker: String(row.ticker || row.underlyingTicker || "").toUpperCase(),
      companyName: row.companyName || row.underlyingName || null,
      platformId: String(row.platformId || "unknown"),
      tokenSymbol: row.tokenSymbol || null,
      tokenContractAddress: row.tokenContractAddress || null,
      tokenPrice,
      referencePrice,
      shareRatio,
      derivedPrice,
      deviationFraction,
      deviationPct: deviationPct === null ? null : Number(deviationPct.toFixed(8)),
      adjustedSpreadPct: numeric(row.adjustedSpreadPct),
      marketStatus: row.marketStatus || null,
      openState: row.openState ?? null,
      qualityFlag: !inputsValid ? "INVALID_INPUT" :
        deviationPct <= EPSILON_PCT ? "MATCHES_DERIVED_PRICE_WITHIN_ROUNDING" :
        deviationPct <= OUTLIER_THRESHOLD_PCT ? "NEAR_DERIVED_PRICE" : "DEVIATES_FROM_DERIVED_PRICE",
      histogramBucket: bucket
    };
  });
  const valid = assets.filter((x) => x.deviationPct !== null).sort((a, b) => a.deviationPct - b.deviationPct);
  const vals = valid.map((x) => x.deviationPct);
  const quantile = (q) => vals.length ? vals[Math.min(vals.length - 1, Math.floor((vals.length - 1) * q))] : null;
  const outliers = assets.filter((x) => x.deviationPct !== null && x.deviationPct > OUTLIER_THRESHOLD_PCT)
    .sort((a, b) => b.deviationPct - a.deviationPct);
  return {
    schemaVersion: 1,
    analysis: "derived-price-consistency",
    measuredAt: new Date().toISOString(),
    source: {
      endpoint: metadata.endpoint || null,
      mode: metadata.mode || "unknown",
      apiUpdatedAt: metadata.updatedAt ?? null,
      totalReported: metadata.total ?? rows.length,
      uniqueAssetsAnalyzed: assets.length,
      formula: "deviationFraction = abs(tokenPrice - referencePrice * shareRatio) / tokenPrice",
      reportedDeviationPct: "deviationFraction * 100",
      outlierThresholdPct: OUTLIER_THRESHOLD_PCT,
      interpretation: "Numeric consistency check only. Near-zero deviation supports mathematical linkage, but does not prove the upstream provider's internal price-generation method."
    },
    summary: {
      assetsAnalyzed: assets.length,
      validRatioAndPrices: valid.length,
      invalidInputs: assets.length - valid.length,
      within001Pct: assets.filter((x) => x.deviationPct !== null && x.deviationPct <= 0.001).length,
      within01Pct: assets.filter((x) => x.deviationPct !== null && x.deviationPct <= 0.1).length,
      outlierCount: outliers.length,
      minDeviationPct: vals.length ? vals[0] : null,
      medianDeviationPct: quantile(0.5),
      p90DeviationPct: quantile(0.9),
      maxDeviationPct: vals.length ? vals[vals.length - 1] : null
    },
    histogram,
    outliers,
    assets
  };
}

async function main() {
  const inputArg = process.argv.find((arg) => arg.startsWith("--input="));
  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  const outputPath = path.resolve(outputArg ? outputArg.slice("--output=".length) : "docs/derived-price-analysis.json");
  const endpoint = process.env.PRONOUS_ASSETS_URL || DEFAULT_URL;
  let rows, metadata;
  if (inputArg) {
    const inputPath = path.resolve(inputArg.slice("--input=".length));
    const payload = JSON.parse(await fs.readFile(inputPath, "utf8"));
    rows = Array.isArray(payload) ? payload : payload.assets;
    if (!Array.isArray(rows)) throw new Error("INPUT_FILE_MUST_CONTAIN_ASSETS_ARRAY");
    metadata = { endpoint: "file://" + inputPath, mode: payload.mode || "snapshot", updatedAt: payload.updatedAt ?? null, total: payload.summary?.total ?? rows.length };
  } else {
    const result = await fetchPages(endpoint);
    rows = result.rows;
    metadata = { endpoint, mode: result.mode, updatedAt: result.updatedAt, total: result.total };
  }
  if (!rows.length) throw new Error("NO_ASSETS_TO_ANALYZE");
  const report = analyzeRows(rows, metadata);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + "\n");
  console.log("DERIVED_PRICE_ANALYSIS_JSON=" + JSON.stringify({
    output: outputPath,
    mode: report.source.mode,
    apiUpdatedAt: report.source.apiUpdatedAt,
    totalReported: report.source.totalReported,
    assetsAnalyzed: report.summary.assetsAnalyzed,
    validRatioAndPrices: report.summary.validRatioAndPrices,
    invalidInputs: report.summary.invalidInputs,
    outlierThresholdPct: report.source.outlierThresholdPct,
    summary: report.summary,
    histogram: report.histogram
  }));
  console.log("HISTOGRAM");
  for (const [bucket, count] of Object.entries(report.histogram)) console.log(bucket + ": " + count);
  console.log("OUTLIERS_TOP_20 (deviationPct, ticker, platform, tokenPrice, referencePrice, shareRatio, expectedPrice)");
  for (const item of report.outliers.slice(0, 20)) {
    console.log(JSON.stringify({
      deviationPct: item.deviationPct, ticker: item.ticker, platformId: item.platformId,
      tokenPrice: item.tokenPrice, referencePrice: item.referencePrice,
      shareRatio: item.shareRatio, derivedPrice: item.derivedPrice, qualityFlag: item.qualityFlag
    }));
  }
  console.log("Saved " + report.summary.assetsAnalyzed + " asset rows to " + outputPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error("VERIFY_DERIVED_PRICE_FAILED", error?.message || error);
    process.exitCode = 1;
  });
}
