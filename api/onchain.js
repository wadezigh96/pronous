const { guardRequest, isAddress, safeError } = require("../lib/http-policy");
const { signedGet } = require("../lib/binance-web3");

const CMC_BASE = "https://pro-api.coinmarketcap.com";
const CMC_PUBLIC_BASE = "https://pro-api.coinmarketcap.com/public-api";

async function fetchCMC(path, params) {
  const qs = new URLSearchParams(params);
  const key = String(process.env.CMC_API_KEY || process.env.COINMARKETCAP_API_KEY || "").trim();
  const base = key ? CMC_BASE : CMC_PUBLIC_BASE;
  const headers = { Accept: "application/json" };
  if (key) headers["X-CMC_PRO_API_KEY"] = key;
  const r = await fetch(`${base}${path}?${qs.toString()}`, { headers, cache: "no-store" });
  const body = await r.json().catch(() => ({}));
  const code = body?.status?.error_code;
  if (!r.ok || (code != null && Number(code) !== 0)) {
    const e = new Error(body?.status?.error_message || `CoinMarketCap HTTP ${r.status}`);
    e.status = r.status;
    e.cmcCode = code;
    throw e;
  }
  return body?.data ?? body;
}

function listOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.data?.data)) return value.data.data;
  return [];
}

function firstOf(value) {
  const rows = listOf(value);
  return rows[0] || (value && typeof value === "object" && !Array.isArray(value) ? value : null);
}

function quoteOf(row) {
  if (!row) return {};
  if (Array.isArray(row.quote)) return row.quote[0] || {};
  return row.quote?.USD || row.quote?.usd || {};
}

function normalizePrice(row) {
  const p = firstOf(row) || {};
  return {
    address: p.a || p.address || null,
    name: p.n || p.name || null,
    symbol: p.sym || p.symbol || null,
    price: Number(p.p ?? p.price),
    change1h: Number(p.pc1h ?? p.percent_change_price_1h),
    change24h: Number(p.pc24h ?? p.percent_change_price_24h),
    volume24h: Number(p.v24h ?? p.volume_24h),
    liquidityUsd: Number(p.l ?? p.liquidity),
    marketCap: Number(p.mc ?? p.market_cap),
    updatedAt: p.ts || p.last_updated || null
  };
}

function normalizePools(value) {
  return listOf(value).map(row => {
    const q = quoteOf(row);
    return {
      address: row.contract_address || row.address || null,
      dex: row.dex_slug || row.dex_name || row.pdex || null,
      network: row.network_slug || "bsc",
      baseSymbol: row.base_asset_symbol || null,
      quoteSymbol: row.quote_asset_symbol || null,
      liquidityUsd: Number(q.liquidity ?? row.liquidity ?? row.liquidity_usd),
      price: Number(q.price ?? row.price),
      volume24h: Number(q.volume_24h ?? row.volume_24h),
      holders: Number(row.holders),
      transactions24h: Number(row.num_transactions_24h),
      buys24h: Number(row["24h_no_of_buys"]),
      sells24h: Number(row["24h_no_of_sells"]),
      lastUpdated: q.last_updated || row.last_updated || null,
      security: row.security_scan || null
    };
  });
}

function normalizeTrades(value) {
  return listOf(value).slice(0, 20).map(row => ({
    txHash: row.tx_hash || row.txHash || row.hash || null,
    type: row.type === 0 || String(row.type).toLowerCase() === "buy" ? "BUY" : row.type === 1 || String(row.type).toLowerCase() === "sell" ? "SELL" : row.type ?? null,
    maker: row.maker || row.maker_address || row.from_address || null,
    amount: Number(row.amount ?? row.token_amount),
    usdValue: Number(row.amount_usd ?? row.volume_usd ?? row.usd_value),
    price: Number(row.price_usd ?? row.price),
    timestamp: row.block_timestamp || row.timestamp || row.ts || null
  }));
}

function normalizeTokenDetail(value) {
  const row = firstOf(value) || {};
  return {
    name: row.n || row.name || null,
    symbol: row.sym || row.symbol || null,
    address: row.addr || row.address || null,
    decimals: Number(row.dec),
    creator: row.crt || null,
    owner: row.own || null,
    renounced: row.rnc || null,
    price: Number(row.p),
    priceHigh24h: Number(row.ph24h),
    priceLow24h: Number(row.pl24h),
    liquidityUsd: Number(row.liqUsd),
    marketCap: Number(row.mcap),
    fdv: Number(row.fdv),
    totalSupply: row.ts || null,
    circulatingSupply: row.cs || null,
    holders: Number(row.hld),
    updatedAt: row.pt || null
  };
}

