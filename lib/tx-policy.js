const BINANCE_DEX_ROUTER = "0xb300000b72DEAEb607a12d5f54773D1C19c7028d";
const ALLOWED_SWAP_SELECTORS = new Set(["0x810c705b"]);

function validateBroadcastTx(tx = {}, chainId) {
  const to = String(tx.to || "").trim().toLowerCase();
  const data = String(tx.data || tx.input || "0x").trim().toLowerCase();
  if (Number(chainId) !== 56) return { ok: false, error: "CHAIN_ID_NOT_BSC" };
  if (to !== BINANCE_DEX_ROUTER.toLowerCase()) return { ok: false, error: "TX_TARGET_NOT_ALLOWLISTED" };
  if (!/^0x[0-9a-f]{8,}$/.test(data) || !ALLOWED_SWAP_SELECTORS.has(data.slice(0, 10))) {
    return { ok: false, error: "TX_SELECTOR_NOT_ALLOWLISTED" };
  }
  const value = String(tx.value == null || tx.value === "" ? "0x0" : tx.value).toLowerCase();
  if (value !== "0x0" && value !== "0x00") return { ok: false, error: "NONZERO_NATIVE_VALUE_BLOCKED" };
  return { ok: true, to: BINANCE_DEX_ROUTER, data };
}

if (typeof window !== "undefined") window.PRONOUS_TX_POLICY = { BINANCE_DEX_ROUTER, validateBroadcastTx };
if (typeof module !== "undefined") module.exports = { BINANCE_DEX_ROUTER, validateBroadcastTx };
