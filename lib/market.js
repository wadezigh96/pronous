// PRONOUS market domain helpers.
// Pure functions only: easy to test and safe to reuse from API handlers.

function calculateSpreadPct(tokenPrice, referencePrice) {
  const token = Number(tokenPrice);
  const reference = Number(referencePrice);
  if (!(token > 0) || !(reference > 0)) return null;
  return Number(((token / reference - 1) * 100).toFixed(3));
}

function normalizeAsset(row = {}) {
  const tokenPrice = row.tokenPrice ?? row.price ?? null;
  const referencePrice = row.referencePrice ?? null;
  return {
    ticker: row.underlyingTicker || row.ticker || "",
    companyName: row.underlyingName || row.companyName || "",
    platformId: row.platformId || "",
    tokenSymbol: row.tokenSymbol || "",
    tokenContractAddress: row.tokenContractAddress || "",
    tokenPrice,
    referencePrice,
    spreadPct: calculateSpreadPct(tokenPrice, referencePrice),
    marketStatus: row.statusInfo?.marketStatus || row.marketStatus || "unknown",
    openState: row.statusInfo?.openState ?? row.openState ?? null,
    nextOpenTime: row.statusInfo?.nextOpenTime || row.nextOpenTime || null,
    nextCloseTime: row.statusInfo?.nextCloseTime || row.nextCloseTime || null,
    volume24H: row.volume24H ?? null,
    marketCap: row.marketCap ?? null,
    tokenToShareRatio: row.tokenToShareRatio ?? null
  };
}

module.exports = { calculateSpreadPct, normalizeAsset };
