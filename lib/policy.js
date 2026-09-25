// PRONOUS execution policy.
// Deterministic checks decide whether a proposed action may enter simulation.
// This module never signs or broadcasts a transaction.

const SUPPORTED_PLATFORMS = new Set(["ondo", "bstock", "xstocks"]);

function isEvmAddress(value = "") {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value).trim());
}

function buildGuardChecks(asset = {}, params = {}) {
  const amount = Number(params.amount || 0);
  const maxSpend = Number(params.maxSpend || 0);
  const platform = String(asset.platformId || "").toLowerCase();
  const dataQuality = String(asset.dataQuality || "").toLowerCase();

  return [
    {
      id: "network",
      label: "BSC mainnet",
      pass: !asset.network || String(asset.network).toUpperCase() === "BSC"
    },
    {
      id: "asset",
      label: "Supported tokenized-stock asset",
      pass: Boolean(
        asset.ticker &&
        SUPPORTED_PLATFORMS.has(platform) &&
        isEvmAddress(asset.tokenContractAddress)
      )
    },
    { id: "spot", label: "Spot only", pass: true },
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

function preflightStatus(checks = []) {
  const blockingChecks = checks.filter(check => !check.gate);
  return blockingChecks.every(check => check.pass)
    ? "READY_FOR_SIMULATION"
    : "BLOCKED";
}

module.exports = { SUPPORTED_PLATFORMS, buildGuardChecks, preflightStatus, isEvmAddress };