async function loadCMCOnchain(token) {
  const common = { network_slug: "bsc", contract_address: token };
  const [detail, price, pools, trades, liquidity] = await Promise.all([
    fetchCMC("/v1/dex/token", { platform: "bsc", address: token }),
    fetchCMC("/v1/dex/token/price", { platform: "bsc", address: token }),
    fetchCMC("/v1/dex/token/pools", common),
    fetchCMC("/v1/dex/tokens/transactions", { platform: "bsc", address: token, limit: "20" }),
    fetchCMC("/v1/dex/token-liquidity/query", common)
  ]);

  const normalizedPrice = normalizePrice(price);
  const tokenInfo = normalizeTokenDetail(detail);
  const mergedInfo = { ...tokenInfo };
  for (const [key, value] of Object.entries(normalizedPrice)) {
    if (value != null && !(typeof value === "number" && Number.isNaN(value))) mergedInfo[key] = value;
  }

  return {
    mode: "live-onchain",
    source: "CoinMarketCap DEX",
    sourceMode: String(process.env.CMC_API_KEY || process.env.COINMARKETCAP_API_KEY || "").trim() ? "authenticated" : "public-api",
    network: "BSC",
    chainId: 56,
    token,
    explorer: "https://bscscan.com/token/" + token,
    info: mergedInfo,
    holders: Number.isFinite(tokenInfo.holders) ? tokenInfo.holders : null,
    trades: normalizeTrades(trades),
    pools: normalizePools(pools),
    liquidity: listOf(liquidity),
    freshness: "CMC DEX indexed on-chain data; REST snapshots are not block-streaming",
    updatedAt: normalizedPrice.updatedAt || tokenInfo.updatedAt || new Date().toISOString()
  };
}

async function loadBinanceFallback(token) {
  const q = "binanceChainId=56&tokenContractAddress=" + encodeURIComponent(token);
  const load = async path => {
    try { return { ok: true, data: await signedGet(path) }; }
    catch (error) { return { ok: false, error }; }
  };
  const pick = result => result?.ok ? (result.data?.data ?? result.data) : { error: "unavailable" };
  const [info, holders, trades, pools] = await Promise.all([
    load("/api/v1/dex/market/token/advanced-info?" + q),
    load("/api/v1/dex/market/token/holder?" + q),
    load("/api/v1/dex/market/trades?" + q + "&limit=12"),
    load("/api/v1/dex/market/token/top-liquidity?" + q)
  ]);
  return {
    mode: "live-data",
    source: "Binance Web3",
    network: "BSC",
    chainId: 56,
    token,
    explorer: "https://bscscan.com/token/" + token,
    info: pick(info), holders: pick(holders), trades: pick(trades), pools: pick(pools),
    freshness: "Binance Web3 indexed market data fallback"
  };
}

module.exports = async function handler(req, res) {
  if (!guardRequest(req, res)) return;
  try {
    const url = new URL(req.url, "http://localhost");
    const token = (url.searchParams.get("token") || "").trim();
    const chain = url.searchParams.get("chain") || "56";
    if (!isAddress(token)) return res.status(400).json({ error: "Invalid token address" });
    if (chain !== "56") return res.status(400).json({ error: "Only BSC mainnet is supported" });

    try {
      const data = await loadCMCOnchain(token);
      res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=10");
      return res.status(200).json(data);
    } catch (cmcError) {
      try {
        const fallback = await loadBinanceFallback(token);
        return res.status(200).json({ ...fallback, fallbackFrom: "CoinMarketCap DEX", fallbackReason: "CMC_ONCHAIN_UNAVAILABLE" });
      } catch (_) {
        return res.status(502).json({
          mode: "onchain-unavailable",
          source: "CoinMarketCap DEX",
          network: "BSC",
          chainId: 56,
          token,
          error: "ONCHAIN_DATA_UNAVAILABLE",
          upstream: cmcError?.message || "CoinMarketCap DEX unavailable"
        });
      }
    }
  } catch (e) {
    return safeError(res, 500, "ONCHAIN_REQUEST_FAILED");
  }
};
