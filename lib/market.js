// PRONOUS market domain helpers.
// Pure functions only: easy to test and safe to reuse from API handlers.

const SUPPORTED_PLATFORMS = ["ondo", "bstock", "xstocks"];
const UNRELIABLE_SPREAD_PCT = 25;
const SUSPECT_SPREAD_PCT = 8;
const DEFAULT_MIN_ACTIONABLE_GAP_PCT = 1;
const configuredMinimum = Number(process.env.PRONOUS_MIN_ACTIONABLE_GAP_PCT);
const MIN_ACTIONABLE_GAP_PCT = Number.isFinite(configuredMinimum) && configuredMinimum > 0
  ? configuredMinimum
  : DEFAULT_MIN_ACTIONABLE_GAP_PCT;

function calculateSpreadPct(tokenPrice, referencePrice) {
  const token = Number(tokenPrice);
  const reference = Number(referencePrice);
  if (!(token > 0) || !(reference > 0)) return null;
  return Number(((token / reference - 1) * 100).toFixed(6));
}

function calculateAdjustedSpreadPct(tokenPrice, referencePrice, shareRatio) {
  const token = Number(tokenPrice);
  const reference = Number(referencePrice);
  const ratio = Number(shareRatio);
  if (!(token > 0) || !(reference > 0) || !Number.isFinite(ratio) || ratio <= 0) return null;
  return Number(((token / (reference * ratio) - 1) * 100).toFixed(6));
}

function calculateImpactAdjustedGapPct(quotePrice, priceImpact, referencePrice, shareRatio) {
  if (priceImpact === null || priceImpact === undefined || priceImpact === "") return null;
  const quote = Number(quotePrice);
  const impact = Number(priceImpact);
  const reference = Number(referencePrice);
  const ratio = Number(shareRatio);
  if (!(quote > 0) || !Number.isFinite(impact) || impact <= -1 ||
      !(reference > 0) || !Number.isFinite(ratio) || ratio <= 0) return null;
  return Number((((quote / (1 + impact)) / (reference * ratio) - 1) * 100).toFixed(6));
}

function resolveShareRatio(...candidates) {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === "") continue;
    const ratio = Number(candidate);
    if (Number.isFinite(ratio) && ratio > 0) return ratio;
  }
  return null;
}

function resolveAssetShareRatio({ price = {}, search = {}, tokenList = [], tokenAddress = "", platformId = "", ticker = "" } = {}) {
  const priceRatio = resolveShareRatio(price.tokenToShareRatio, price.shareRatio);
  if (priceRatio !== null) return { shareRatio: priceRatio, source: "price", feedAsset: null };
  const searchRatio = resolveShareRatio(search.tokenToShareRatio, search.shareRatio);
  if (searchRatio !== null) return { shareRatio: searchRatio, source: "search", feedAsset: null };
  const address = String(tokenAddress || search.tokenContractAddress || "").trim().toLowerCase();
  const platform = String(platformId || search.platformId || "").trim().toLowerCase();
  const symbol = String(ticker || search.ticker || search.underlyingTicker || "").trim().toUpperCase();
  const rows = Array.isArray(tokenList) ? tokenList : [];
  const samePlatform = (row) => !platform || String(row.platformId || "").trim().toLowerCase() === platform;
  let feedAsset = address ? rows.find((row) => String(row.tokenContractAddress || "").trim().toLowerCase() === address && samePlatform(row)) || null : null;
  if (!feedAsset && symbol) {
    feedAsset = rows.find((row) => String(row.ticker || row.underlyingTicker || "").trim().toUpperCase() === symbol && samePlatform(row)) || null;
  }
  const listRatio = resolveShareRatio(feedAsset?.tokenToShareRatio, feedAsset?.shareRatio);
  return { shareRatio: listRatio, source: listRatio !== null ? "rwa-tokens-list" : null, feedAsset };
}

function isMarketClosed(asset = {}) {
  const status = [asset.marketStatus, asset.openState].map((x) => String(x ?? "")).join(" ").toLowerCase();
  const openState = asset.openState;
  return /closed|off.?hours|post.?market|pre.?market|after.?hours|overnight|extended.?hours/i.test(status) ||
    openState === false || openState === 0 ||
    ["false", "0", "closed"].includes(String(openState).toLowerCase());
}

