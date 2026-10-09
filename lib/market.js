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
  assessQuote,
  isSupportedPlatform,
  normalizeAsset
};
