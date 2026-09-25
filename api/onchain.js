const crypto = require("crypto");
const BASE = "https://web3.binance.com/build";

function cred(v) {
  return String(v || "").replace(/^["']|["']$/g, "").replace(/\\n/g, "\n").trim();
}
function wirePath(p) {
  if (!p) return "/build";
  return p.startsWith("/build") ? p : "/build" + p;
}
async function signedGet(path) {
  const apiKey = cred(process.env.BINANCE_WEB3_API_KEY);
  const secret = cred(process.env.BINANCE_WEB3_API_SECRET);
  if (!apiKey || !secret) throw new Error("LIVE_API_NOT_CONFIGURED");
  const timestamp = new Date().toISOString();
  const signedPath = wirePath(path);
  const prehash = timestamp + "GET" + signedPath;
  const signature = crypto.createHmac("sha256", secret).update(prehash, "utf8").digest("base64");
  const r = await fetch(BASE + path, {
    headers: {
      "X-OC-APIKEY": apiKey,
      "X-OC-TIMESTAMP": timestamp,
      "X-OC-SIGN": signature,
      "X-OC-RECV-WINDOW": process.env.BINANCE_WEB3_RECV_WINDOW || "60000"
    }
  });
  const data = await r.json();
  return { ok: r.ok && (data.code === undefined || data.code === 0), status: r.status, data };
}
function pick(result) {
  if (!result || !result.ok) return { error: result?.data?.msg || "unavailable" };
  return result.data.data ?? result.data;
}

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const token = (url.searchParams.get("token") || "").trim();
    const chain = url.searchParams.get("chain") || "56";
    if (!token) return res.status(400).json({ error: "token required" });
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
    return res.status(500).json({ error: e.message || "On-chain lookup failed" });
  }
};
