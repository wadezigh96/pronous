const { guardRequest, isAddress } = require("../lib/http-policy");
const { signedGet } = require("../lib/binance-web3");

const LIVE_ENABLED = Boolean(
  (process.env.BINANCE_WEB3_API_KEY || "").trim() &&
  (process.env.BINANCE_WEB3_API_SECRET || "").trim()
);

const ALLOWED_ORIGIN = String(
  process.env.ALLOWED_ORIGIN || process.env.APP_ORIGIN || "https://pronous.vercel.app"
).trim().replace(/\/$/, "");

const DEFAULT_RPC = "https://bsc-dataseed.binance.org";

function sameOrigin(req, res) {
  const origin = String(req.headers?.origin || "").trim().replace(/\/$/, "");
  if (origin === ALLOWED_ORIGIN) return true;
  const fetchSite = String(req.headers?.["sec-fetch-site"] || "").trim().toLowerCase();
  if (!origin && fetchSite === "same-origin") return true;
  const referer = String(req.headers?.referer || "").trim();
  if (!origin && referer) {
    try {
      if (new URL(referer).origin === ALLOWED_ORIGIN) return true;
    } catch (_) {}
  }
  res.status(403).json({ error: "FORBIDDEN_ORIGIN" });
  return false;
}

function rpcConfig() {
  const raw = String(process.env.BSC_RPC_URL || DEFAULT_RPC).trim();
  const parsed = new URL(raw);
  const allowed = new Set(
    String(process.env.BSC_RPC_ALLOWED_HOSTS || "bsc-dataseed.binance.org,bsc-dataseed1.binance.org")
      .split(",").map(x => x.trim().toLowerCase()).filter(Boolean)
  );
  if (parsed.protocol !== "https:" || !allowed.has(parsed.hostname.toLowerCase())) {
    throw new Error("BSC_RPC_HOST_NOT_ALLOWED");
  }
  return raw;
}

async function rpc(method, params) {
  const response = await fetch(rpcConfig(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    signal: AbortSignal.timeout(Number(process.env.BSC_RPC_TIMEOUT_MS) || 8000)
  });
  const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) throw new Error("BSC_RPC_NON_JSON");
  const body = await response.json();
  if (!response.ok || body.error) throw new Error("BSC_RPC_ERROR");
  return body.result;
}

function padAddress(address) {
  return address.slice(2).toLowerCase().padStart(64, "0");
}

async function tokenBalance(address, token) {
  const [raw, decimalsHex] = await Promise.all([
    rpc("eth_call", [{ to: token, data: "0x70a08231" + padAddress(address) }, "latest"]),
    rpc("eth_call", [{ to: token, data: "0x313ce567" }, "latest"])
  ]);
  const decimals = Number(BigInt(decimalsHex || "0x12"));
  const rawValue = BigInt(raw || "0x0");
  const divisor = 10 ** Math.min(decimals, 36);
  const amount = decimals <= 36 ? Number(rawValue) / divisor : 0;
  return {
    raw: rawValue.toString(),
    decimals,
    amount: Number.isFinite(amount) ? amount : 0
  };
}

function cleanNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

module.exports = async function handler(req, res) {
  if (!guardRequest(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  if (!sameOrigin(req, res)) return;

  try {
    const url = new URL(req.url, "http://localhost");
    const wallet = String(url.searchParams.get("wallet") || "").trim();
    if (!isAddress(wallet)) return res.status(400).json({ error: "INVALID_WALLET" });

    const requested = String(url.searchParams.get("tickers") || "NVDA,AAPL,MSFT,TSLA")
      .split(",").map(x => x.trim().toUpperCase()).filter(Boolean).slice(0, 8);
    if (!requested.length || requested.some(x => !/^[A-Z0-9.-]{1,20}$/.test(x))) {
      return res.status(400).json({ error: "INVALID_TICKERS" });
    }

    if (!LIVE_ENABLED) {
      return res.status(200).json({
        mode: "demo",
        network: "BSC",
        wallet,
        assets: [],
        note: "Live Binance market credentials are not configured."
      });
    }

    const marketResponse = await signedGet("/api/v1/dex/market/rwa/tokens", { binanceChainId: "56" });
    const all = (marketResponse.data || []).filter(x => x.underlyingTicker && x.tokenContractAddress);
    const byTicker = new Map();
    for (const asset of all) {
      const ticker = String(asset.underlyingTicker).toUpperCase();
      if (requested.includes(ticker) && !byTicker.has(ticker)) byTicker.set(ticker, asset);
    }

    const nativeRaw = await rpc("eth_getBalance", [wallet, "latest"]);
    const native = Number(BigInt(nativeRaw || "0x0")) / 1e18;

    const assets = [];
    for (const ticker of requested) {
      const asset = byTicker.get(ticker);
      if (!asset) continue;
      try {
        const balance = await tokenBalance(wallet, asset.tokenContractAddress);
        const price = cleanNumber(asset.tokenPrice);
        assets.push({
          ticker,
          companyName: asset.underlyingName || asset.tokenName || ticker,
          platformId: asset.platformId || "unknown",
          tokenSymbol: asset.tokenSymbol || ticker,
          tokenContractAddress: asset.tokenContractAddress,
          balance: balance.amount,
          rawBalance: balance.raw,
          decimals: balance.decimals,
          tokenPrice: price,
          estimatedValue: price != null ? balance.amount * price : null,
          dataQuality: asset.dataQuality || null,
          marketStatus: asset.statusInfo?.marketStatus || null
        });
      } catch (_) {
        assets.push({
          ticker,
          companyName: asset.underlyingName || asset.tokenName || ticker,
          platformId: asset.platformId || "unknown",
          tokenSymbol: asset.tokenSymbol || ticker,
          tokenContractAddress: asset.tokenContractAddress,
          balance: null,
          rawBalance: null,
          decimals: null,
          tokenPrice: cleanNumber(asset.tokenPrice),
          estimatedValue: null,
          dataQuality: asset.dataQuality || null,
          marketStatus: asset.statusInfo?.marketStatus || null,
          balanceStatus: "unavailable"
        });
      }
    }

    const held = assets.filter(x => Number(x.balance) > 0);
    const totalValue = held.reduce((sum, x) => sum + (Number(x.estimatedValue) || 0), 0);

    return res.status(200).json({
      mode: "live-data",
      network: "BSC",
      chainId: 56,
      wallet,
      updatedAt: Date.now(),
      nativeBNB: native,
      assets,
      heldAssets: held.length,
      estimatedTokenizedValue: totalValue,
      coverage: { requested: requested.length, resolved: assets.length },
      readOnly: true,
      execution: { broadcast: false, signing: false }
    });
  } catch (error) {
    console.error("PRONOUS /api/portfolio internal error", {
      code: error?.message || "PORTFOLIO_LOOKUP_FAILED"
    });
    return res.status(502).json({
      mode: "live-error",
      network: "BSC",
      error: "PORTFOLIO_LOOKUP_FAILED"
    });
  }
};
