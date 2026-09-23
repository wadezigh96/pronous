# BNB Agent Studio deployment prompt

Paste the following into an MCP-compatible AI IDE after installing BNB Agent Studio:

> Create and deploy a BSC mainnet autonomous agent named PRONOUS.
>
> Purpose: monitor tokenized equities available through the Binance Web3 API, with Ondo or bStocks as the central asset layer. The agent should search a ticker, read token price and underlying reference price, calculate the spread, check market status, and create a transparent execution plan.
>
> Wallet policy: use a scoped agent wallet. Enforce a maximum spend per task, an allowlist of token/router contracts, spot-only execution, and simulation before broadcast. Never execute a trade solely from free-form model output. Convert model output into a structured intent and validate it against the policy before signing.
>
> Agentic Wallet / Wallet Skills: expose tools for market search, token price, portfolio state, quote, transaction simulation and transaction execution. Keep API credentials and wallet secrets server-side. Require a user confirmation gate for first-time live execution.
>
> Agent Studio: register the agent's ERC-8004 identity, expose an ERC-8183 task interface, and enable x402 self-funding for the agent runtime. The agent must remain useful in read-only/demo mode when no trading wallet is funded.
>
> Public UX: users should be able to enter a ticker and ask for a market-gap scan. Return the asset, platform, token price, reference price, spread, market status, proposed action, and guardrails.
>
> Never claim a profit or guaranteed outcome. This is a hackathon demo, not financial advice.

## Expected autonomous loop

1. Receive task.
2. Search supported RWA asset.
3. Read token/reference price.
4. Check market status.
5. Build structured plan.
6. Simulate transaction.
7. Validate spend cap + allowlist + spot-only policy.
8. Request confirmation for first live trade.
9. Broadcast only after policy checks.
10. Return transaction hash and audit trail.
11. Continue monitoring when deployed.

## Studio signals

The project is intentionally built to demonstrate the two special-prize surfaces:
- Agentic Wallet / Wallet Skills: execution and scoped wallet policy.
- BNB Agent Studio: persistent runtime, ERC-8004 identity, ERC-8183 task interface, and x402 self-funding.
