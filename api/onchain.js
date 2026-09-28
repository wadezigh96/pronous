const { guardRequest, isAddress, isAmount, safeError, requireSameOrigin } = require("../lib/http-policy");
const crypto = require("crypto");
const BASE = "https://web3.binance.com/build";
const RECV_WINDOW = process.env.BINANCE_WEB3_RECV_WINDOW || "60000";

function cred(v) {
  return String(v || "").replace(/^["']|["']$/g, "").replace(/\\n/g, "\n").trim();
}
function wirePath(p) {
  if (!p) return "/build";
  return p.startsWith("/build") ? p : "/build" + p;
}
function parseEd25519(secret) {
  const normalized=cred(secret);
  if (/-----BEGIN PRIVATE KEY-----/.test(normalized)) return crypto.createPrivateKey({key:normalized,format:"pem",type:"pkcs8"});
  const compact=normalized.replace(/\s+/g,""), b64=compact.replace(/-/g,"+").replace(/_/g,"/"), der=Buffer.from(b64+"=".repeat((4-(b64.length%4))%4),"base64");
  try { return crypto.createPrivateKey({key:der,format:"der",type:"pkcs8"}); }
  catch (_) { if(der.length===32) return crypto.createPrivateKey({key:Buffer.concat([Buffer.from("302e020100300506032b657004220420","hex"),der]),format:"der",type:"pkcs8"}); throw _; }
}
async function signedGet(path) {
  const apiKey = cred(process.env.BINANCE_WEB3_API_KEY);
  const secret = cred(process.env.BINANCE_WEB3_API_SECRET);
  if (!apiKey || !secret) throw new Error("LIVE_API_NOT_CONFIGURED");
  const timestamp = new Date().toISOString();
  const signedPath = wirePath(path);
  const prehash = timestamp + "GET" + signedPath;
  const algorithm = String(process.env.BINANCE_WEB3_SIGN_ALGO || "HMAC_SHA256").trim().toUpperCase();
  if (!["HMAC_SHA256","HMAC-SHA256","ED25519"].includes(algorithm)) throw new Error("UNSUPPORTED_SIGN_ALGO");
  const signature = algorithm === "ED25519"
    ? crypto.sign(null, Buffer.from(prehash, "utf8"), parseEd25519(secret)).toString("base64")
    : crypto.createHmac("sha256", secret).update(prehash, "utf8").digest("base64");
  const r = await fetch(BASE + path, {
    headers: {
      "X-OC-APIKEY": apiKey,
      "X-OC-TIMESTAMP": timestamp,
      "X-OC-SIGN": signature,
      "X-OC-RECV-WINDOW": RECV_WINDOW
    },
    signal: AbortSignal.timeout(8000)
  });
  const data = await r.json();
  return { ok: r.ok && (data.code === undefined || data.code === 0), status: r.status, data };
}
function pick(result) {
  if (!result || !result.ok) return { error: result?.data?.msg || "unavailable" };
  return result.data.data ?? result.data;
}

module.exports = async function handler(req, res) {
  if (!guardRequest(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  if (!requireSameOrigin(req, res)) return;
  try {
    const url = new URL(req.url, "http://localhost");
    const token = (url.searchParams.get("token") || "").trim();
    const chain = url.searchParams.get("chain") || "56";
    if (!isAddress(token)) return res.status(400).json({ error: "Invalid token address" });
    if (chain !== "56") return res.status(400).json({ error: "Only BSC mainnet is supported" });
    if (!cred(process.env.BINANCE_WEB3_API_KEY) || !cred(process.env.BINANCE_WEB3_API_SECRET)) {
      return res.status(200).json({ mode: "demo", token, chain, explorer: "https://bscscan.com/token/" + token });
    }
    const q = "binanceChainId=" + encodeURIComponent(chain) + "&tokenContractAddress=" + encodeURIComponent(token);
    const [info, holders, trades, pools] = await Promise.all([
      signedGet("/api/v1/dex/market/token/advanced-info?" + q),
      signedGet("/api/v1/dex/market/token/holder?" + q),
      signedGet("/api/v1/dex/market/trades?" + q + "&limit=12"),
      signedGet("/api/v1/dex/market/token/top-liquidity?" + q)
    ]);
    return res.status(200).json({
      mode: "live-data",
      network: chain === "56" ? "BSC" : chain,
      token,
      explorer: (chain === "56" ? "https://bscscan.com/token/" : "https://bscscan.com/token/") + token,
      info: pick(info),
      holders: pick(holders),
      trades: pick(trades),
      pools: pick(pools)
    });
  } catch (e) {
    return safeError(res, 500, "ONCHAIN_REQUEST_FAILED");
  }
};
