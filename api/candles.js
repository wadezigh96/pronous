const { guardRequest, isAddress, isAmount, safeError } = require("../lib/http-policy");
const crypto = require("crypto");
const BASE = "https://web3.binance.com/build";

function cred(v) {
  return String(v || "").replace(/^["']|["']$/g, "").replace(/\\n/g, "\n").trim();
}
function wirePath(p) {
  if (!p) return "/build";
  return p.startsWith("/build") ? p : "/build" + p;
}

module.exports = async function handler(req, res) {
  if (!guardRequest(req, res)) return;
  try {
    const url = new URL(req.url, "http://localhost");
    const token = (url.searchParams.get("token") || url.searchParams.get("tokenContractAddress") || "").trim();
    const bar = (url.searchParams.get("bar") || "1h").trim();
    const limit = String(url.searchParams.get("limit") || "72");
    if (!isAddress(token)) return res.status(400).json({ error: "Invalid token address" });
    if (!/^(1m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|3d|1w)$/.test(bar)) return res.status(400).json({ error: "Invalid bar" });
    if (!/^\d{1,3}$/.test(limit) || Number(limit) < 1 || Number(limit) > 500) return res.status(400).json({ error: "Invalid limit" });
    const apiKey = cred(process.env.BINANCE_WEB3_API_KEY);
    const secret = cred(process.env.BINANCE_WEB3_API_SECRET);
    if (!apiKey || !secret) return res.status(200).json({ mode: "demo", candles: [] });
    const requestPath = `/api/v1/dex/market/candles?binanceChainId=56&tokenContractAddress=${encodeURIComponent(token)}&bar=${encodeURIComponent(bar)}&limit=${encodeURIComponent(limit)}`;
    const timestamp = new Date().toISOString();
    const signedPath = wirePath(requestPath);
    const prehash = timestamp + "GET" + signedPath;
    const signature = crypto.createHmac("sha256", secret).update(prehash, "utf8").digest("base64");
    const r = await fetch(BASE + requestPath, {
      headers: {
        "X-OC-APIKEY": apiKey,
        "X-OC-TIMESTAMP": timestamp,
        "X-OC-SIGN": signature,
        "X-OC-RECV-WINDOW": process.env.BINANCE_WEB3_RECV_WINDOW || "60000"
      }
    });
    const data = await r.json();
    const raw = data.data || [];
    const candles = raw.map(row => Array.isArray(row) ? {
      open: Number(row[0]), high: Number(row[1]), low: Number(row[2]), close: Number(row[3]),
      volume: Number(row[4]), time: Number(row[5]), trades: Number(row[6] || 0)
    } : row);
    if (!r.ok || (data.code !== undefined && data.code !== 0)) {
      return safeError(res, r.status || 502, "CANDLE_UPSTREAM_FAILED");
    }
    return res.status(200).json({ mode: "live-data", source: "binance-web3-candles", bar, token, candles });
  } catch (e) {
    return safeError(res, 500, "CANDLE_REQUEST_FAILED");
  }
};
