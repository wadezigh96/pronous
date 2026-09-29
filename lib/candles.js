const BARS = /^(1m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|3d|1w)$/;
const LIMIT = /^\d{1,3}$/;

function validateCandleParams({ token = "", bar = "1h", limit = "72" } = {}) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(String(token).trim())) return "Invalid token address";
  if (!BARS.test(String(bar).trim())) return "Invalid bar";
  const value = String(limit);
  if (!LIMIT.test(value) || Number(value) < 1 || Number(value) > 500) return "Invalid limit";
  return null;
}

function normalizeCandles(data) {
  if (!data || (data.code !== undefined && data.code !== 0)) return null;
  const raw = Array.isArray(data.data) ? data.data : [];
  return raw.map((row) => Array.isArray(row) ? {
    open: Number(row[0]),
    high: Number(row[1]),
    low: Number(row[2]),
    close: Number(row[3]),
    volume: Number(row[4]),
    time: Number(row[5]),
    trades: Number(row[6] || 0)
  } : row);
}

module.exports = { validateCandleParams, normalizeCandles };
