const DEFAULT_API = "https://pronous.vercel.app";
const SUPPORTED_PLATFORMS = new Set(["ondo", "bstock", "xstocks"]);
const TICKER_RE = /^[A-Z0-9.-]{1,20}$/;
const IGNORED_TICKERS = new Set([
  "API", "BSC", "BNB", "USD", "USDT", "USDC", "RWA", "MCP", "NFT", "AI",
  "THE", "AND", "FOR", "WITH", "FROM", "INTO", "LIVE", "SCAN", "STOCK",
  "GAP", "PRICE", "TOKEN", "MARKET", "ONCHAIN", "CHAIN", "REPORT"
]);

export interface PronousResearchSnapshot {
  status: "VERIFIED_LIVE" | "UNAVAILABLE";
  ticker: string;
  source: string;
  checkedAt: string;
  asset?: {
    ticker: string;
    companyName: string | null;
    platform: string;
    tokenSymbol: string | null;
    tokenContractAddress: string;
    tokenPrice: number;
    referencePrice: number;
    shareRatio: number;
    adjustedSpreadPct: number | null;
    marketStatus: string | null;
    marketClosed: boolean;
    dataQuality: string;
    actionable: false;
    referenceWarning: string | null;
    nextOpenTime: string | null;
  };
  reason?: string;
}

export function extractTicker(prompt: string): string | null {
  const text = String(prompt ?? "");
  const explicit = text.match(/\b(?:ticker|symbol|asset)\s*(?:is|=|:)\s*([A-Za-z0-9.-]{1,20})\b/i);
  if (explicit?.[1]) {
    const ticker = explicit[1].toUpperCase();
    return TICKER_RE.test(ticker) && !IGNORED_TICKERS.has(ticker) ? ticker : null;
  }
  const candidates = text.match(/\b[A-Z][A-Z0-9.-]{0,9}\b/g) ?? [];
  return candidates.find((item) =>
    TICKER_RE.test(item) && !IGNORED_TICKERS.has(item.toUpperCase())
  ) ?? null;
}

function marketIsClosed(status: unknown): boolean {
  return /closed|off.?hours|pre.?market|post.?market|after.?hours|overnight|extended.?hours|no.?trading/i
    .test(String(status ?? ""));
}

function unavailable(ticker: string, reason: string): PronousResearchSnapshot {
  return {
    status: "UNAVAILABLE",
    ticker,
    source: "https://pronous.vercel.app/api/agent?action=scan",
    checkedAt: new Date().toISOString(),
    reason,
  };
}

export async function fetchPronousSnapshot(
  ticker: string,
  options: { apiBase?: string; fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<PronousResearchSnapshot> {
  const normalized = String(ticker ?? "").trim().toUpperCase();
  if (!TICKER_RE.test(normalized) || IGNORED_TICKERS.has(normalized)) {
    return unavailable(normalized || "UNKNOWN", "INVALID_OR_UNSUPPORTED_TICKER_INPUT");
  }
  const base = String(options.apiBase ?? process.env.PRONOUS_API_URL ?? DEFAULT_API).replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const url = new URL("/api/agent", base);
    url.searchParams.set("action", "scan");
    url.searchParams.set("ticker", normalized);
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: options.signal ?? AbortSignal.timeout(8_000),
    });
    if (!response.ok) return unavailable(normalized, `PRONOUS_HTTP_${response.status}`);
    const body = await response.json() as Record<string, any>;
    const asset = body?.asset;
    const platform = String(asset?.platformId ?? "").toLowerCase();
    const tokenPrice = Number(asset?.tokenPrice);
    const referencePrice = Number(asset?.referencePrice);
    const shareRatio = Number(asset?.shareRatio ?? asset?.tokenToShareRatio);
    const tokenContractAddress = String(asset?.tokenContractAddress ?? "");
    if (body?.mode !== "live-data") return unavailable(normalized, "LIVE_RWA_DATA_NOT_VERIFIED");
    if (!SUPPORTED_PLATFORMS.has(platform)) return unavailable(normalized, "UNSUPPORTED_RWA_PLATFORM");
    if (!/^0x[a-fA-F0-9]{40}$/.test(tokenContractAddress)) return unavailable(normalized, "INVALID_RWA_TOKEN_ADDRESS");
    if (asset?.dataQuality !== "ok" || !Number.isFinite(tokenPrice) || tokenPrice <= 0 ||
        !Number.isFinite(referencePrice) || referencePrice <= 0 ||
        !Number.isFinite(shareRatio) || shareRatio <= 0) {
      return unavailable(normalized, "INVALID_OR_MISSING_PRICE_RATIO");
    }
    const status = asset?.marketStatus ?? body?.market?.marketStatus ?? null;
    const closed = marketIsClosed(status) || body?.market?.referenceStale === true;
    const adjustedSpread = Number(asset?.adjustedSpreadPct ?? body?.market?.adjustedSpreadPct);
    return {
      status: "VERIFIED_LIVE",
      ticker: normalized,
      source: url.toString(),
      checkedAt: new Date().toISOString(),
      asset: {
        ticker: String(asset?.ticker ?? normalized),
        companyName: asset?.companyName ? String(asset.companyName) : null,
        platform,
        tokenSymbol: asset?.tokenSymbol ? String(asset.tokenSymbol) : null,
        tokenContractAddress,
        tokenPrice,
        referencePrice,
        shareRatio,
        adjustedSpreadPct: Number.isFinite(adjustedSpread) ? adjustedSpread : null,
        marketStatus: status == null ? null : String(status),
        marketClosed: closed,
        dataQuality: "ok",
        actionable: false,
        referenceWarning: closed ? "Underlying market may be closed and reference data may be stale; signal is non-actionable." : null,
        nextOpenTime: asset?.nextOpenTime ? String(asset.nextOpenTime) : null,
      },
    };
  } catch (error) {
    return unavailable(normalized, error instanceof Error && error.name === "TimeoutError"
      ? "PRONOUS_API_TIMEOUT"
      : "PRONOUS_API_UNAVAILABLE");
  }
}

export function formatResearchFacts(snapshot: PronousResearchSnapshot): string {
  return JSON.stringify({
    source: snapshot.source,
    status: snapshot.status,
    ticker: snapshot.ticker,
    checkedAt: snapshot.checkedAt,
    reason: snapshot.reason ?? null,
    asset: snapshot.asset ?? null,
    execution: { broadcast: false, actionable: false, tradeExecuted: false },
  }, null, 2);
}
