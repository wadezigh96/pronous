const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
const ALLOWED_ORIGIN = String(process.env.ALLOWED_ORIGIN || process.env.APP_ORIGIN || "https://pronous.vercel.app").trim().replace(/\/$/,"");
const buckets = new Map();

function clientIp(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req.socket?.remoteAddress || "unknown");
}

function allowedOrigin(req) {
  const origin = String(req.headers?.origin || "").trim().replace(/\/$/,"");
  if (!origin) return null;
  return origin === ALLOWED_ORIGIN ? origin : null;
}

function sameOrigin(req) {
  const origin = String(req.headers?.origin || "").trim().replace(/\/$/,"");
  const fetchSite = String(req.headers?.["sec-fetch-site"] || "").toLowerCase();
  return origin === ALLOWED_ORIGIN || fetchSite === "same-origin";
}

function requireSameOrigin(req, res) {
  if (sameOrigin(req)) return true;
  res.status(403).json({ error: "FORBIDDEN_ORIGIN" });
  return false;
}

function guardRequest(req, res) {
  const origin = allowedOrigin(req);
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return false; }

  const now = Date.now();
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

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

function isAmount(value) {
  const s = String(value ?? "").trim();
  return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s) && Number.isFinite(Number(s));
}

function safeError(res, status = 500, code = "REQUEST_FAILED") {
  return res.status(status).json({ error: code });
}

module.exports = { guardRequest, isAddress, isAmount, safeError, requireSameOrigin };
