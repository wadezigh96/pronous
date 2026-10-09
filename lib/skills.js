// PRONOUS agent skill registry.
// status: live = wired in production UI/API; planned = catalog only.

const SKILLS = [
  {id:"market_sentinel",name:"Market Sentinel",icon:"◉",purpose:"Scans tokenized stocks and reference prices on supported venues.",output:"ranked market observations",risk:"read-only",status:"live"},
  {id:"gap_guard",name:"Gap Guard",icon:"◇",purpose:"Surfaces premium/discount and market-quality context so noisy signals are not treated as opportunities.",output:"signal plus market-state context",risk:"read-only",status:"live"},
  {id:"cross_venue_check",name:"Cross-Venue Check",icon:"⇄",purpose:"Compares supported representations of the same underlying when data is available.",output:"cross-venue comparison",risk:"read-only",status:"live"},
  {id:"preflight_guard",name:"Preflight Guard",icon:"✓",purpose:"Runs deterministic spend and policy checks before quote or simulation.",output:"PASS or BLOCK with reasons",risk:"blocking only",status:"live"},
  {id:"execution_planner",name:"Execution Planner",icon:"→",purpose:"Builds a constrained spot-only quote/build intent for Binance DEX routes.",output:"structured intent",risk:"requires policy",status:"live"},
  {id:"proof_of_action",name:"Proof of Action",icon:"◈",purpose:"Records session evidence from intent through simulation and optional confirmation.",output:"verifiable POA record",risk:"evidence-only",status:"live"},
  {id:"portfolio_watcher",name:"Portfolio Watcher",icon:"▣",purpose:"Read-only BSC wallet balances for tracked tokenized assets (utilities page).",output:"balances and estimated values",risk:"read-only",status:"live"},
  {id:"portfolio_drift",name:"Portfolio Drift",icon:"▣",purpose:"Compare holdings to a user-defined allocation and propose rebalance ideas.",output:"rebalance proposal",risk:"read-only proposal",status:"planned"},
  {id:"agent_treasury",name:"Agent Treasury",icon:"$U",purpose:"Track agent operating balance and paid-data budget.",output:"budget status",risk:"no autonomous trade",status:"planned"},
  {id:"decision_ledger",name:"Decision Ledger",icon:"≡",purpose:"Persistent audit log of every signal, gate, and user confirmation.",output:"auditable event record",risk:"read-only",status:"planned"}
];

function routeSkills(query = "") {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const live = SKILLS.filter(s => s.status === "live");
  const matches = live.filter(skill =>
    words.some(word => (skill.name + " " + skill.purpose + " " + skill.id).toLowerCase().includes(word))
  );
  return matches.length ? matches : live.slice(0, 3);
}

module.exports = { SKILLS, routeSkills };
