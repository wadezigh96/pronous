// PancakeSwap BSC route preview only. This module never builds, signs, or broadcasts txs.
const ROUTING_API = "https://router.pancakeswap.finance/v0/quote";
const BSC_CHAIN_ID = 56;
const USDT = "0x55d398326f99059ff775485246999027b3197955";
const USDC = "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d";
const STABLECOINS = new Set([USDT, USDC]);
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const MAX_UINT256 = (1n << 256n) - 1n;
const DECIMALS_CACHE = new Map();
const DECIMALS_CACHE_MS = 24 * 60 * 60 * 1000;

function fail(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  throw error;
}

function normalizeAddress(value) {
  const address = String(value || "").trim();
  return ADDRESS_RE.test(address) ? address.toLowerCase() : "";
}

function parseHumanAmount(value, decimals) {
  const input = String(value ?? "").trim();
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  if (!/^\d+(?:\.\d+)?$/.test(input)) return null;
  const [whole, fraction = ""] = input.split(".");
  if (fraction.length > decimals) return null;
  const raw = (whole + fraction.padEnd(decimals, "0")).replace(/^0+(?=\d)/, "") || "0";
  try {
    const number = BigInt(raw);
    if (number <= 0n || number > MAX_UINT256) return null;
    return number.toString();
  } catch (_) {
    return null;
  }
}

function formatRawAmount(value, decimals) {
  let raw;
  try {
    raw = BigInt(String(value)).toString();
  } catch (_) {
    return null;
  }
  if (raw.startsWith("-") || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  if (decimals === 0) return raw;
  raw = raw.padStart(decimals + 1, "0");
  const whole = raw.slice(0, -decimals);
  const fraction = raw.slice(-decimals).replace(/0+$/, "");
  return fraction ? whole + "." + fraction : whole;
}

function getRpcUrl(override) {
  const rpcUrl = String(override || process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org").trim();
  let parsed;
  try {
    parsed = new URL(rpcUrl);
  } catch (_) {
    fail("INVALID_BSC_RPC_URL", 500);
  }
  const allowed = new Set(
    String(process.env.BSC_RPC_ALLOWED_HOSTS || "bsc-dataseed.binance.org")
      .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean)
  );
  if (parsed.protocol !== "https:" || !allowed.has(parsed.hostname.toLowerCase())) {
    fail("BSC_RPC_HOST_NOT_ALLOWED", 500);
  }
  return rpcUrl;
}

async function readTokenDecimals(address, { fetchImpl = globalThis.fetch, rpcUrl, now = Date.now } = {}) {
  const token = normalizeAddress(address);
  if (!token) fail("INVALID_TOKEN_ADDRESS");
  if (typeof fetchImpl !== "function") fail("FETCH_UNAVAILABLE", 500);
  const cacheKey = token + "|" + getRpcUrl(rpcUrl);
  const timestamp = now();
  const cached = DECIMALS_CACHE.get(cacheKey);
  if (cached && timestamp - cached.timestamp < DECIMALS_CACHE_MS) return cached.decimals;
  const response = await fetchImpl(getRpcUrl(rpcUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: token, data: "0x313ce567" }, "latest"]
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response || !response.ok) fail("BSC_TOKEN_METADATA_UNAVAILABLE", 502);
  const body = await response.json();
  if (body?.error || typeof body?.result !== "string" || !/^0x[0-9a-f]+$/i.test(body.result)) {
    fail("BSC_TOKEN_DECIMALS_UNAVAILABLE", 502);
  }
  const decimals = Number(BigInt(body.result));
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) fail("INVALID_TOKEN_DECIMALS", 502);
  DECIMALS_CACHE.set(cacheKey, { decimals, timestamp });
  return decimals;
}

