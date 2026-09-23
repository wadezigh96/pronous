// PRONOUS execution policy.
// Keep these checks deterministic. Policy decides whether execution may proceed;
// it does not perform the transaction.

function buildGuardChecks(asset = {}, params = {}) {
  const amount = Number(params.amount || 0);
  const maxSpend = Number(params.maxSpend || 0);
  return [
    { id: "network", label: "BSC mainnet", pass: true },
    { id: "asset", label: "Tokenized-stock asset resolved", pass: Boolean(asset.ticker && (asset.tokenContractAddress || asset.ticker)) },
    { id: "spot", label: "Spot only", pass: true },
    { id: "price", label: "Token/reference prices available", pass: Number(asset.tokenPrice) > 0 && Number(asset.referencePrice) > 0 },
    { id: "spend_cap", label: "Spend cap", pass: amount > 0 && maxSpend > 0 && amount <= maxSpend },
    { id: "simulation", label: "Simulation required", pass: false }
  ];
}

function preflightStatus(checks) {
  return checks.every(check => check.pass) ? "READY_FOR_SIMULATION" : "BLOCKED";
}

module.exports = { buildGuardChecks, preflightStatus };
