#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";

const base = String(process.env.PRONOUS_PRODUCTION_API_URL || "https://pronous.vercel.app/api/agent").replace(/\/$/, "");
const timeoutMs = Number(process.env.PRONOUS_PRODUCTION_PROBE_TIMEOUT_MS || 25000);
const results = [];

async function probe(label, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const startedAt = new Date().toISOString();
  const start = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json", "cache-control": "no-cache", "user-agent": "PRONOUS-production-probe/1.0" },
      signal: AbortSignal.timeout(timeoutMs)
    });
    const raw = await response.text();
    let body;
    try { body = JSON.parse(raw); } catch { body = { rawText: raw.slice(0, 4000) }; }
    const result = { label, url: url.toString(), method: "GET", startedAt, elapsedMs: Date.now() - start, status: response.status, ok: response.ok, body };
    results.push(result);
    console.log("PRODUCTION_PROBE " + JSON.stringify({ label, status: response.status, ok: response.ok, elapsedMs: result.elapsedMs }));
    return result;
  } catch (error) {
    const result = { label, url: url.toString(), method: "GET", startedAt, elapsedMs: Date.now() - start, ok: false, error: String(error) };
    results.push(result);
    console.log("PRODUCTION_PROBE " + JSON.stringify({ label, ok: false, elapsedMs: result.elapsedMs, error: result.error }));
    return result;
  }
}

const assertions = [];
function check(name, pass, details = null) { assertions.push({ name, pass: Boolean(pass), details }); }

for (const ticker of ["NVDA", "CRWD", "MSFT"]) {
  await probe("scan-" + ticker, { action: "scan", ticker });
}
const preflightNoAck = await probe("preflight-NVDA-no-ack", { action: "preflight", ticker: "NVDA", amount: 1, maxSpend: 2, ackOffHours: false });
const preflightAck = await probe("preflight-NVDA-ack", { action: "preflight", ticker: "NVDA", amount: 1, maxSpend: 2, ackOffHours: true });
const radar = await probe("radar", { action: "radar", limit: 5, sizeUSDT: 100 });

for (const r of results) check("http-" + r.label, r.ok, r.status ?? r.error);
for (const r of results.filter((x) => x.label.startsWith("scan-"))) {
  check("scan-schema-" + r.label, r.body?.action === "scan" && r.body?.asset?.ticker === r.label.slice(5),
    { action: r.body?.action, ticker: r.body?.asset?.ticker, signal: r.body?.signal?.type });
}
function isOffHours(body) {
  const status = String(body?.asset?.marketStatus || body?.market?.marketStatus || "").toLowerCase();
  return /closed|post.?market|pre.?market|after.?hours|overnight|extended.?hours/.test(status);
}
const noAckPf = preflightNoAck.body?.preflight;
const ackPf = preflightAck.body?.preflight;
if (noAckPf && isOffHours(preflightNoAck.body)) {
  check("preflight-no-ack-warns", noAckPf.status === "READY_FOR_SIMULATION" && noAckPf.warning === "ACK_REQUIRED" && noAckPf.actionable === false && noAckPf.signal === "OFF_HOURS_DRIFT",
    { status: noAckPf.status, warning: noAckPf.warning, signal: noAckPf.signal, actionable: noAckPf.actionable });
  check("preflight-ack-permits-gated-continuation", ackPf?.status === "READY_FOR_SIMULATION" && ackPf?.warning !== "ACK_REQUIRED" && ackPf?.actionable === false && ackPf?.signal === "OFF_HOURS_DRIFT",
    { status: ackPf?.status, warning: ackPf?.warning, signal: ackPf?.signal, actionable: ackPf?.actionable });
} else {
  check("preflight-ack-paths-observed", Boolean(noAckPf && ackPf),
    { noAckPresent: Boolean(noAckPf), ackPresent: Boolean(ackPf), offHours: noAckPf ? isOffHours(preflightNoAck.body) : null });
}
const radarRows = Array.isArray(radar.body?.assets) ? radar.body.assets : [];
check("radar-schema", radar.body?.monitor === "onchain-vs-reference" && Array.isArray(radar.body?.assets),
  { monitor: radar.body?.monitor, rows: radarRows.length });
for (const row of radarRows) {
  check("radar-gap-fields-" + row.ticker + "-" + row.platformId,
    Object.hasOwn(row, "onchainGapPct") && Object.hasOwn(row, "impactAdjustedGapPct") && Object.hasOwn(row, "lowImpactGapPct"),
    { routeStatus: row.routeStatus, onchainGapPct: row.onchainGapPct, impactAdjustedGapPct: row.impactAdjustedGapPct, lowImpactGapPct: row.lowImpactGapPct });
}

const report = {
  generatedAt: new Date().toISOString(),
  target: base,
  mode: "read-only production API probe; no wallet signing, calldata submission, or transaction broadcast",
  checks: assertions,
  passed: assertions.filter((x) => x.pass).length,
  failed: assertions.filter((x) => !x.pass).length,
  results
};
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/production-probe.json", JSON.stringify(report, null, 2) + "\n");
console.log("PRODUCTION_PROBE_SUMMARY " + JSON.stringify({ passed: report.passed, failed: report.failed, artifact: "artifacts/production-probe.json" }));
if (report.failed > 0) process.exitCode = 1;