function validatePancakePair({ tokenInAddress, tokenOutAddress, assetAddress } = {}) {
  const tokenIn = normalizeAddress(tokenInAddress);
  const tokenOut = normalizeAddress(tokenOutAddress);
  const asset = normalizeAddress(assetAddress);
  if (!tokenIn || !tokenOut || !asset) return { ok: false, error: "INVALID_TOKEN_ADDRESS" };
  if (tokenIn === tokenOut) return { ok: false, error: "TOKENS_MUST_DIFFER" };
  const supported = (STABLECOINS.has(tokenIn) && tokenOut === asset) ||
    (tokenIn === asset && STABLECOINS.has(tokenOut));
  if (!supported) return { ok: false, error: "UNSUPPORTED_PANCAKESWAP_PAIR" };
  return { ok: true, tokenIn, tokenOut, asset };
}

async function getPancakeQuote(input = {}, options = {}) {
  const pair = validatePancakePair(input);
  if (!pair.ok) fail(pair.error, 400);
  const amount = String(input.amount ?? "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(amount)) fail("INVALID_AMOUNT", 400);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_UNAVAILABLE", 500);

  const rpcUrl = options.rpcUrl;
  const [decimalsIn, decimalsOut] = await Promise.all([
    readTokenDecimals(pair.tokenIn, { fetchImpl, rpcUrl, now: options.now }),
    readTokenDecimals(pair.tokenOut, { fetchImpl, rpcUrl, now: options.now })
  ]);
  const amountInRaw = parseHumanAmount(amount, decimalsIn);
  if (!amountInRaw) fail("INVALID_AMOUNT_FOR_TOKEN_DECIMALS", 400);

  const url = new URL(ROUTING_API);
  url.searchParams.set("tokenInAddress", pair.tokenIn);
  url.searchParams.set("tokenInChainId", String(BSC_CHAIN_ID));
  url.searchParams.set("tokenOutAddress", pair.tokenOut);
  url.searchParams.set("tokenOutChainId", String(BSC_CHAIN_ID));
  url.searchParams.set("amount", amountInRaw);
  url.searchParams.set("type", "exactIn");
  url.searchParams.set("maxHops", "3");
  url.searchParams.set("maxSplits", "4");

  let response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000)
    });
  } catch (_) {
    fail("PANCAKESWAP_ROUTING_API_UNAVAILABLE", 502);
  }
  if (!response || !response.ok) fail("PANCAKESWAP_NO_ROUTE_OR_UPSTREAM_ERROR", 502);
  let body;
  try {
    body = await response.json();
  } catch (_) {
    fail("PANCAKESWAP_INVALID_RESPONSE", 502);
  }
  const trade = body && body.trade;
  if (!trade || !/^\d+$/.test(String(trade.inputAmount ?? "")) || !/^\d+$/.test(String(trade.outputAmount ?? ""))) {
    fail("PANCAKESWAP_NO_ROUTE", 502);
  }

  const routeTypes = Array.isArray(trade.routes)
    ? trade.routes.slice(0, 8).map((route) => String(route?.type || "UNKNOWN").slice(0, 24))
    : [];
  const quotedAt = typeof options.now === "function" ? options.now() : Date.now();
  return {
    status: "QUOTE_ONLY",
    venue: "PancakeSwap",
    chainId: BSC_CHAIN_ID,
    tokenInAddress: pair.tokenIn,
    tokenOutAddress: pair.tokenOut,
    amountInRaw: String(trade.inputAmount),
    amountOutRaw: String(trade.outputAmount),
    amountIn: formatRawAmount(trade.inputAmount, decimalsIn),
    amountOut: formatRawAmount(trade.outputAmount, decimalsOut),
    decimalsIn,
    decimalsOut,
    priceImpact: trade.priceImpact == null ? null : String(trade.priceImpact).slice(0, 32),
    blockNumber: Number.isSafeInteger(Number(trade.blockNumber)) ? Number(trade.blockNumber) : null,
    routeTypes,
    quotedAt,
    validForMs: 15000,
    calldataAvailable: false,
    broadcast: false
  };
}

module.exports = {
  ROUTING_API,
  BSC_CHAIN_ID,
  USDT,
  USDC,
  normalizeAddress,
  parseHumanAmount,
  formatRawAmount,
  readTokenDecimals,
  validatePancakePair,
  getPancakeQuote
};
