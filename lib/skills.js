// PRONOUS agent skill registry.
// Keep the registry independent from the HTTP handler so UI/API adapters can reuse it.

const SKILLS = [
  {id:"market_sentinel",name:"Market Sentinel",icon:"◉",purpose:"Continuously scans tokenized stocks and reference prices.",output:"ranked divergence events",risk:"read-only"},
  {id:"gap_guard",name:"Gap Guard",icon:"◇",purpose:"Explains premium/discount and blocks noisy off-hours signals.",output:"signal plus market-state context",risk:"read-only"},
  {id:"cross_venue_check",name:"Cross-Venue Check",icon:"⇄",purpose:"Compares supported representations of the same underlying when data is available.",output:"cross-venue comparison",risk:"read-only"},
  {id:"execution_planner",name:"Execution Planner",icon:"→",purpose:"Turns a market observation into a constrained spot-only plan.",output:"structured intent",risk:"requires policy"},
  {id:"preflight_guard",name:"Preflight Guard",icon:"✓",purpose:"Runs deterministic checks before a live transaction.",output:"PASS or BLOCK with reasons",risk:"blocking only"},
  {id:"portfolio_drift",name:"Portfolio Drift",icon:"▣",purpose:"Reads positions and identifies drift from a user-defined allocation.",output:"rebalance proposal",risk:"read-only proposal"},
  {id:"agent_treasury",name:"Agent Treasury",icon:"$U",purpose:"Tracks operating balance and paid-data budget.",output:"budget status",risk:"no autonomous trade"},
  {id:"decision_ledger",name:"Decision Ledger",icon:"≡",purpose:"Records why a signal was produced and which guardrails ran.",output:"auditable event record",risk:"read-only"}
];

function routeSkills(query = "") {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const matches = SKILLS.filter(skill =>
    words.some(word => (skill.name + " " + skill.purpose + " " + skill.id).toLowerCase().includes(word))
  );
  return matches.length ? matches : SKILLS.slice(0, 3);
}

module.exports = { SKILLS, routeSkills };