function classifyAssetSignal(asset = {}) {
  if (asset.dataQuality === "missing_ratio") return "MISSING_RATIO";
  if (asset.dataQuality !== "ok") return "UNRELIABLE";
  if (isMarketClosed(asset)) return "OFF_HOURS_DRIFT";
  const spread = Number(asset.adjustedSpreadPct ?? asset.spreadPct ?? 0);
  if (asset.actionable === true) return spread > 0 ? "PREMIUM" : "DISCOUNT";
  return "OBSERVE";
}

function assessQuote(tokenPrice, referencePrice, shareRatio) {
  const rawSpreadPct = calculateSpreadPct(tokenPrice, referencePrice);
  if (rawSpreadPct == null) {
    return {
      spreadPct: null, rawSpreadPct: null, adjustedSpreadPct: null,
      shareRatio: null, dataQuality: "missing_price", actionable: false
    };
  }
  const ratio = Number(shareRatio);
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return {
      spreadPct: null, rawSpreadPct, adjustedSpreadPct: null,
      shareRatio: null, dataQuality: "missing_ratio", actionable: false
    };
  }
  const adjustedSpreadPct = calculateAdjustedSpreadPct(tokenPrice, referencePrice, ratio);
  const abs = Math.abs(adjustedSpreadPct);
  const base = {
    spreadPct: adjustedSpreadPct, rawSpreadPct, adjustedSpreadPct, shareRatio: ratio,
    minActionableGapPct: MIN_ACTIONABLE_GAP_PCT
  };
  if (abs >= UNRELIABLE_SPREAD_PCT) {
    return { ...base, dataQuality: "unreliable", actionable: false };
  }
  if (abs >= SUSPECT_SPREAD_PCT) {
    return { ...base, dataQuality: "suspect", actionable: false };
  }
  return { ...base, dataQuality: "ok", actionable: abs >= MIN_ACTIONABLE_GAP_PCT };
}

function isSupportedPlatform(platformId) {
  return SUPPORTED_PLATFORMS.includes(String(platformId || "").toLowerCase());
}

function normalizeAsset(row = {}) {
  const tokenPrice = row.tokenPrice ?? row.price ?? null;
  const referencePrice = row.referencePrice ?? null;
  const shareRatio = row.tokenToShareRatio ?? row.shareRatio ?? null;
  const quality = assessQuote(tokenPrice, referencePrice, shareRatio);
  return {
    ticker: row.underlyingTicker || row.ticker || "",
    companyName: row.underlyingName || row.companyName || "",
    platformId: row.platformId || "",
    tokenSymbol: row.tokenSymbol || "",
    tokenContractAddress: row.tokenContractAddress || "",
    tokenPrice,
    referencePrice,
    rawSpreadPct: quality.rawSpreadPct,
    adjustedSpreadPct: quality.adjustedSpreadPct,
    spreadPct: quality.adjustedSpreadPct,
    shareRatio: quality.shareRatio,
    dataQuality: quality.dataQuality,
    actionable: quality.actionable,
    marketStatus: row.statusInfo?.marketStatus || row.marketStatus || "unknown",
    openState: row.statusInfo?.openState ?? row.openState ?? null,
    nextOpenTime: row.statusInfo?.nextOpenTime || row.nextOpenTime || null,
    nextCloseTime: row.statusInfo?.nextCloseTime || row.nextCloseTime || null,
    volume24H: row.volume24H ?? null,
    marketCap: row.marketCap ?? null,
    tokenToShareRatio: row.tokenToShareRatio ?? row.shareRatio ?? null
  };
}

module.exports = {
  SUPPORTED_PLATFORMS,
  MIN_ACTIONABLE_GAP_PCT,
  calculateSpreadPct,
  calculateAdjustedSpreadPct,
  calculateImpactAdjustedGapPct,
  assessQuote,
  resolveShareRatio,
  resolveAssetShareRatio,
  isMarketClosed,
  classifyAssetSignal,
  isSupportedPlatform,
  normalizeAsset
};
