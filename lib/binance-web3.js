const crypto = require("crypto");

const BASE = "https://web3.binance.com/build";
const DEFAULT_TIMEOUT_MS = 8000;

function normalizeCredential(value) {
  return String(value || "")
    .replace(/^["']|["']$/g, "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .trim();
}

function wirePath(path) {
  if (!path) return "/build";
  return path.startsWith("/build") ? path : "/build" + path;
}

function buildRequestPath(path, params = {}) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!entries.length) return path;
  return path + "?" + entries.map(([key, value]) => encodeURIComponent(key) + "=" + encodeURIComponent(String(value))).join("&");
}

function signEd25519(secret, payload) {
  const normalized = normalizeCredential(secret);
  let key;
  if (/-----BEGIN PRIVATE KEY-----/.test(normalized)) {
    key = crypto.createPrivateKey({ key: normalized, format: "pem", type: "pkcs8" });
  } else {
    const compact = normalized.replace(/\s+/g, "");
    const b64 = compact.replace(/-/g, "+").replace(/_/g, "/");
    const der = Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64");
    try {
      key = crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
    } catch (_) {
      if (der.length !== 32) throw _;
      key = crypto.createPrivateKey({
        key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), der]),
        format: "der",
        type: "pkcs8"
      });
    }
  }
  return crypto.sign(null, Buffer.from(payload, "utf8"), key).toString("base64");
}

function signedHeaders(method, requestPath, body = "") {
  const apiKey = normalizeCredential(process.env.BINANCE_WEB3_API_KEY);
  const secret = normalizeCredential(process.env.BINANCE_WEB3_API_SECRET);
  if (!apiKey || !secret) {
    const error = new Error("LIVE_API_NOT_CONFIGURED");
    error.status = 503;
    throw error;
  }

  const timestamp = new Date().toISOString();
  const normalizedMethod = method.toUpperCase();
  const signedPath = wirePath(requestPath);
  const prehash = timestamp + normalizedMethod + signedPath + body;
  const algorithm = String(process.env.BINANCE_WEB3_SIGN_ALGO || "HMAC_SHA256").trim().toUpperCase();

  let signature;
  if (algorithm === "ED25519") {
    signature = signEd25519(secret, prehash);
  } else if (algorithm === "HMAC_SHA256" || algorithm === "HMAC-SHA256") {
    signature = crypto.createHmac("sha256", secret).update(prehash, "utf8").digest("base64");
  } else {
    const error = new Error("UNSUPPORTED_SIGN_ALGO");
    error.status = 500;
    throw error;
  }

  return {
    "X-OC-APIKEY": apiKey,
    "X-OC-TIMESTAMP": timestamp,
    "X-OC-SIGN": signature,
    "X-OC-RECV-WINDOW": process.env.BINANCE_WEB3_RECV_WINDOW || "60000",
    "X-OC-NONCE": crypto.randomBytes(16).toString("hex")
  };
}

async function request(method, path, params = {}, body = {}) {
  const requestPath = method === "GET" ? buildRequestPath(path, params) : path;
  const requestBody = method === "GET" ? "" : JSON.stringify(body);
  const headers = signedHeaders(method, requestPath, requestBody);
  if (method !== "GET") headers["Content-Type"] = "application/json";

  const response = await fetch(BASE + requestPath, {
    method,
    headers,
    ...(method === "GET" ? {} : { body: requestBody }),
    signal: AbortSignal.timeout(Number(process.env.BINANCE_WEB3_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS)
  });

  const type = String(response.headers?.get?.("content-type") || "").toLowerCase();
  if (!type.includes("application/json")) {
    const error = new Error("UPSTREAM_NON_JSON");
    error.status = 502;
    throw error;
  }

  const data = await response.json();
  if (!response.ok || (data.code !== undefined && data.code !== 0)) {
    const error = new Error("BINANCE_WEB3_UPSTREAM_FAILED");
    error.status = response.status >= 500 ? 502 : response.status || 502;
    throw error;
  }
  return data;
}

function publicKeyFingerprint(secret) {
  const normalized = normalizeCredential(secret);
  let key;
  if (/-----BEGIN PRIVATE KEY-----/.test(normalized)) {
    key = crypto.createPrivateKey({ key: normalized, format: "pem", type: "pkcs8" });
  } else {
    const compact = normalized.replace(/\s+/g, "");
    const b64 = compact.replace(/-/g, "+").replace(/_/g, "/");
    const der = Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64");
    try {
      key = crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
    } catch (_) {
      if (der.length !== 32) throw _;
      key = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), der]), format: "der", type: "pkcs8" });
    }
  }
  return crypto.createHash("sha256").update(crypto.createPublicKey(key).export({ format: "der", type: "spki" })).digest("hex");
}

function signedGet(path, params) {
  return request("GET", path, params);
}

function signedPost(path, body) {
  return request("POST", path, {}, body);
}

module.exports = { signedGet, signedPost, normalizeCredential, buildRequestPath, publicKeyFingerprint };
