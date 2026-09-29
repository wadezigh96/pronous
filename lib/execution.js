// PRONOUS execution intent helpers.
// Prepares quote/swap params. Never signs or broadcasts.

const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const ZERO = "0x0000000000000000000000000000000000000000";
const USDT = "0x55d398326f99059ff775485246999027b3197955";
const USDC = "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d";
const WBNB = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
const GAS_RESERVE_BNB = 0.0002;
const MAX_UINT256 = (1n << 256n) - 1n;

function validateIntent(input = {}) {
  const required = ["fromTokenAddress", "toTokenAddress", "amount"];
  const missing = required.filter((k) => !String(input[k] || "").trim());
  if (missing.length) return { ok: false, missing };
  return { ok: true, missing: [] };
}

function decimalToRawAmount(value, decimals) {
  const raw = String(value || "").trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  if (fraction.length > decimals) return null;
  const padded = fraction.padEnd(decimals, "0");
  const digits = (whole + padded).replace(/^0+(?=\d)/, "") || "0";
  try {
    if (BigInt(digits) > MAX_UINT256) return null;
  } catch (_) {
    return null;
  }
  return digits;
}

function binanceTokenDecimals(address) {
  const token = String(address || "").trim().toLowerCase();
  if (token === NATIVE || token === ZERO) return 18;
  // BSC-USD / USDT on BSC is 18 decimals (Ethereum USDT is 6).
  if (token === USDT) return 18;
  if (token === USDC) return 18;
  if (token === WBNB) return 18;
  return 18;
}

function resolveRawAmount(value, decimals) {
  const raw = String(value || "").trim().replace(/,/g, "");
  if (/^\d{16,}$/.test(raw)) {
    try {
      return BigInt(raw) <= MAX_UINT256 ? raw : null;
    } catch (_) {
      return null;
    }
  }
  return decimalToRawAmount(raw, decimals);
}

function safeSpendableBnb(balance, reserve = GAS_RESERVE_BNB) {
  const n = Number(balance);
  const r = Number(reserve);
  if (!Number.isFinite(n) || !Number.isFinite(r) || r < 0) return 0;
  return Math.max(0, n - r);
}

function nativeBnbRouteBlocked(fromTokenAddress) {
  return String(fromTokenAddress || "").trim().toLowerCase() === NATIVE;
}

function normalizeSpendToken(address) {
  const token = String(address || "").trim();
  if (!token) return "";
  if (token.toLowerCase() === ZERO) return NATIVE;
  return token;
}

function buildQuoteParams(input = {}) {
  const check = validateIntent(input);
  if (!check.ok) return { ok: false, missing: check.missing };

  const from = normalizeSpendToken(input.fromTokenAddress);
  const to = String(input.toTokenAddress).trim();
  if (from.toLowerCase() === to.toLowerCase()) {
    return { ok: false, missing: [], error: "fromTokenAddress and toTokenAddress must be different." };
  }

  const decimals = binanceTokenDecimals(from);
  const amount = resolveRawAmount(input.amount, decimals);
  if (!amount || amount === "0") {
    return { ok: false, missing: [], error: "Invalid amount for the selected spend token." };
  }

  const params = {
    binanceChainId: "56",
    amount,
    fromTokenAddress: from,
    toTokenAddress: to
  };
  if (input.userWalletAddress) params.userWalletAddress = String(input.userWalletAddress).trim();
  return { ok: true, params, decimals, amountHuman: String(input.amount).trim() };
}

function buildSwapParams(input = {}) {
  const quote = buildQuoteParams(input);
  if (!quote.ok) return quote;
  const quoteId = String(input.quoteId || "").trim();
  const wallet = String(input.userWalletAddress || "").trim();
  const missing = [];
  if (!quoteId) missing.push("quoteId");
  if (!wallet) missing.push("userWalletAddress");
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    params: {
      ...quote.params,
      userWalletAddress: wallet,
      quoteId,
      slippagePercent: String(input.slippagePercent || "0.5"),
      approveTransaction: String(input.approveTransaction || "false")
    }
  };
}

function buildExecutionState({ preflight, quoteReady = false, simulationPassed = false, userConfirmed = false } = {}) {
  if (!preflight || preflight.status !== "READY_FOR_SIMULATION") return { status: "BLOCKED", step: "PREFLIGHT" };
  if (!quoteReady) return { status: "READY_FOR_QUOTE", step: "QUOTE" };
  if (!simulationPassed) return { status: "READY_FOR_SIMULATION", step: "SIMULATION" };
  if (!userConfirmed) return { status: "WAITING_CONFIRMATION", step: "CONFIRMATION" };
  return { status: "READY_TO_EXECUTE", step: "EXECUTION" };
}

function confirmationGate({ preflight, simulationPassed, userConfirmed } = {}) {
  if (!preflight || preflight.status !== "READY_FOR_SIMULATION") return { status: "BLOCKED", reason: "PREFLIGHT_REQUIRED" };
  if (!simulationPassed) return { status: "BLOCKED", reason: "SIMULATION_REQUIRED" };
  if (!userConfirmed) return { status: "WAITING_CONFIRMATION", reason: "USER_CONFIRMATION_REQUIRED" };
  return { status: "READY_TO_EXECUTE", reason: "ALL_GATES_PASSED" };
}

module.exports = {
  validateIntent,
  decimalToRawAmount,
  resolveRawAmount,
  binanceTokenDecimals,
  buildQuoteParams,
  buildSwapParams,
  buildExecutionState,
  confirmationGate,
  NATIVE,
  USDT,
  USDC,
  WBNB,
  GAS_RESERVE_BNB,
  safeSpendableBnb,
  nativeBnbRouteBlocked
};
