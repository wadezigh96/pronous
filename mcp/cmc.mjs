const CMC_KEYLESS_BASE = "https://pro-api.coinmarketcap.com/public-api";
const CMC_AUTH_BASE = "https://pro-api.coinmarketcap.com";
const CMC_TIMEOUT_MS = 8000;
const CMC_MAX_ATTEMPTS = 3;

function getBaseAndHeaders() {
  const key = process.env.CMC_API_KEY;
  return key
    ? { base: CMC_AUTH_BASE, headers: { Accept: "application/json", "X-CMC_PRO_API_KEY": key }, authenticated: true }
    : { base: CMC_KEYLESS_BASE, headers: { Accept: "application/json" }, authenticated: false };
}

function retryDelayMs(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1000, 2000);
  return Math.min(250 * (2 ** attempt), 1000);
}

async function getJSON(path, params = {}) {
  const { base, headers, authenticated } = getBaseAndHeaders();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  const url = base + path + (query.toString() ? "?" + query.toString() : "");
  let response;
  for (let attempt = 0; attempt < CMC_MAX_ATTEMPTS; attempt += 1) {
    try {
      response = await fetch(url, { headers, signal: AbortSignal.timeout(CMC_TIMEOUT_MS) });
    } catch (error) {
      if (attempt === CMC_MAX_ATTEMPTS - 1) throw Object.assign(new Error("CMC_NETWORK_ERROR"), { code: "CMC_NETWORK_ERROR", cause: error });
      await new Promise(resolve => setTimeout(resolve, retryDelayMs(null, attempt)));
      continue;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < CMC_MAX_ATTEMPTS - 1) {
      await new Promise(resolve => setTimeout(resolve, retryDelayMs(response, attempt)));
      continue;
    }
    break;
  }
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!response.ok) {
    const error = new Error("CoinMarketCap API " + response.status);
    error.code = response.status === 429 ? "CMC_RATE_LIMITED" : "CMC_HTTP_ERROR";
    error.status = response.status;
    error.data = data;
    throw error;
  }
  const apiCode = data?.status?.error_code;
  if (apiCode !== undefined && apiCode !== null && Number(apiCode) !== 0) {
    const error = new Error(data?.status?.error_message || "CMC_API_ERROR");
    error.code = "CMC_API_ERROR";
    error.status = 502;
    error.data = data;
    throw error;
  }
  return { data, authenticated };
}

export async function cmcGlobalContext() {
  const { data, authenticated } = await getJSON("/v1/global-metrics/quotes/latest", { convert: "USD" });
  const q = data?.data?.quote?.USD || {};
  return {
    source: "coinmarketcap-api",
    authenticated,
    keyless: !authenticated,
    timestamp: data?.status?.timestamp || null,
    totalMarketCapUsd: q.total_market_cap ?? null,
    totalVolume24hUsd: q.total_volume_24h ?? null,
    btcDominance: data?.data?.btc_dominance ?? null,
    ethDominance: data?.data?.eth_dominance ?? null,
    activeCryptocurrencies: data?.data?.active_cryptocurrencies ?? null,
    activeExchanges: data?.data?.active_exchanges ?? null
  };
}

export async function cmcCryptoPrice(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();
  if (!/^[A-Z0-9._-]{1,20}$/.test(normalized)) throw new Error("INVALID_CMC_SYMBOL");
  const { data, authenticated } = await getJSON("/v2/simple/price", {
    symbol: normalized,
    convert: "USD"
  });
  const entries = Array.isArray(data?.data) ? data.data : Object.values(data?.data || {});
  const item = entries[0];
  const quote = item?.quotes?.[0] || item?.quote?.USD || {};
  if (!item || quote.price == null) throw Object.assign(new Error("CMC_ASSET_NOT_FOUND"), { status: 404, code: "CMC_ASSET_NOT_FOUND" });
  return {
    source: "coinmarketcap-api",
    authenticated,
    keyless: !authenticated,
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
    source: "coinmarketcap-api",
    available: false,
    error: error?.code || error?.message || "CMC_UNAVAILABLE"
  };
}
