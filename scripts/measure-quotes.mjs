#!/usr/bin/env node
/**
 * Read-only PancakeSwap Unified Swap API quote measurement. No wallet, signing,
 * calldata, approval, or broadcast calls are made.
 *
 * Usage:
 *   node scripts/measure-quotes.mjs
 *   PRONOUS_QUOTE_TICKERS=NVDA,TSLA,SPY node scripts/measure-quotes.mjs
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { getPancakeQuote, USDT } = require("../lib/pancakeswap-quote.js");
const DEFAULT_ASSETS_URL = "https://pronous.vercel.app/api/agent?action=assets";
const PAGE_SIZE = 100;
const MAX_ASSETS = 2000;
const SIZES_USDT = [10, 100, 1000];
const MAX_TICKERS = Math.max(1, Math.min(5, Number(process.env.PRONOUS_QUOTE_MAX_TICKERS || 3)));
const CONCURRENCY = 2;

function n(value) {
  const valueN = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(valueN) ? valueN : null;
}
function volume(asset) { return n(asset.volume24H) ?? -1; }
function validAsset(asset) {
  return Boolean(asset.tokenContractAddress && /^0x[a-fA-F0-9]{40}$/.test(asset.tokenContractAddress) &&
    n(asset.referencePrice) > 0 && n(asset.tokenToShareRatio ?? asset.shareRatio) > 0 &&
    String(asset.platformId || "").toLowerCase() !== "demo");
}
function tickerOf(asset) { return String(asset.ticker || asset.underlyingTicker || "").trim().toUpperCase(); }

async function fetchAssets(endpoint) {
  const rows = [];
  const seen = new Set();
  let mode = null, updatedAt = null, total = null;
  for (let offset = 0; offset < MAX_ASSETS; offset += PAGE_SIZE) {
    const url = new URL(endpoint);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "PRONOUS-quote-measurement/1.0" }, signal: AbortSignal.timeout(20000) });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || !Array.isArray(body.assets)) throw new Error("ASSETS_ENDPOINT_FAILED status=" + response.status);
    if (!mode) { mode = body.mode || "unknown"; updatedAt = body.updatedAt ?? null; }
    if (mode !== "live-data") throw new Error("LIVE_DATA_REQUIRED mode=" + mode + "; demo rows are not measured");
    const count = n(body.pagination?.total ?? body.total ?? body.summary?.total);
    if (count !== null) total = count;
    for (const asset of body.assets) {
      const key = String(asset.platformId || "").toLowerCase() + ":" +
        String(asset.tokenContractAddress || "").toLowerCase() + ":" + tickerOf(asset);
      if (!seen.has(key)) { seen.add(key); rows.push(asset); }
    }
    if (!body.assets.length || body.assets.length < PAGE_SIZE || body.assets.length > PAGE_SIZE || (total !== null && rows.length >= total)) break;
  }
  return { rows, mode, updatedAt, total: total ?? rows.length };
}

function chooseAssets(rows) {
  const groups = new Map();
  for (const asset of rows.filter(validAsset)) {
    const ticker = tickerOf(asset);
    if (!ticker) continue;
    if (!groups.has(ticker)) groups.set(ticker, []);
    groups.get(ticker).push(asset);
  }
  const priority = String(process.env.PRONOUS_QUOTE_TICKERS || "NVDA,TSLA,SPY,QQQ")
    .split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
  const groupsArray = [...groups.entries()].map(([ticker, assets]) => {
    assets.sort((a, b) => volume(b) - volume(a));
    const hasOndo = assets.some((a) => String(a.platformId).toLowerCase() === "ondo");
    const hasBstock = assets.some((a) => String(a.platformId).toLowerCase() === "bstock");
    return { ticker, assets, paired: hasOndo && hasBstock, volume: assets.slice(0, 2).reduce((s, a) => s + Math.max(0, volume(a)), 0) };
  });
  groupsArray.sort((a, b) => {
    const ai = priority.indexOf(a.ticker), bi = priority.indexOf(b.ticker);
    const ap = ai < 0 ? 999 : ai, bp = bi < 0 ? 999 : bi;
    return (a.paired === b.paired ? 0 : a.paired ? -1 : 1) || ap - bp || b.volume - a.volume;
  });
  const selected = [];
  for (const group of groupsArray) {
    if (selected.length >= MAX_TICKERS) break;
    const ondo = group.assets.find((a) => String(a.platformId).toLowerCase() === "ondo");
    const bstock = group.assets.find((a) => String(a.platformId).toLowerCase() === "bstock");
    const chosen = ondo && bstock ? [ondo, bstock] : [group.assets[0]];
    selected.push({ ticker: group.ticker, paired: Boolean(ondo && bstock), assets: chosen });
  }
  return selected;
}

export function deriveQuoteMetrics(asset, quote, latencyMs, routeStatus = "ROUTE") {
  const referencePrice = n(asset.referencePrice);
  const shareRatio = n(asset.tokenToShareRatio ?? asset.shareRatio);
  const expectedPrice = referencePrice !== null && shareRatio !== null && referencePrice > 0 && shareRatio > 0
    ? referencePrice * shareRatio : null;
  const amountIn = n(quote?.amountIn);
  const amountOut = n(quote?.amountOut);
  const quotedPrice = routeStatus === "ROUTE" && amountIn > 0 && amountOut > 0 ? amountIn / amountOut : null;
  const onchainGapPct = quotedPrice !== null && expectedPrice !== null && expectedPrice > 0
    ? (quotedPrice / expectedPrice - 1) * 100 : null;
  const impactRaw = n(quote?.priceImpact);
  return {
    ticker: tickerOf(asset),
    platformId: String(asset.platformId || "unknown"),
    tokenSymbol: asset.tokenSymbol || null,
    tokenContractAddress: asset.tokenContractAddress || null,
    volume24H: n(asset.volume24H),
    tokenPrice: n(asset.tokenPrice),
    referencePrice,
    shareRatio,
    expectedTokenPrice: expectedPrice === null ? null : Number(expectedPrice.toFixed(8)),
    adjustedSpreadPct: n(asset.adjustedSpreadPct),
    routeStatus,
    routeAvailable: routeStatus === "ROUTE",
    quotedInputUSDT: amountIn,
    quotedOutputTokens: amountOut,
    quotePriceUSDTPerToken: quotedPrice === null ? null : Number(quotedPrice.toFixed(8)),
    onchainGapPct: onchainGapPct === null ? null : Number(onchainGapPct.toFixed(6)),
    priceImpactRawFraction: impactRaw,
    priceImpactPct: impactRaw === null ? null : Number((impactRaw * 100).toFixed(6)),
    quoteLatencyMs: latencyMs,
    routeTypes: Array.isArray(quote?.routeTypes) ? quote.routeTypes : [],
    quoteId: quote?.quoteId || null,
    error: routeStatus === "ROUTE" ? null : routeStatus
  };
}

async function measureOne(asset, sizeUSDT) {
  const started = Date.now();
  try {
    const quote = await getPancakeQuote({
      assetAddress: asset.tokenContractAddress,
      tokenInAddress: USDT,
      tokenOutAddress: asset.tokenContractAddress,
      amount: String(sizeUSDT)
    });
    return { sizeUSDT, ...deriveQuoteMetrics(asset, quote, Date.now() - started, "ROUTE") };
  } catch (error) {
    const code = String(error?.code || error?.message || "QUOTE_ERROR");
    const routeStatus = code.includes("NO_ROUTE") ? "NO_ROUTE" : "QUOTE_ERROR";
    return { sizeUSDT, ...deriveQuoteMetrics(asset, null, Date.now() - started, routeStatus), error: code };
  }
}

async function parallelLimit(items, concurrency, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      out[index] = await worker(items[index], index);
    }
  }));
  return out;
}

export function compareSameTicker(rows) {
  const byTicker = new Map();
  for (const row of rows) {
    if (!byTicker.has(row.ticker)) byTicker.set(row.ticker, new Map());
    const venues = byTicker.get(row.ticker);
    const venue = String(row.platformId).toLowerCase();
    if (!venues.has(venue)) venues.set(venue, []);
    venues.get(venue).push(row);
  }
  const comparisons = [];
  for (const [ticker, venues] of byTicker) {
    const ondo = venues.get("ondo") || [];
    const bstock = venues.get("bstock") || [];
    const sizes = [...new Set([...ondo, ...bstock].map((x) => x.sizeUSDT))].sort((a, b) => a - b);
    for (const sizeUSDT of sizes) {
      const a = ondo.find((x) => x.sizeUSDT === sizeUSDT);
      const b = bstock.find((x) => x.sizeUSDT === sizeUSDT);
      comparisons.push({
        ticker, sizeUSDT, ondoAvailable: Boolean(a?.routeAvailable), bstockAvailable: Boolean(b?.routeAvailable),
        ondoGapPct: a?.onchainGapPct ?? null, bstockGapPct: b?.onchainGapPct ?? null,
        ondoVolume24H: a?.volume24H ?? null, bstockVolume24H: b?.volume24H ?? null,
        bothRouted: Boolean(a?.routeAvailable && b?.routeAvailable)
      });
    }
  }
  return comparisons;
}

async function main() {
  const endpoint = process.env.PRONOUS_ASSETS_URL || DEFAULT_ASSETS_URL;
  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  const outputPath = path.resolve(outputArg ? outputArg.slice("--output=".length) : "docs/quote-measurements.json");
  const snapshot = await fetchAssets(endpoint);
  const selected = chooseAssets(snapshot.rows);
  if (!selected.length) throw new Error("NO_VALID_LIVE_ASSETS_SELECTED");
  const tasks = [];
  for (const group of selected) {
    for (const asset of group.assets) for (const sizeUSDT of SIZES_USDT) tasks.push({ group, asset, sizeUSDT });
  }
  const results = await parallelLimit(tasks, CONCURRENCY, (task) => measureOne(task.asset, task.sizeUSDT));
  const reportRows = results.map((row, i) => ({
    ...row,
    selectedTickerGroup: tasks[i].group.ticker,
    expectedPriceBasis: "referencePrice * tokenToShareRatio",
    source: "PancakeSwap Unified Swap API quote endpoint (quote-only)",
    broadcast: false
  }));
  const noRouteCount = reportRows.filter((x) => x.routeStatus === "NO_ROUTE").length;
  const errorCount = reportRows.filter((x) => x.routeStatus === "QUOTE_ERROR").length;
  const routedCount = reportRows.filter((x) => x.routeAvailable).length;
  const xstocksPresent = snapshot.rows.some((x) => String(x.platformId).toLowerCase() === "xstocks");
  const report = {
    schemaVersion: 1,
    analysis: "pancakeswap-quote-preview-vs-ratio-adjusted-reference",
    measuredAt: new Date().toISOString(),
    source: {
      assetsEndpoint: endpoint, assetsMode: snapshot.mode, apiUpdatedAt: snapshot.updatedAt,
      totalReportedAssets: snapshot.total, uniqueAssetsFetched: snapshot.rows.length,
      quoteProvider: "https://swap.pancakeswap.com/v1/quote",
      fromToken: { symbol: "USDT", address: USDT, chainId: 56 },
      sizesUSDT: SIZES_USDT, maxConcurrentQuotes: CONCURRENCY, quotesPerformed: reportRows.length,
      broadcast: false, signing: false, calldataRequested: false,
      xstocksPresentInSnapshot: xstocksPresent
    },
    summary: {
      tickersSelected: selected.map((x) => ({ ticker: x.ticker, crossVenuePair: x.paired, platformsMeasured: x.assets.map((a) => a.platformId) })),
      quoteAttempts: reportRows.length, routeAvailable: routedCount, noRoute: noRouteCount, quoteErrors: errorCount,
      xstocksPresentInSnapshot: xstocksPresent
    },
    sameTickerComparison: compareSameTicker(reportRows),
    measurements: reportRows
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + "\n");
  console.log("QUOTE_MEASUREMENTS_SUMMARY=" + JSON.stringify({
    output: outputPath, measuredAt: report.measuredAt, assets: snapshot.rows.length,
    tickers: selected.map((x) => x.ticker), quoteAttempts: reportRows.length,
    routeAvailable: routedCount, noRoute: noRouteCount, quoteErrors: errorCount,
    crossVenuePairs: selected.filter((x) => x.paired).map((x) => x.ticker),
    xstocksPresentInSnapshot: xstocksPresent
  }));
  for (const row of reportRows) console.log("QUOTE " + JSON.stringify({
    ticker: row.ticker, platformId: row.platformId, sizeUSDT: row.sizeUSDT,
    routeStatus: row.routeStatus, quotePriceUSDTPerToken: row.quotePriceUSDTPerToken,
    expectedTokenPrice: row.expectedTokenPrice, onchainGapPct: row.onchainGapPct,
    priceImpactPct: row.priceImpactPct, quoteLatencyMs: row.quoteLatencyMs, error: row.error
  }));
  console.log("Saved " + reportRows.length + " quote records to " + outputPath + "; broadcast=false");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error("MEASURE_QUOTES_FAILED", error?.message || error);
    process.exitCode = 1;
  });
}
