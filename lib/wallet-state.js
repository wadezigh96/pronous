(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PRONOUS_WALLET_STATE = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SOURCES = new Set(["injected", "privy"]);

  function normalizeChainId(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const s = String(value || "").trim().toLowerCase();
    if (!s) return null;
    if (s.startsWith("0x")) {
      const n = Number.parseInt(s, 16);
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeAddress(value) {
    const s = String(value || "").trim();
    return s || null;
  }

  function sameWallet(a, b) {
    return Boolean(a && b &&
      a.source === b.source &&
      String(a.address || "").toLowerCase() === String(b.address || "").toLowerCase() &&
      normalizeChainId(a.chainId) === normalizeChainId(b.chainId));
  }

  function activate(current, next) {
    if (!next || !SOURCES.has(next.source) || !normalizeAddress(next.address)) {
      return { changed: false, state: null, reason: "INVALID_WALLET" };
    }
    const state = {
      source: next.source,
      address: normalizeAddress(next.address),
      chainId: normalizeChainId(next.chainId)
    };
    if (current && current.source && current.source !== state.source) {
      return { changed: true, state, reason: "SOURCE_CHANGED" };
    }
    return { changed: !sameWallet(current, state), state, reason: sameWallet(current, state) ? "UNCHANGED" : "WALLET_CHANGED" };
  }

  function clear(current, source) {
    if (source && current && current.source !== source) return { changed: false, state: current, reason: "SOURCE_NOT_ACTIVE" };
    return { changed: Boolean(current), state: null, reason: current ? "CLEARED" : "ALREADY_CLEAR" };
  }

  function providerEvent(current, source, event, value) {
    if (!current || current.source !== source) return { changed: false, state: current, reason: "SOURCE_NOT_ACTIVE" };
    if (event === "accountsChanged") {
      const address = Array.isArray(value) ? value[0] : value;
      if (!address) return { changed: true, state: null, reason: "ACCOUNT_DISCONNECTED" };
      const state = { ...current, address: normalizeAddress(address) };
      return { changed: !sameWallet(current, state), state, reason: "ACCOUNT_CHANGED" };
    }
    if (event === "chainChanged") {
      const state = { ...current, chainId: normalizeChainId(value) };
      return { changed: normalizeChainId(current.chainId) !== state.chainId, state, reason: "CHAIN_CHANGED" };
    }
    return { changed: false, state: current, reason: "IGNORED" };
  }

  return { SOURCES, normalizeChainId, normalizeAddress, sameWallet, activate, clear, providerEvent };
});
