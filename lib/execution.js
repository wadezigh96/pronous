// PRONOUS execution intent helpers.
// This module prepares intent; it never signs or broadcasts a transaction.

function validateIntent(input = {}) {
  const required = ["fromTokenAddress","toTokenAddress","amount"];
  const missing = required.filter(k => !String(input[k] || "").trim());
  if (missing.length) return { ok:false, missing };
  return { ok:true, missing:[] };
}

function buildQuoteParams(input = {}) {
  const check = validateIntent(input);
  if (!check.ok) return { ok:false, missing:check.missing };
  const from = String(input.fromTokenAddress).trim().toLowerCase();
  const to = String(input.toTokenAddress).trim().toLowerCase();
  if (from === to) {
    return { ok:false, missing:[], error:"fromTokenAddress and toTokenAddress must be different. Use a spend token (e.g. USDT/WBNB) as from, and the tokenized stock contract as to." };
  }
  const params = {
    binanceChainId:"56",
    amount:String(input.amount),
    fromTokenAddress:String(input.fromTokenAddress).trim(),
    toTokenAddress:String(input.toTokenAddress).trim()
  };
  if (input.userWalletAddress) params.userWalletAddress=String(input.userWalletAddress);
  return { ok:true, params };
}

function buildSwapParams(input = {}) {
  const required=["fromTokenAddress","toTokenAddress","amount","userWalletAddress","quoteId"];
  const missing=required.filter(k=>!String(input[k]||"").trim());
  if(missing.length) return {ok:false,missing};
  return {ok:true,params:{
    binanceChainId:"56",
    amount:String(input.amount),
    fromTokenAddress:String(input.fromTokenAddress),
    toTokenAddress:String(input.toTokenAddress),
    userWalletAddress:String(input.userWalletAddress),
    quoteId:String(input.quoteId),
    slippagePercent:String(input.slippagePercent||"0.5"),
    approveTransaction:String(input.approveTransaction||"false")
  }};
}

function buildExecutionState({preflight, quoteReady=false, simulationPassed=false, userConfirmed=false} = {}) {
  if (!preflight || preflight.status !== "READY_FOR_SIMULATION") return {status:"BLOCKED",step:"PREFLIGHT"};
  if (!quoteReady) return {status:"READY_FOR_QUOTE",step:"QUOTE"};
  if (!simulationPassed) return {status:"READY_FOR_SIMULATION",step:"SIMULATION"};
  if (!userConfirmed) return {status:"WAITING_CONFIRMATION",step:"CONFIRMATION"};
  return {status:"READY_TO_EXECUTE",step:"EXECUTION"};
}

function confirmationGate({preflight, simulationPassed, userConfirmed} = {}) {
  if (!preflight || preflight.status !== "READY_FOR_SIMULATION") return {status:"BLOCKED",reason:"PREFLIGHT_REQUIRED"};
  if (!simulationPassed) return {status:"BLOCKED",reason:"SIMULATION_REQUIRED"};
  if (!userConfirmed) return {status:"WAITING_CONFIRMATION",reason:"USER_CONFIRMATION_REQUIRED"};
  return {status:"READY_TO_EXECUTE",reason:"ALL_GATES_PASSED"};
}

module.exports={validateIntent,buildQuoteParams,buildSwapParams,buildExecutionState,confirmationGate};
