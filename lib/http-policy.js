const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
const MAX_BUCKETS = 2048;
const buckets = new Map();

function clientIp(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req.socket?.remoteAddress || "unknown");
}

function allowedOrigin(req) {
  const origin = String(req.headers?.origin || "").trim().replace(/\/$/, "");
  if (!origin) return null;
  const configured = String(process.env.APP_ORIGIN || "").trim().replace(/\/$/, "");
  const host = String(req.headers?.host || "").split(",")[0].trim();
  const own = configured || (host ? `https://${host}` : "");
  if (origin === own || origin === "https://pronous.vercel.app") return origin;
  return null;
}

function pruneBuckets(now) {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.started >= RATE_WINDOW_MS) buckets.delete(key);
    if (buckets.size <= MAX_BUCKETS) break;
  }
  while (buckets.size > MAX_BUCKETS) buckets.delete(buckets.keys().next().value);
}

function guardRequest(req, res) {
  const origin = allowedOrigin(req);
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.status(204).end(); return false; }

  const now = Date.now();
  pruneBuckets(now);
  const ip = clientIp(req);
  const bucket = buckets.get(ip);
  if (!bucket || now - bucket.started >= RATE_WINDOW_MS) {
    buckets.set(ip, { started: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "RATE_LIMITED" });
    return false;
  }
  return true;
}

function isAddress(value) { return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim()); }
function isAmount(value) {
  const s = String(value ?? "").trim();
  return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s) && Number.isFinite(Number(s));
}
function safeError(res, status = 500, code = "REQUEST_FAILED") { return res.status(status).json({ error: code }); }

module.exports = { guardRequest, isAddress, isAmount, safeError };