// PRONOUS Proof of Action (POA).
// Creates and verifies tamper-evident action evidence.
// POA never signs, broadcasts, or claims an execution that did not happen.

const crypto = require("crypto");

function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function createPOA(input = {}) {
  const now = input.timestamp || new Date().toISOString();
  const status = String(input.status || "PLANNED").toUpperCase();
  const allowed = ["PLANNED","SIMULATED","CONFIRMED","EXECUTED","BLOCKED","REJECTED","EXPIRED"];
  if (!allowed.includes(status)) throw new Error("INVALID_POA_STATUS");

  const proof = {
    version: "POA-1",
    poaId: String(input.poaId || "POA-" + Date.now().toString(36).toUpperCase()),
    agentId: String(input.agentId || "PRONOUS"),
    action: String(input.action || "UNKNOWN").toUpperCase(),
    network: String(input.network || "BSC").toUpperCase(),
    asset: input.asset || null,
    status,
    timestamp: now,
    intentHash: String(input.intentHash || ""),
    simulation: input.simulation || null,
    userConfirmation: input.userConfirmation ?? false,
    txHash: input.txHash ? String(input.txHash) : null,
    previousPoaHash: input.previousPoaHash ? String(input.previousPoaHash) : null
  };

  if (status === "EXECUTED" && !proof.txHash) {
    throw new Error("EXECUTED_POA_REQUIRES_TX_HASH");
  }
  if (status !== "EXECUTED") proof.txHash = null;

  proof.poaHash = sha256(canonicalize(proof));
  return proof;
}

function verifyPOA(proof = {}) {
  if (!proof || typeof proof !== "object" || !proof.poaHash) {
    return { valid:false, reason:"POA_HASH_MISSING" };
  }
  const copy = {...proof};
  delete copy.poaHash;
  const expected = sha256(canonicalize(copy));
  return {
    valid: crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(proof.poaHash))),
    expectedHash: expected,
    poaHash: String(proof.poaHash),
    reason: expected === String(proof.poaHash) ? "HASH_MATCH" : "HASH_MISMATCH"
  };
}

function buildIntentHash(intent = {}) {
  return sha256(canonicalize(intent));
}

module.exports = { canonicalize, sha256, buildIntentHash, createPOA, verifyPOA };
