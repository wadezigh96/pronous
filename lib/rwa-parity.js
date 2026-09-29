// Pure helpers for comparing multiple tokenised representations of one underlying asset.
// No execution, signing, or ranking side effects belong here.

const SUPPORTED_PLATFORMS = new Set(["ondo", "bstock", "xstocks"]);

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normaliseTicker(value = "") {
  return String(value).trim().toUpperCase();
}

function compareTokenisedRepresentations(ticker, assets = []) {
  const symbol = normaliseTicker(ticker);
  if (!/^[A-Z0-9.-]{1,20}$/.test(symbol)) {
    throw new Error("INVALID_TICKER");
  }

  const rows = assets
    .filter((asset) => normaliseTicker(asset?.ticker) === symbol)
    .filter((asset) => SUPPORTED_PLATFORMS.has(String(asset?.platformId || "").toLowerCase()))
    .map((asset) => ({
      ticker: symbol,
      platformId: String(asset.platformId).toLowerCase(),
      tokenSymbol: asset.tokenSymbol || null,
      tokenContractAddress: asset.tokenContractAddress || null,
      tokenPrice: finiteNumber(asset.tokenPrice),
      referencePrice: finiteNumber(asset.referencePrice),
      spreadPct: finiteNumber(asset.spreadPct),
      dataQuality: asset.dataQuality || "unknown",
      actionable: asset.actionable === true,
      marketStatus: asset.marketStatus || null,
      openState: asset.openState ?? null,
      nextOpenTime: asset.nextOpenTime ?? null,
      nextCloseTime: asset.nextCloseTime ?? null
    }));

  const byPlatform = {};
  for (const row of rows) {
    if (!byPlatform[row.platformId]) byPlatform[row.platformId] = row;
  }

  const priced = Object.values(byPlatform).filter((row) => row.tokenPrice != null && row.tokenPrice > 0);
  const reference = priced.find((row) => row.referencePrice != null && row.referencePrice > 0)?.referencePrice ?? null;
  const prices = priced.map((row) => row.tokenPrice);
  const minTokenPrice = prices.length ? Math.min(...prices) : null;
  const maxTokenPrice = prices.length ? Math.max(...prices) : null;
  const crossPlatformGapPct = minTokenPrice && maxTokenPrice
    ? Number(((maxTokenPrice / minTokenPrice - 1) * 100).toFixed(3))
    : null;

  const platforms = ["ondo", "bstock", "xstocks"].map((platformId) => {
    const row = byPlatform[platformId] || null;
    return row ? { ...row, available: true } : { platformId, available: false };
  });

  return {
    ticker: symbol,
    referencePrice: reference,
    platformCount: priced.length,
    platforms,
    crossPlatformGapPct,
    comparable: priced.length >= 2,
    next: priced.length >= 2
      ? "Compare execution quotes and liquidity before any trade; simulation and explicit confirmation remain required."
      : "At least two live platform representations are required for cross-platform comparison."
  };
}

module.exports = { compareTokenisedRepresentations, normaliseTicker };
