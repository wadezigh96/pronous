const { SKILLS } = require("../lib/skills");

function answerQuestion(q, ticker) {
  const text=q.toLowerCase();

  if (/skill|agent skill|kemampuan|sentinel|guard|radar|scan|monitor/.test(text)) {
    return "PRONOUS uses layered skills: Market Sentinel scans the asset universe, Gap Guard checks divergence and market state, Cross-Venue Check compares supported representations, Execution Planner prepares a constrained spot-only intent, Preflight Guard blocks unsafe execution, Portfolio Drift proposes rebalancing, Agent Treasury monitors operating budget, and Decision Ledger records the reasoning trail.";
  }
  if (/24.?7|always.?on|jam|hours|open|closed|weekend|holiday/.test(text)) {
    return "PRONOUS separates on-chain availability from the reference-market schedule. A reference exchange can be closed while a tokenized market remains available, so the agent shows market-state context before treating a gap as actionable.";
  }
  if (/gap|spread|premium|discount|selisih/.test(text)) {
    return "The gap is the difference between the tokenized price and its reference price. PRONOUS reports that spread first, then applies policy and simulation gates before any live execution.";
  }
  if (/ondo|bstock|xstock|tokenized stock|tokenisasi/.test(text)) {
    return "PRONOUS uses tokenized-equity data as the market layer and keeps execution separate, so an asset can be inspected and compared before a scoped wallet is asked to act.";
  }
  if (/wallet|agentic|dompet/.test(text)) {
    return "The wallet is the execution boundary: read state, prepare intent, apply limits, simulate, then request confirmation for a live action.";
  }
  if (/bsc|bnb/.test(text)) {
    return "PRONOUS targets BSC mainnet and keeps market analysis separate from execution so the same workflow remains observable in demo mode.";
  }
  return "I can explain tokenized stocks, market gaps, reference-market hours, BSC, wallet execution, simulation, Ondo, bStocks and the PRONOUS safety flow.";
}

module.exports = async function handler(req,res) {
  const url=new URL(req.url,"http://localhost");
  const q=(url.searchParams.get("q")||"").trim();
  const ticker=(url.searchParams.get("ticker")||"NVDA").toUpperCase();
  if(!q) return res.status(400).json({error:"Question is required"});
  return res.status(200).json({agent:"PRONOUS",ticker,answer:answerQuestion(q,ticker),mode:"rule-based-assistant",skills:SKILLS.length});
};
