(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PRONOUS_EXECUTION_GATES = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const GAS_RESERVE_BNB = 0.0002;
  const NATIVE_BNB = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

  function canonicalize(value) {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(canonicalize);
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = canonicalize(value[key]);
      return out;
    }, {});
  }

  function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
  }

  function canExecute({ wallet, simulated, confirmed, paramsHash, simHash } = {}) {
    return Boolean(
      wallet &&
      simulated === true &&
      confirmed === true &&
      paramsHash &&
      simHash &&
      paramsHash === simHash
    );
  }

  function beginExecution(state) {
    if (!state || state.inFlight) return false;
    state.inFlight = true;
    return true;
  }

  function endExecution(state) {
    if (state) state.inFlight = false;
    return false;
  }

  function resetExecutionState(state) {
    if (!state) return;
    state.simulated = false;
    state.confirmed = false;
    state.builtTx = null;
    state.paramsHash = null;
    state.simHash = null;
  }

  function safeSpendableBnb(balance, reserve = GAS_RESERVE_BNB) {
    const n = Number(balance);
    const r = Number(reserve);
    if (!Number.isFinite(n) || !Number.isFinite(r) || r < 0) return 0;
    return Math.max(0, n - r);
  }

  function nativeBnbRouteBlocked(fromToken) {
    return String(fromToken || "").trim().toLowerCase() === NATIVE_BNB;
  }

  function confirmationAccepted(result) {
    return result === true;
  }

  return {
    GAS_RESERVE_BNB,
    NATIVE_BNB,
    canonicalize,
    canonicalJson,
    canExecute,
    beginExecution,
    endExecution,
    resetExecutionState,
    safeSpendableBnb,
    nativeBnbRouteBlocked,
    confirmationAccepted
  };
});