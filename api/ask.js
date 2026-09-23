module.exports = async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const q = (url.searchParams.get("q") || "").trim();
  const ticker = (url.searchParams.get("ticker") || "NVDA").toUpperCase();

  if (!q) return res.status(400).json({ error: "Question is required" });

  const text = q.toLowerCase();
  let answer;

  if (/24.?7|always.?on|jam|hours|open|closed|weekend|holiday/.test(text)) {
    answer = "PRONOUS treats tokenized-stock availability and the reference market schedule as two separate signals. A reference exchange can be closed while an on-chain token market may still show activity. The agent should show the market-status context and avoid treating an off-hours gap as an automatic trade signal.";
  } else if (/gap|spread|premium|discount|selisih/.test(text)) {
    answer = "The market gap is the difference between the tokenized-stock price and its reference price. PRONOUS reports the spread first, then applies policy checks and simulation before any live execution.";
  } else if (/ondo|bstock|xstock|tokenized stock|tokenisasi/.test(text)) {
    answer = "PRONOUS uses tokenized-equity data as the market layer and keeps the execution layer separate. That makes it possible to inspect the asset, compare prices and simulate an action before connecting a scoped wallet.";
  } else if (/wallet|agentic|dompet/.test(text)) {
    answer = "The wallet is the execution boundary. PRONOUS is designed to read wallet state, prepare an intent, request a quote, apply limits and allowlists, simulate, then ask for confirmation when a live action is required.";
  } else if (/bsc|bnb/.test(text)) {
    answer = "The execution design targets BSC mainnet. PRONOUS keeps the strategy layer separate from execution so the same market-gap analysis can remain observable in demo mode.";
  } else {
    answer = "I can explain tokenized stocks, market gaps, reference-market hours, BSC, wallet execution, simulation, Ondo, bStocks and the PRONOUS safety flow. Try asking about one of those topics.";
  }

  return res.status(200).json({
    agent: "PRONOUS",
    ticker,
    answer,
    mode: "rule-based-assistant"
  });
};
