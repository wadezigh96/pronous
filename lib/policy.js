// PRONOUS execution policy.
// Deterministic checks decide whether a proposed action may enter simulation.
// This module never signs or broadcasts a transaction.

const SUPPORTED_PLATFORMS = new Set(["ondo", "bstock", "xstocks"]);

function isEvmAddress(value = "") {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value).trim());
}

function isBscNetwork(asset = {}) {
  const network = String(asset.network || "").trim().toUpperCase();
  const chainId = Number(asset.chainId ?? asset.binanceChainId);
  if (Number.isFinite(chainId) && chainId === 56) return true;
  if (network === "BSC" || network === "BNB" || network === "BNB SMART CHAIN") return true;
  // Live RWA rows from Binance often omit network; treat missing as BSC only when
  // the rest of the asset already passed platform + contract checks (caller context).
  // Explicit non-BSC labels always fail.
  if (!network && !Number.isFinite(chainId)) return true;
  return false;
}

function buildGuardChecks(asset = {}, params = {}) {
  const amount = Number(params.amount || 0);
  const maxSpend = Number(params.maxSpend || 0);
  const platform = String(asset.platformId || "").toLowerCase();
  const dataQuality = String(asset.dataQuality || "").toLowerCase();
  const demo = params.demo === true || asset.demo === true;
  const venue = String(params.venue || asset.venue || "spot").toLowerCase();

  return [
    {
      id: "network",
      label: "BSC mainnet",
      pass: isBscNetwork(asset)
    },
    {
      id: "asset",
      label: demo ? "Demo tokenized-stock asset" : "Supported tokenized-stock asset",
      // Demo mode deliberately does not invent a contract address. It can enter
      // simulation, but it must never be treated as a live execution asset.
      pass: demo
        ? Boolean(asset.ticker && Number(asset.tokenPrice) > 0 && Number(asset.referencePrice) > 0)
        : Boolean(
            asset.ticker &&
            SUPPORTED_PLATFORMS.has(platform) &&
            isEvmAddress(asset.tokenContractAddress)
          )
    },
    {
      id: "spot",
      label: "Spot only",
      pass: venue === "spot" || venue === "" || venue === "market"
    },
    {
      id: "price",
      label: "Token/reference prices available",
      pass: Number(asset.tokenPrice) > 0 && Number(asset.referencePrice) > 0
    },
    {
      id: "data_quality",
      label: "Market data quality acceptable",
      pass: dataQuality !== "unreliable" && dataQuality !== "missing_price"
    },
    {
      id: "spend_cap",
      label: "Spend cap",
      pass: amount > 0 && maxSpend > 0 && amount <= maxSpend
    },
    {
      id: "simulation",
      label: "Simulation required",
      pass: false,
      gate: "simulation"
    }
  ];
}

function validateSpendCap(amount, maxSpend) {
  const a = Number(amount);
  const m = Number(maxSpend);
  if (!Number.isFinite(a) || !Number.isFinite(m) || a <= 0 || m <= 0) {
    return { ok: false, error: "Amount and maxSpend must be positive numbers." };
  }
  if (a > m) return { ok: false, error: "Amount exceeds maxSpend." };
  return { ok: true, amount: a, maxSpend: m };
}

function preflightStatus(checks = []) {
  const blockingChecks = checks.filter(check => !check.gate);
  return blockingChecks.every(check => check.pass)
    ? "READY_FOR_SIMULATION"
    : "BLOCKED";
}

module.exports = {
  SUPPORTED_PLATFORMS,
  buildGuardChecks,
  preflightStatus,
  isEvmAddress,
  isBscNetwork,
  validateSpendCap
};
