const CMC_BASE = "https://pro-api.coinmarketcap.com";

const RWA_CATEGORY_IDS = {
  rwa: null,
  tokenization: null
};

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
  const failed = !r.ok || (code != null && Number(code) !== 0);
  if (failed) {
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

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function quoteOf(row) {
  if (!row) return {};
  if (Array.isArray(row.quote)) return row.quote[0] || {};
  return row.quote?.USD || row.quote?.usd || {};
}

function normalizeRwaAsset(row) {
  const q = quoteOf(row);
  const tokens = Array.isArray(row.tokens) ? row.tokens : [];
  const lead = tokens[0] || {};
  return {
    kind: "rwa-asset",
    rwaId: row.rwa_id,
    id: row.rwa_id,
    name: row.name,
    symbol: row.symbol,
    slug: row.slug,
    assetType: row.asset_type || "rwa",
    rank: row.rwa_rank ?? row.rank ?? null,
    hasTokens: row.has_tokens !== false,
    price: num(row.average_tokenized_price ?? lead.price ?? q.price ?? q.average_tokenized_price),
    change1h: num(q.percent_change_1h ?? row.percent_change_1h),
    change24h: num(q.percent_change_24h ?? row.percent_change_24h),
    volume24h: num(row.tokenized_volume_24h ?? q.volume_24h ?? q.tokenized_volume_24h),
    marketCap: num(row.tokenized_market_cap ?? q.market_cap ?? q.tokenized_market_cap),
    tokenCount: tokens.length,
    leadToken: lead.symbol || null,
    tokens: tokens.slice(0, 4).map((t) => ({
      symbol: t.symbol,
      name: t.name,
      price: num(t.price),
      marketCap: num(t.market_cap),
      cryptoId: t.crypto_id
    })),
    lastUpdated: q.last_updated || row.last_updated
  };
}

function normalizeToken(row, category) {
  const q = quoteOf(row);
  return {
    kind: "tokenization-token",
    category,
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    slug: row.slug,
    rank: row.cmc_rank ?? row.rank ?? null,
    assetType: category,
    price: num(q.price),
    change1h: num(q.percent_change_1h),
    change24h: num(q.percent_change_24h),
    volume24h: num(q.volume_24h),
    marketCap: num(q.market_cap),
    lastUpdated: q.last_updated || row.last_updated
  };
}

function extractList(body) {
  const d = body?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.rwa_assets)) return d.rwa_assets;
  if (Array.isArray(d?.assets)) return d.assets;
  if (Array.isArray(d?.cryptoCurrencyList)) return d.cryptoCurrencyList;
  if (Array.isArray(d?.coins)) return d.coins;
  return [];
}

async function loadRwaAssets(limit) {
  const attempts = [
    { path: "/v5/real-world-assets/assets/list", params: { start: "1", limit: String(limit), sort: "rwa_rank", sort_dir: "asc", convert: "USD" } },
    { path: "/v5/real-world-assets/assets/list", params: { start: "1", limit: String(limit), convert: "USD" } }
  ];
  let lastErr;
  for (const a of attempts) {
    try {
      const body = await fetchCMC(a.path, a.params);
      const rows = extractList(body).map(normalizeRwaAsset).filter((x) => x.symbol);
      if (rows.length) return { rows, timestamp: body.status?.timestamp, source: "rwa-assets-list" };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("CMC RWA list empty");
}

async function resolveCategoryIds() {
  const found = { ...RWA_CATEGORY_IDS };
  try {
    const body = await fetchCMC("/v1/cryptocurrency/categories", { start: "1", limit: "100" });
    const rows = extractList(body);
    for (const row of rows) {
      const name = `${row.name || ""} ${row.title || ""} ${row.slug || ""}`.toLowerCase();
      if (/real[- ]world asset|\brwa\b/.test(name) && !/tokeni|protocol/.test(name) && !found.rwa) {
        found.rwa = String(row.id);
      }
      if (/rwa protocol/.test(name) && !found.rwaProtocol) {
        found.rwaProtocol = String(row.id);
      }
      if (/tokeni[sz]ation|tokenized asset/.test(name) && !found.tokenization) {
        found.tokenization = String(row.id);
      }
    }
  } catch (_) {}
  return found;
}

async function loadCategoryTokens(categoryId, category, limit) {
  if (!categoryId) return [];
  const body = await fetchCMC("/v1/cryptocurrency/category", {
    id: String(categoryId),
    start: "1",
    limit: String(limit),
    convert: "USD"
  });
  const coins = body.data?.coins || body.data?.cryptoCurrencyList || extractList(body);
  return coins.map((row) => normalizeToken(row, category)).filter((x) => x.symbol && Number.isFinite(x.price));
}

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 15, 5), 40);

    const categories = await resolveCategoryIds();
    const [rwaResult, rwaTokens, tokenizationTokens] = await Promise.allSettled([
      loadRwaAssets(limit),
      loadCategoryTokens(categories.rwa, "rwa", limit),
      loadCategoryTokens(categories.tokenization, "tokenization", limit)
    ]);

    if (rwaResult.status === "rejected" && rwaTokens.status === "rejected" && tokenizationTokens.status === "rejected") {
      const err = rwaResult.reason || rwaTokens.reason || tokenizationTokens.reason;
      throw err;
    }

    const rwaAssets = rwaResult.status === "fulfilled" ? rwaResult.value.rows : [];
    const rwaList = rwaTokens.status === "fulfilled" ? rwaTokens.value : [];
    const tokenisation = tokenizationTokens.status === "fulfilled" ? tokenizationTokens.value : [];

    const seen = new Set();
    const radar = [...rwaAssets, ...tokenisation, ...rwaList]
      .filter((x) => {
        const key = `${x.kind}:${x.symbol}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit * 2);

    const ts =
      (rwaResult.status === "fulfilled" && rwaResult.value.timestamp) ||
      new Date().toISOString();

    res.setHeader("Cache-Control", "s-maxage=45, stale-while-revalidate=30");
    return res.status(200).json({
      source: "CoinMarketCap",
      sourceMode: "authenticated",
      universe: "RWA + Tokenisation only",
      freshness: "CMC RWA rank + tokenisation category · ~45s",
      timestamp: ts,
      categories,
      rwaAssets,
      rwaTokens: rwaList,
      tokenisation,
      radar,
      counts: {
        rwaAssets: rwaAssets.length,
        rwaTokens: rwaList.length,
        tokenisation: tokenisation.length
      }
    });
  } catch (e) {
    return res.status(502).json({
      error: "CMC_RADAR_UNAVAILABLE",
      message: e.message || String(e),
      source: "CoinMarketCap",
      universe: "RWA + Tokenisation only",
      hint: "Set CMC_API_KEY. Endpoint uses /v5/real-world-assets/assets/list and RWA/Tokenisation categories."
    });
  }
};
