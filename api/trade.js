const crypto = require("crypto");
const { guardRequest, safeError } = require("../lib/http-policy");

const BASE = "https://web3.binance.com/build";
const RECV_WINDOW = process.env.BINANCE_WEB3_RECV_WINDOW || "60000";
const ALLOWED_ORIGIN = String(process.env.ALLOWED_ORIGIN || "https://pronous.vercel.app").replace(/\/$/, "");
const VENDORS = new Set(["LiquidMesh"]);
const ID_RE = /^[A-Za-z0-9_-]{6,80}$/;
const TX_RE = /^0x[a-fA-F0-9]{64}$/;
const SIG_RE = /^0x[0-9a-fA-F]{2,4096}$/;
const RATE_WINDOW = 60_000;
const RATE_READ = 60;
const RATE_SUBMIT = 10;
const buckets = new Map();

function cred(v) { return String(v || "").replace(/^["']|["']$/g, "").replace(/\\n/g, "\n").trim(); }
function wirePath(p) { return p && p.startsWith("/build") ? p : "/build" + (p || ""); }
function clientIp(req) { return String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim() || String(req.socket?.remoteAddress || "unknown"); }
function setHeaders(res) { res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff"); }
function rejectMethod(req, res, method) { if (req.method !== method) { res.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return true; } return false; }
function sameOrigin(req) {
  const origin = String(req.headers?.origin || "").replace(/\/$/, "");
  return origin === ALLOWED_ORIGIN;
}
function rateLimit(req, res, submit) {
  const now = Date.now(), key = (submit ? "submit:" : "read:") + clientIp(req);
  let b = buckets.get(key);
  if (!b || now - b.started >= RATE_WINDOW) b = { started: now, count: 0 };
  b.count += 1; buckets.set(key, b);
  if (b.count > (submit ? RATE_SUBMIT : RATE_READ)) { res.setHeader("Retry-After", "60"); res.status(429).json({ error: "RATE_LIMITED" }); return false; }
  return true;
}
function requireOrigin(req, res) { if (sameOrigin(req)) return true; res.status(403).json({ error: "FORBIDDEN_ORIGIN" }); return false; }
function parseJsonBody(req) { if (typeof req.body === "object" && req.body !== null) return req.body; return JSON.parse(String(req.body || "")); }
function parseResponseJson(r) { const type = String(r.headers?.get?.("content-type") || "").toLowerCase(); if (!type.includes("application/json")) { const e = new Error("UPSTREAM_NON_JSON"); e.status = 502; throw e; } return r.json(); }
function errorWithCode(code, status = 502) { const e = new Error(code); e.code = code; e.status = status; return e; }
function parseEd25519(secret) {
  const normalized = cred(secret);
  if (/-----BEGIN PRIVATE KEY-----/.test(normalized)) return crypto.createPrivateKey({ key: normalized, format: "pem", type: "pkcs8" });
  const compact = normalized.replace(/\s+/g, ""); const b64 = compact.replace(/-/g, "+").replace(/_/g, "/");
  const der = Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64");
  try { return crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" }); }
  catch (_) { if (der.length === 32) return crypto.createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), der]), format: "der", type: "pkcs8" }); throw _; }
}
function signedHeaders(method, requestPath, body = "") {
  const apiKey = cred(process.env.BINANCE_WEB3_API_KEY), secret = cred(process.env.BINANCE_WEB3_API_SECRET);
  if (!apiKey || !secret) throw errorWithCode("LIVE_API_NOT_CONFIGURED", 503);
  const timestamp = new Date().toISOString();
  const algo = String(process.env.BINANCE_WEB3_SIGN_ALGO || "HMAC_SHA256").trim().toUpperCase();
  const prehash = timestamp + method.toUpperCase() + wirePath(requestPath) + body;
  const signature = algo === "ED25519" ? crypto.sign(null, Buffer.from(prehash, "utf8"), parseEd25519(secret)).toString("base64") : crypto.createHmac("sha256", secret).update(prehash, "utf8").digest("base64");
  return { "X-OC-APIKEY": apiKey, "X-OC-TIMESTAMP": timestamp, "X-OC-SIGN": signature, "X-OC-RECV-WINDOW": RECV_WINDOW, "X-OC-NONCE": crypto.randomBytes(16).toString("hex") };
}
function validateVendor(v) { return typeof v === "string" && VENDORS.has(v); }

async function binanceGet(path, params) {
  const requestPath = path + (Object.keys(params || {}).length ? "?" + Object.entries(params).map(([k,v]) => encodeURIComponent(k) + "=" + encodeURIComponent(String(v))).join("&") : "");
  const r = await fetch(BASE + requestPath, { headers: signedHeaders("GET", requestPath, ""), signal: AbortSignal.timeout(8000) });
  const data = await parseResponseJson(r); if (!r.ok || (data.code !== undefined && data.code !== 0)) throw errorWithCode("UPSTREAM_ERROR", 502); return data;
}
async function binancePost(path, body) {
  const requestBody = JSON.stringify(body), headers = signedHeaders("POST", path, requestBody); headers["Content-Type"] = "application/json";
  const r = await fetch(BASE + path, { method: "POST", headers, body: requestBody, signal: AbortSignal.timeout(8000) });
  const data = await parseResponseJson(r); if (!r.ok || (data.code !== undefined && data.code !== 0)) throw errorWithCode("UPSTREAM_ERROR", 502); return data;
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
