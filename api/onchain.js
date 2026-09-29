const { guardRequest, isAddress, safeError } = require("../lib/http-policy");
const { signedGet } = require("../lib/binance-web3");

async function load(path) {
  try { return { ok: true, data: await signedGet(path) }; }
  catch (error) { return { ok: false, error }; }
}
function pick(result) {
  if (!result || !result.ok) return { error: result?.data?.msg || "unavailable" };
  return result.data.data ?? result.data;
}

module.exports = async function handler(req, res) {
  if (!guardRequest(req, res)) return;
  try {
    const url = new URL(req.url, "http://localhost");
    const token = (url.searchParams.get("token") || "").trim();
    const chain = url.searchParams.get("chain") || "56";
    if (!isAddress(token)) return res.status(400).json({ error: "Invalid token address" });
    if (chain !== "56") return res.status(400).json({ error: "Only BSC mainnet is supported" });
    if (!String(process.env.BINANCE_WEB3_API_KEY || "").trim() || !String(process.env.BINANCE_WEB3_API_SECRET || "").trim()) {
      return res.status(200).json({ mode: "demo", token, chain, explorer: "https://bscscan.com/token/" + token });
    }
    const q = "binanceChainId=" + encodeURIComponent(chain) + "&tokenContractAddress=" + encodeURIComponent(token);
    const [info, holders, trades, pools] = await Promise.all([
      load("/api/v1/dex/market/token/advanced-info?" + q),
      load("/api/v1/dex/market/token/holder?" + q),
      load("/api/v1/dex/market/trades?" + q + "&limit=12"),
      load("/api/v1/dex/market/token/top-liquidity?" + q)
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
