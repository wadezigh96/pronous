const CMC_BASE = "https://pro-api.coinmarketcap.com";

async function fetchCMC(path, params) {
  const qs = new URLSearchParams(params);
  const key = (process.env.CMC_API_KEY || process.env.COINMARKETCAP_API_KEY || "").trim();
  if (!key) {
    const e = new Error("CMC_API_KEY not set on server");
    e.status = 503;
    throw e;
  }
  const headers = {
    Accept: "application/json",
    "X-CMC_PRO_API_KEY": key
  };
  const r = await fetch(`${CMC_BASE}${path}?${qs.toString()}`, { headers });
  const body = await r.json().catch(() => ({}));
  const code = body?.status?.error_code;
  // CMC success is error_code === 0 (do not treat 0 as truthy failure)
  const failed =
    !r.ok ||
    (code != null && Number(code) !== 0);
  if (failed) {
    const msg =
      body?.status?.error_message ||
      body?.status?.error_message === "" && `CoinMarketCap error_code=${code}` ||
      `CoinMarketCap HTTP ${r.status}`;
    const e = new Error(
      body?.status?.error_message ||
        (code != null ? `CoinMarketCap error_code=${code}` : `CoinMarketCap HTTP ${r.status}`)
    );
    e.status = r.status;
    e.cmcCode = code;
    throw e;
  }
  return body;
}

function normalize(rows, direction) {
  return (rows || [])
    .map((x) => {
      const q = Array.isArray(x.quote) ? x.quote[0] : x.quote?.USD;
      return {
        id: x.id,
        name: x.name,
        symbol: x.symbol,
        rank: x.cmc_rank,
        price: Number(q?.price),
        change1h: Number(q?.percent_change_1h),
        change24h: Number(q?.percent_change_24h),
        volume24h: Number(q?.volume_24h),
        marketCap: Number(q?.market_cap),
        lastUpdated: q?.last_updated || x.last_updated,
        direction
      };
    })
    .filter((x) => Number.isFinite(x.price));
}

module.exports = async function handler(req, res) {
  try {
    const limit = Math.min(
      Math.max(Number(new URL(req.url, "http://localhost").searchParams.get("limit")) || 10, 5),
      25
    );
    const common = {
      start: "1",
      limit: String(limit),
      convert: "USD",
      sort: "percent_change_1h"
    };
    const [up, down] = await Promise.all([
      fetchCMC("/v1/cryptocurrency/listings/latest", { ...common, sort_dir: "desc" }),
      fetchCMC("/v1/cryptocurrency/listings/latest", { ...common, sort_dir: "asc" })
    ]);
    const gainers = normalize(up.data, "UP");
    const losers = normalize(down.data, "DOWN");
    const seen = new Set();
    const radar = [...gainers, ...losers]
      .filter((x) => {
        if (seen.has(x.id)) return false;
        seen.add(x.id);
        return true;
      })
      .slice(0, limit * 2);
    const ts = up.status?.timestamp || new Date().toISOString();
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");
    return res.status(200).json({
      source: "CoinMarketCap",
      sourceMode: "authenticated",
      freshness: "CMC listings · refreshed ~60s",
      timestamp: ts,
      gainers,
      losers,
      radar
    });
  } catch (e) {
    return res.status(502).json({
      error: "CMC_RADAR_UNAVAILABLE",
      message: e.message || String(e),
      source: "CoinMarketCap",
      hint: "Set CMC_API_KEY (or COINMARKETCAP_API_KEY) in Vercel env, then redeploy"
    });
  }
};
