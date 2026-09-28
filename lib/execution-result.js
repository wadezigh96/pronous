function broadcastPoaFailureMessage(txHash) {
  return "Transaksi terkirim (hash " + String(txHash) + "), pencatatan POA gagal; JANGAN kirim ulang";
}
if (typeof window !== "undefined") window.PRONOUS_EXECUTION_RESULT = { broadcastPoaFailureMessage };
if (typeof module !== "undefined") module.exports = { broadcastPoaFailureMessage };
