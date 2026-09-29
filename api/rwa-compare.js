const { guardRequest, safeError } = require("../lib/http-policy");
const { signedGet } = require("../lib/binance-web3");
const { compareTokenisedRepresentations, normaliseTicker } = require("../lib/rwa-parity");

const LIVE_ENABLED = Boolean(
  (process.env.BINANCE_WEB3_API_KEY || "").trim() &&
  (process.env.BINANCE_WEB3_API_SECRET || "").trim()
);

module.exports = async function handler(req, res) {
  if (!guardRequest(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  try {
    if (!LIVE_ENABLED) return res.status(503).json({ error: "RWA comparison requires live Binance Web3 credentials" });

    const url = new URL(req.url, "http://localhost");
    const ticker = normaliseTicker(url.searchParams.get("ticker") || "NVDA");
    if (!/^[A-Z0-9.-]{1,20}$/.test(ticker)) return res.status(400).json({ error: "Invalid ticker" });

    const data = await signedGet("/api/v1/dex/market/rwa/tokens", { binanceChainId: "56" });
    const assets = (data.data || [])
      .filter((x) => normaliseTicker(x.underlyingTicker) === ticker)
      .filter((x) => x.tokenContractAddress)
      .filter((x) => ["ondo", "bstock", "xstocks"].includes(String(x.platformId || "").toLowerCase()))
      .map((x) => ({
        ticker: x.underlyingTicker,
        companyName: x.underlyingName || x.tokenName || "",
        platformId: String(x.platformId).toLowerCase(),
        tokenSymbol: x.tokenSymbol || "",
        tokenContractAddress: x.tokenContractAddress,
        tokenPrice: x.tokenPrice ?? null,
        referencePrice: x.referencePrice ?? null,
        spreadPct: x.spreadPct ?? null,
        dataQuality: x.dataQuality || "unknown",
        actionable: x.actionable === true,
        marketStatus: x.statusInfo?.marketStatus || null,
        openState: x.statusInfo?.openState ?? null,
        nextOpenTime: x.statusInfo?.nextOpenTime ?? null,
        nextCloseTime: x.statusInfo?.nextCloseTime ?? null
      }));

    const comparison = compareTokenisedRepresentations(ticker, assets);
    return res.status(200).json({
      agent: "PRONOUS",
      action: "rwa-compare",
      source: "Binance Web3 RWA API",
      network: "BSC",
      ticker,
      comparedAt: new Date().toISOString(),
      comparison,
      execution: {
        broadcast: false,
        simulationRequired: true,
        confirmationRequired: true,
        spotOnly: true,
        network: "BSC"
      }
    });
  } catch (e) {
    return safeError(res, Number(e.status) >= 400 ? Number(e.status) : 502, "RWA_COMPARE_UNAVAILABLE");
  }
};
