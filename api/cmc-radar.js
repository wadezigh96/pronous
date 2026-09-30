const { guardRequest, isAddress, isAmount, safeError } = require("../lib/http-policy");
const CMC_BASE = "https://pro-api.coinmarketcap.com";

async function fetchCMC(path, params) {
  const qs = new URLSearchParams(params);
  const key = (process.env.CMC_API_KEY || process.env.COINMARKETCAP_API_KEY || "").trim();
  if (!key) { const e = new Error("CMC_API_KEY not set on server"); e.status = 503; throw e; }
  const r = await fetch(`${CMC_BASE}${path}?${qs.toString()}`, { headers: { Accept: "application/json", "X-CMC_PRO_API_KEY": key } });
  const body = await r.json().catch(() => ({}));
  const code = body?.status?.error_code;
  if (!r.ok || (code != null && Number(code) !== 0)) {
    const e = new Error(body?.status?.error_message || (code != null ? `CoinMarketCap error_code=${code}` : `CoinMarketCap HTTP ${r.status}`));
    e.status = r.status; e.cmcCode = code; throw e;
  }
  return body;
}
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function quoteOf(row) {
  if (!row) return {};
  if (Array.isArray(row.quotes)) return row.quotes.find(q => String(q?.symbol || '').toUpperCase() === 'USD') || row.quotes[0] || {};
  if (Array.isArray(row.quote)) return row.quote.find(q => String(q?.symbol || '').toUpperCase() === 'USD') || row.quote[0] || {};
  return row.quote?.USD || row.quote?.usd || {};
}
function normalizeRwaAsset(row) {
  const q = quoteOf(row);
  const tokens = Array.isArray(row.tokens) ? row.tokens : [];
  return {
    kind: "rwa-asset", rwaId: row.rwa_id, id: row.rwa_id, name: row.name, symbol: row.symbol, slug: row.slug,
    assetType: row.asset_type || "rwa", rank: row.rwa_rank ?? row.rank ?? null, hasTokens: row.has_tokens !== false,
    price: num(row.average_tokenized_price ?? q.average_tokenized_price),
    change1h: num(q.percent_change_1h ?? row.percent_change_1h),
    change24h: num(q.percent_change_24h ?? row.percent_change_24h),
    volume24h: num(row.tokenized_volume_24h ?? q.tokenized_volume_24h ?? q.volume_24h),
    marketCap: num(row.tokenized_market_cap ?? q.tokenized_market_cap ?? q.market_cap),
    tokenCount: tokens.length, leadToken: tokens[0]?.symbol || null,
    tokens: tokens.slice(0, 8).map(t => ({
      symbol: t.symbol, name: t.name, price: num(t.price), marketCap: num(t.market_cap),
      cryptoId: t.crypto_id, issuerId: t.issuer_id || null, issuerName: t.issuer_name || null
    })),
    lastUpdated: q.last_updated || row.last_updated
  };
}
function flattenRwaTokens(rows) {
  return rows.flatMap(asset => (asset.tokens || []).map((token, index) => ({
    kind: "rwa-token", id: token.cryptoId || (String(asset.rwaId) + ":" + token.symbol), rwaId: asset.rwaId,
    name: token.name || asset.name, symbol: token.symbol, slug: asset.slug,
    assetType: asset.assetType || "rwa", rank: asset.rank ?? null, tokenRank: index + 1,
    price: token.price, change1h: null, change24h: null, volume24h: null, marketCap: token.marketCap,
    issuerId: token.issuerId, issuerName: token.issuerName, lastUpdated: asset.lastUpdated
  })));
}
function normalizeToken(row, category) {
  const q = quoteOf(row);
  return { kind: "tokenization-token", category, id: row.id, name: row.name, symbol: row.symbol, slug: row.slug,
    rank: row.cmc_rank ?? row.rank ?? null, assetType: category, price: num(q.price), change1h: num(q.percent_change_1h),
    change24h: num(q.percent_change_24h), volume24h: num(q.volume_24h), marketCap: num(q.market_cap), lastUpdated: q.last_updated || row.last_updated };
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
  const body = await fetchCMC('/v5/real-world-assets/assets/list', { start: '1', limit: String(limit), sort: 'rwa_rank', sort_dir: 'asc', convert: 'USD' });
  const rows = extractList(body).map(normalizeRwaAsset).filter(x => x.symbol);
  if (!rows.length) throw new Error('CMC RWA list empty');
  return { rows, timestamp: body.status?.timestamp, source: 'rwa-assets-list' };
}
async function loadRwaQuotes(rows) {
  const ids = rows.map(x => x.rwaId).filter(Boolean).join(',');
  if (!ids) return rows;
  const body = await fetchCMC('/v5/real-world-assets/quotes/latest', { rwa_id: ids, convert: 'USD' });
  const quoteRows = extractList(body);
  const byId = new Map(quoteRows.map(r => [String(r.rwa_id), normalizeRwaAsset(r)]));
  return rows.map(r => {
    const q = byId.get(String(r.rwaId));
    if (!q) return r;
    return { ...r, price: q.price ?? r.price, change1h: q.change1h ?? r.change1h, change24h: q.change24h ?? r.change24h,
      volume24h: q.volume24h ?? r.volume24h, marketCap: q.marketCap ?? r.marketCap, tokenCount: q.tokenCount || r.tokenCount,
      leadToken: q.leadToken || r.leadToken, tokens: q.tokens?.length ? q.tokens : r.tokens, lastUpdated: q.lastUpdated || r.lastUpdated };
  });
}
async function loadIssuerTokens(limit) {
  const body = await fetchCMC('/v5/real-world-assets/issuers/list', { start: '1', limit: String(Math.min(limit, 20)), active: 'true' });
  const issuers = Array.isArray(body?.data?.issuers) ? body.data.issuers : [];
  return issuers.map(i => ({ kind: 'rwa-issuer', category: 'tokenization', id: i.issuer_id, name: i.name, symbol: 'ISSUER', assetType: 'tokenization', tokenCount: num(i.num_tokens), price: null, change1h: null, change24h: null, volume24h: null, marketCap: null, lastUpdated: body.status?.timestamp })).slice(0, limit);
}
module.exports = async function handler(req, res) {
  if (!guardRequest(req, res)) return;
  try {
    const url = new URL(req.url, 'http://localhost');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 15, 5), 40);
    const rwaResult = await loadRwaAssets(limit);
    let rwaAssets = rwaResult.rows;
    try { rwaAssets = await loadRwaQuotes(rwaAssets); } catch (_) {}
    let issuers = [];
    try { issuers = await loadIssuerTokens(limit); } catch (_) {}
    const seen = new Set();
    const rwaTokens = flattenRwaTokens(rwaAssets);
    const radar = [...rwaAssets, ...rwaTokens, ...issuers].filter(x => {
      const key = x.kind + ":" + x.symbol + ":" + x.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, limit * 3);
    return res.status(200).json({ source: 'CoinMarketCap', sourceMode: 'authenticated', universe: 'RWA + Tokenisation', freshness: 'CMC RWA quotes ~60s; issuer map ~30s', timestamp: rwaResult.timestamp || new Date().toISOString(), rwaAssets, rwaTokens, tokenisation: issuers, radar, counts: { rwaAssets: rwaAssets.length, rwaTokens: rwaTokens.length, tokenisation: issuers.length } });
  } catch (e) {
    return safeError(res, 502, 'CMC_RADAR_UNAVAILABLE');
  }
};
