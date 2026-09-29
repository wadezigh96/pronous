const { guardRequest, isAddress, safeError } = require("../lib/http-policy");
const { signedGet } = require("../lib/binance-web3");

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
    if (!process.env.BINANCE_WEB3_API_KEY || !process.env.BINANCE_WEB3_API_SECRET) return res.status(200).json({ mode: "demo", candles: [] });
    const data = await signedGet("/api/v1/dex/market/candles", { binanceChainId: "56", tokenContractAddress: token, bar, limit });
    const raw = data.data || [];
    const candles = raw.map(row => Array.isArray(row) ? {
      open: Number(row[0]), high: Number(row[1]), low: Number(row[2]), close: Number(row[3]),
      volume: Number(row[4]), time: Number(row[5]), trades: Number(row[6] || 0)
    } : row);
    if (!data || (data.code !== undefined && data.code !== 0)) return safeError(res, 502, "CANDLE_UPSTREAM_FAILED");
    return res.status(200).json({ mode: "live-data", source: "binance-web3-candles", bar, token, candles });
  } catch (e) {
    return safeError(res, Number(e?.status) >= 500 ? 502 : 500, "CANDLE_REQUEST_FAILED");
  }
};
