---
name: pronous-agentic-wallet
description: Research bStocks, Ondo and xStocks with PRONOUS, then check Binance Agentic Wallet and retrieve guarded BSC mainnet quote previews. Does not place orders.
---

# PRONOUS × Binance Agentic Wallet / Wallet Skills

Use this workflow for tokenized-equity market research.

## Safe sequence

1. Run a PRONOUS `scan_asset` for the requested ticker.
2. Verify the response is live, the token is bStocks/Ondo/xStocks, the token contract address and share ratio are valid, the data quality is `ok`, and the underlying market is open.
3. Run `preflight` with the user's requested amount and explicit maximum spend. Stop for any blocked check or `ACK_REQUIRED`.
4. Use the official Binance Agentic Wallet Wallet Skill for read-only wallet checks: `baw wallet status --json`, `baw wallet chains --json`, `baw wallet address --json`, and `baw wallet balance --json`.
5. For quote preview only, run `baw market-order quote --fromTokenQty <amount> --fromToken <BSC-USDT-address> --toToken <verified-RWA-token-address> --binanceChainId 56 --json`. The amount must not exceed the maximum spend. Compare the returned quote with PRONOUS's reference price × share ratio and explain the price-impact and timing limitations.
6. A quote is not a trade or a fill. This PRONOUS MCP integration never signs or broadcasts a transaction. Do not attempt live execution unless the human explicitly authorizes a specific order after reviewing the amount, token contract, slippage and fresh quote, and completes the required Binance App confirmation.

## Rules

- BSC mainnet only (chain ID 56), spot only.
- Never infer token addresses from tickers or act on stale/demo/missing market data.
- Off-hours and stale-reference signals remain non-actionable.
- Never request or disclose seed phrases, private keys, unlock passwords, or session tokens.
- Install the official skill separately using `npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet`.
- Never claim a Wallet connection, order, or transaction hash unless it was actually checked from the user's signed-in runtime.
