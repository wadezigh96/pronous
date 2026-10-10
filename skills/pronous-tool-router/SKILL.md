---
name: pronous-tool-router
description: Route tokenized-stock RWA research, PRONOUS market scans, preflight checks, and Binance Agentic Wallet status or quote requests through documented PRONOUS tools. Never sign or broadcast transactions.
---

# PRONOUS Tool Router

Use this skill to choose the smallest documented PRONOUS tool that answers the user's request. Do not assume a tool is connected just because it is described here; inspect the MCP client's available tools first.

## Route by intent

- **List supported/monitored tokenized stocks** → `market_assets`. If a ticker is specified, pass it explicitly.
- **Analyze one tokenized stock or market/reference gap** → `scan_asset` with the explicit ticker.
- **Check whether a proposed amount satisfies PRONOUS policy** → `preflight` with the explicit ticker, amount, and maximum spend.
- **Check the operator's Binance Agentic Wallet connection, chain, address, or balances** → `agentic_wallet_status`. This requires the operator to authenticate using the official wallet flow on their own device.
- **Preview a quote** → `agentic_wallet_quote` only when the user explicitly asks for a quote and supplies a ticker, amount, and maximum spend. First confirm that the tool exists and its schema matches this documented contract.

If the required tool is missing, return a clear limitation and suggest the documented local PRONOUS MCP setup. Do not replace live data with guessed prices.

## Required checks before a quote

The quote path must reject the request unless PRONOUS verifies all required conditions, including:

- BNB Smart Chain mainnet (chain ID 56).
- A supported Ondo, bStocks, or xStocks token with a valid contract address.
- Live token and reference prices and a valid positive share ratio.
- Acceptable data quality and an explicitly confirmed open underlying market.
- A passing preflight and an explicit maximum-spend cap.
- Well-formed quote input and response.

Do not infer a passing gate from a missing field. If any required condition is missing, stale, unavailable, or ambiguous, stop and explain which check blocked the quote.

## Response format

Summarize results in this order:

1. **Intent/tool** — what was requested and which tool was used.
2. **Evidence** — source mode, asset/ticker, data quality, and relevant timestamps/status when returned by the tool.
3. **Policy** — passed checks and blocked checks; distinguish facts from estimates.
4. **Result** — concise market analysis, wallet status, preflight decision, or quote preview.
5. **Boundary** — state when data is unavailable and whether a quote was returned. Never describe a quote as an order, fill, or profit guarantee.

Only report fields actually returned by the tool. Never invent a transaction hash, fill, balance, price, market-open status, or deployment URL.

## Security rules

- Never request or reveal a seed phrase, private key, wallet unlock password, recovery material, or session token.
- Never call or suggest a signing, swap, or broadcast command from this skill.
- A quote is a read-only preview, not authorization to trade.
- Do not forward arbitrary user-provided URLs, headers, or shell fragments to tools.
- Do not claim live wallet connectivity until `agentic_wallet_status` succeeds in the operator's authenticated environment.
- Do not claim BNB Agent Studio deployment or an ERC-8004 runtime identity from source code or a passing build alone.
- Do not invoke paid external catalogs without explicit opt-in and disclosure of the endpoint and cost.
- Keep PRONOUS functional without Treg; Treg is an optional design reference, not a required runtime service.

## Safe examples

- “List monitored tokenized stocks” → `market_assets`.
- “Scan NVDA and explain the source/reference gap” → `scan_asset(ticker="NVDA")`.
- “Check whether 1 unit is within my 2-unit cap” → `preflight` with explicit values; this is a policy check, not a buy order.
- “Is my Binance Agentic Wallet connected?” → `agentic_wallet_status`.
- “Get a quote for NVDA” without amount or max spend → ask for the missing values; do not guess them.
