const { guardRequest, isAddress, isAmount, safeError } = require("../lib/http-policy");
const crypto = require("crypto");

const BASE = "https://web3.binance.com/build";
const RECV_WINDOW = process.env.BINANCE_WEB3_RECV_WINDOW || "60000";

function cred(v) {
  return String(v || "")
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n")
    .trim();
}

function wirePath(p) {
  if (!p) return "/build";
  return p.startsWith("/build") ? p : "/build" + p;
}

function parseEd25519(secret) {
  const normalized = cred(secret);
  if (/-----BEGIN PRIVATE KEY-----/.test(normalized)) {
    return crypto.createPrivateKey({ key: normalized, format: "pem", type: "pkcs8" });
  }
  const compact = normalized.replace(/\s+/g, "");
  const b64 = compact.replace(/-/g, "+").replace(/_/g, "/");
  const der = Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64");
  try {
    return crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  } catch (_) {
    if (der.length === 32) {
      const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), der]);
      return crypto.createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
    }
    throw _;
  }
}

function signedHeaders(method, requestPath, body = "") {
  const apiKey = cred(process.env.BINANCE_WEB3_API_KEY);
  const secret = cred(process.env.BINANCE_WEB3_API_SECRET);
  if (!apiKey || !secret) return null;
  const timestamp = new Date().toISOString();
  const algo = String(process.env.BINANCE_WEB3_SIGN_ALGO || "HMAC_SHA256").trim().toUpperCase();
  const prehash = timestamp + method.toUpperCase() + wirePath(requestPath) + body;
  let signature;
  if (algo === "ED25519") {
    signature = crypto.sign(null, Buffer.from(prehash, "utf8"), parseEd25519(secret)).toString("base64");
  } else {
    signature = crypto.createHmac("sha256", secret).update(prehash, "utf8").digest("base64");
  }
  return {
    "X-OC-APIKEY": apiKey,
    "X-OC-TIMESTAMP": timestamp,
    "X-OC-SIGN": signature,
    "X-OC-RECV-WINDOW": RECV_WINDOW,
    "X-OC-NONCE": crypto.randomBytes(16).toString("hex")
  };
}

function qs(path, params) {
  const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!entries.length) return path;
  return path + "?" + entries.map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(String(v))).join("&");
}

async function binanceGet(path, params) {
  const requestPath = qs(path, params);
  const headers = signedHeaders("GET", requestPath, "");
  if (!headers) throw Object.assign(new Error("LIVE_API_NOT_CONFIGURED"), { status: 503 });
  const r = await fetch(BASE + requestPath, { headers });
  const data = await r.json();
  if (!r.ok || (data.code !== undefined && data.code !== 0)) {
    const e = new Error(data.msg || "Binance Web3 API error");
    e.status = r.status || 502;
    e.data = data;
    throw e;
  }
  return data;
}

async function binancePost(path, body) {
  const requestBody = JSON.stringify(body);
  const headers = signedHeaders("POST", path, requestBody);
  if (!headers) throw Object.assign(new Error("LIVE_API_NOT_CONFIGURED"), { status: 503 });
  headers["Content-Type"] = "application/json";
  const r = await fetch(BASE + path, { method: "POST", headers, body: requestBody });
  const data = await r.json();
  if (!r.ok || (data.code !== undefined && data.code !== 0)) {
    const e = new Error(data.msg || "Binance Web3 API error");
    e.status = r.status || 502;
    e.data = data;
    throw e;
  }
  return data;
}

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const action = url.searchParams.get("action") || "info";

    if (action === "info") {
      return res.status(200).json({
        agent: "PRONOUS",
        skill: "client-broadcast",
        network: "BSC",
        broadcast: "wallet-only",
        actions: ["approve", "submitRfq", "orderStatus", "history"]
      });
    }

    if (action === "approve") {
      const params = {
        binanceChainId: "56",
        tokenContractAddress: url.searchParams.get("tokenContractAddress") || url.searchParams.get("fromTokenAddress"),
        approveAmount: url.searchParams.get("approveAmount") || url.searchParams.get("amount"),
        vendor: url.searchParams.get("vendor") || undefined
      };
      if (!isAddress(params.tokenContractAddress)) return res.status(400).json({ error: "Invalid tokenContractAddress" });
      if (!isAmount(params.approveAmount)) return res.status(400).json({ error: "Invalid approveAmount" });
      const data = await binanceGet("/api/v1/dex/aggregator/approve-transaction", params);
      return res.status(200).json({ mode: "live-approve", network: "BSC", data, broadcast: false });
    }

    if (action === "submitRfq") {
      let body = {};
      try {
        if (req.body) body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      } catch (_) {}
      if (!body.userSignature) body.userSignature = url.searchParams.get("userSignature");
      if (!body.quoteId) body.quoteId = url.searchParams.get("quoteId");
      if (!body.vendor) body.vendor = url.searchParams.get("vendor");
      if (!body.requestId) body.requestId = url.searchParams.get("requestId") || crypto.randomUUID();
      if (!body.userSignature || !body.quoteId || String(body.userSignature).length > 2000 || String(body.quoteId).length > 200) {
        return res.status(400).json({ error: "userSignature and quoteId required" });
      }
      const data = await binancePost("/api/v1/dex/aggregator/order/submit", body);
      return res.status(200).json({ mode: "live-rfq-submit", network: "BSC", data, requestId: body.requestId });
    }

    if (action === "orderStatus") {
      const orderId = url.searchParams.get("orderId");
      if (!orderId || !/^[A-Za-z0-9._:-]{1,200}$/.test(orderId)) return res.status(400).json({ error: "Invalid orderId" });
      const data = await binanceGet("/api/v1/dex/aggregator/order/" + encodeURIComponent(orderId), {});
      return res.status(200).json({ mode: "live-rfq-status", network: "BSC", data });
    }

    if (action === "history") {
      const txHash = url.searchParams.get("txHash");
      if (!/^0x[a-fA-F0-9]{64}$/.test(String(txHash || ""))) return res.status(400).json({ error: "Invalid txHash" });
      const data = await binanceGet("/api/v1/dex/aggregator/history", {
        binanceChainId: "56",
        txHash
      });
      return res.status(200).json({ mode: "live-tx-history", network: "BSC", data });
    }

    return res.status(400).json({ error: "Unknown trade action" });
  } catch (e) {
    return safeError(res, Number(e.status) >= 400 ? Number(e.status) : 502, "TRADE_REQUEST_FAILED");
  }
};
