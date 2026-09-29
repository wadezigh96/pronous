const { guardRequest, safeError } = require("../lib/http-policy");
const { signedGet, signedPost } = require("../lib/binance-web3");

const ALLOWED_ORIGIN = String(process.env.ALLOWED_ORIGIN || "https://pronous.vercel.app").replace(/\/$/, "");
const VENDORS = new Set(["LiquidMesh"]);
const ID_RE = /^[A-Za-z0-9_-]{6,80}$/;
const TX_RE = /^0x[a-fA-F0-9]{64}$/;
const SIG_RE = /^0x[0-9a-fA-F]{2,4096}$/;
const RATE_WINDOW = 60_000;
const RATE_READ = 60;
const RATE_SUBMIT = 10;
const MAX_BUCKETS = 2048;
const buckets = new Map();

function clientIp(req) { return String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim() || String(req.socket?.remoteAddress || "unknown"); }
function setHeaders(res) { res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff"); }
function rejectMethod(req, res, method) { if (req.method !== method) { res.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return true; } return false; }
function sameOrigin(req) {
  const origin = String(req.headers?.origin || "").replace(/\/$/, "");
  return origin === ALLOWED_ORIGIN;
}
function pruneRateBuckets(now) {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.started >= RATE_WINDOW) buckets.delete(key);
    if (buckets.size <= MAX_BUCKETS) break;
  }
  while (buckets.size > MAX_BUCKETS) buckets.delete(buckets.keys().next().value);
}
function rateLimit(req, res, submit) {
  const now = Date.now(); pruneRateBuckets(now);
  const key = (submit ? "submit:" : "read:") + clientIp(req);
  let b = buckets.get(key);
  if (!b || now - b.started >= RATE_WINDOW) b = { started: now, count: 0 };
  b.count += 1; buckets.set(key, b);
  if (b.count > (submit ? RATE_SUBMIT : RATE_READ)) { res.setHeader("Retry-After", "60"); res.status(429).json({ error: "RATE_LIMITED" }); return false; }
  return true;
}
function requireOrigin(req, res) { if (sameOrigin(req)) return true; res.status(403).json({ error: "FORBIDDEN_ORIGIN" }); return false; }
function parseJsonBody(req) { if (typeof req.body === "object" && req.body !== null) return req.body; return JSON.parse(String(req.body || "")); }
function validateVendor(v) { return typeof v === "string" && VENDORS.has(v); }

async function binanceGet(path, params) {
  try { return await signedGet(path, params); }
  catch (e) { if (e?.message === "LIVE_API_NOT_CONFIGURED") throw e; throw Object.assign(new Error("UPSTREAM_ERROR"), { status: e?.status || 502, code: "UPSTREAM_ERROR" }); }
}
async function binancePost(path, body) {
  try { return await signedPost(path, body); }
  catch (e) { if (e?.message === "LIVE_API_NOT_CONFIGURED") throw e; throw Object.assign(new Error("UPSTREAM_ERROR"), { status: e?.status || 502, code: "UPSTREAM_ERROR" }); }
}

module.exports = async function handler(req, res) {
  setHeaders(res); if (!guardRequest(req, res)) return;
  try {
    const url = new URL(req.url, "http://localhost"), action = url.searchParams.get("action") || "info";
    if (["userSignature", "quoteId"].some(k => url.searchParams.has(k))) return res.status(400).json({ error: "QUERY_CREDENTIALS_NOT_ALLOWED" });
    if (action === "submitRfq") {
      if (rejectMethod(req, res, "POST")) return; if (!requireOrigin(req, res) || !rateLimit(req, res, true)) return;
      let body; try { body = parseJsonBody(req); } catch (_) { return res.status(400).json({ error: "INVALID_JSON" }); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return res.status(400).json({ error: "INVALID_BODY" });
      const clean = { userSignature: body.userSignature, quoteId: body.quoteId, vendor: body.vendor, requestId: body.requestId };
      if (typeof clean.userSignature !== "string" || !SIG_RE.test(clean.userSignature)) return res.status(400).json({ error: "Invalid userSignature" });
      if (!ID_RE.test(String(clean.quoteId || "")) || !ID_RE.test(String(clean.requestId || ""))) return res.status(400).json({ error: "Invalid request identifier" });
      if (!validateVendor(clean.vendor)) return res.status(400).json({ error: "Invalid vendor" });
      const data = await binancePost("/api/v1/dex/aggregator/order/submit", clean);
      return res.status(200).json({ mode: "live-rfq-submit", network: "BSC", data, requestId: clean.requestId });
    }
    if (["info", "orderStatus", "history"].includes(action) && rejectMethod(req, res, "GET")) return;
    if (action !== "info" && !requireOrigin(req, res)) return;
    if (!rateLimit(req, res, false)) return;
    if (action === "info") return res.status(200).json({ agent: "PRONOUS", skill: "client-broadcast", network: "BSC", broadcast: "wallet-only", actions: ["submitRfq", "orderStatus", "history"] });
    if (action === "orderStatus") {
      const orderId = url.searchParams.get("orderId"); if (!ID_RE.test(String(orderId || ""))) return res.status(400).json({ error: "Invalid orderId" });
      const data = await binanceGet("/api/v1/dex/aggregator/order/" + encodeURIComponent(orderId), {}); return res.status(200).json({ mode: "live-rfq-status", network: "BSC", data });
    }
    if (action === "history") {
      const txHash = url.searchParams.get("txHash"); if (!TX_RE.test(String(txHash || ""))) return res.status(400).json({ error: "Invalid txHash" });
      const data = await binanceGet("/api/v1/dex/aggregator/history", { binanceChainId: "56", txHash }); return res.status(200).json({ mode: "live-tx-history", network: "BSC", data });
    }
    return res.status(400).json({ error: "Unknown trade action" });
  } catch (e) {
    console.error("PRONOUS /api/trade internal error", { code: e?.code || e?.message, status: e?.status });
    return safeError(res, Number(e?.status) === 503 ? 503 : 502, e?.status === 503 ? "LIVE_API_NOT_CONFIGURED" : "UPSTREAM_ERROR");
  }
};
