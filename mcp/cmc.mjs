const CMC_BASE = "https://pro-api.coinmarketcap.com/public-api";

async function getJSON(path, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const url = CMC_BASE + path + (query.toString() ? "?" + query.toString() : "");
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!response.ok) {
    const error = new Error("CoinMarketCap API " + response.status);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function cmcGlobalContext() {
  const data = await getJSON("/v1/global-metrics/quotes/latest", { convert: "USD" });
  const q = data?.data?.quote?.USD || {};
  return {
    source: "coinmarketcap-public-api",
    keyless: true,
    timestamp: data?.status?.timestamp || null,
    totalMarketCapUsd: q.total_market_cap ?? null,
    totalVolume24hUsd: q.total_volume_24h ?? null,
    btcDominance: q.btc_dominance ?? null,
    ethDominance: q.eth_dominance ?? null,
    activeCryptocurrencies: data?.data?.active_cryptocurrencies ?? null,
    activeExchanges: data?.data?.active_exchanges ?? null,
    marketCapChange24h: q.total_market_cap_by_asset ?? null
  };
}

export async function cmcCryptoPrice(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();
  if (!/^[A-Z0-9._-]{1,20}$/.test(normalized)) throw new Error("INVALID_CMC_SYMBOL");
  const data = await getJSON("/v2/simple/price", {
    symbol: normalized,
    convert: "USD",
    skip_invalid: true
  });
  const item = Array.isArray(data?.data) ? data.data[0] : null;
  const quote = item?.quotes?.[0] || {};
  if (!item || quote.price == null) throw Object.assign(new Error("CMC_ASSET_NOT_FOUND"), { status: 404 });
  return {
    source: "coinmarketcap-public-api",
    keyless: true,
    symbol: item.symbol,
    name: item.name,
    priceUsd: quote.price,
    marketCapUsd: quote.market_cap ?? null,
    volume24hUsd: quote.volume_24h ?? null,
    percentChange24h: quote.percent_change_24h ?? null,
    lastUpdated: quote.last_updated ?? null
  };
}

export function cmcUnavailable(error) {
  return {
    source: "coinmarketcap-public-api",
    available: false,
    error: error?.message || "CMC_UNAVAILABLE"
  };
}
