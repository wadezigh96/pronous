// PRONOUS market domain helpers.
// Pure functions only: easy to test and safe to reuse from API handlers.

const SUPPORTED_PLATFORMS = ["ondo", "bstock", "xstocks"];
const UNRELIABLE_SPREAD_PCT = 25;
const SUSPECT_SPREAD_PCT = 8;

function calculateSpreadPct(tokenPrice, referencePrice) {
  const token = Number(tokenPrice);
  const reference = Number(referencePrice);
  if (!(token > 0) || !(reference > 0)) return null;
  return Number(((token / reference - 1) * 100).toFixed(3));
}

function assessQuote(tokenPrice, referencePrice) {
  const spreadPct = calculateSpreadPct(tokenPrice, referencePrice);
  if (spreadPct == null) {
    return { spreadPct: null, dataQuality: "missing_price", actionable: false };
  }
  const abs = Math.abs(spreadPct);
  if (abs >= UNRELIABLE_SPREAD_PCT) {
    return { spreadPct, dataQuality: "unreliable", actionable: false };
  }
  if (abs >= SUSPECT_SPREAD_PCT) {
    return { spreadPct, dataQuality: "suspect", actionable: false };
  }
  return { spreadPct, dataQuality: "ok", actionable: true };
}

function isSupportedPlatform(platformId) {
  return SUPPORTED_PLATFORMS.includes(String(platformId || "").toLowerCase());
}

function normalizeAsset(row = {}) {
  const tokenPrice = row.tokenPrice ?? row.price ?? null;
  const referencePrice = row.referencePrice ?? null;
  const quality = assessQuote(tokenPrice, referencePrice);
  return {
    ticker: row.underlyingTicker || row.ticker || "",
    companyName: row.underlyingName || row.companyName || "",
    platformId: row.platformId || "",
    tokenSymbol: row.tokenSymbol || "",
    tokenContractAddress: row.tokenContractAddress || "",
    tokenPrice,
    referencePrice,
    spreadPct: quality.spreadPct,
    dataQuality: quality.dataQuality,
    actionable: quality.actionable,
    marketStatus: row.statusInfo?.marketStatus || row.marketStatus || "unknown",
    openState: row.statusInfo?.openState ?? row.openState ?? null,
    nextOpenTime: row.statusInfo?.nextOpenTime || row.nextOpenTime || null,
    nextCloseTime: row.statusInfo?.nextCloseTime || row.nextCloseTime || null,
    volume24H: row.volume24H ?? null,
    marketCap: row.marketCap ?? null,
    tokenToShareRatio: row.tokenToShareRatio ?? null
  };
}

module.exports = {
  SUPPORTED_PLATFORMS,
  calculateSpreadPct,
  assessQuote,
  isSupportedPlatform,
  normalizeAsset
};
