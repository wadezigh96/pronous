---
name: pronous-agentic-wallet
description: Analyze tokenized stocks with PRONOUS, then use Binance Agentic Wallet Wallet Skills for wallet checks and BSC mainnet quote previews. Does not silently place orders.
---

# PRONOUS × Binance Agentic Wallet

Use this workflow for bStocks/Ondo/xStocks market-gap research.

## Required sequence

1. Use PRONOUS `scan_asset` for the requested ticker and `preflight` for the intended amount and explicit maximum spend.
2. Stop if the scan is unavailable, the asset is not bStocks/Ondo/xStocks, the share ratio/data quality is invalid, the underlying session is closed/off-hours, or preflight is blocked / returns `ACK_REQUIRED`.
3. Run the installed official Wallet Skill's read-only commands: `baw wallet status --json`, `baw wallet chains --json`, `baw wallet address --json`, and `baw wallet balance --json`. Never ask the user to paste a seed phrase, private key, session token, or wallet password into chat.
4. For a fresh preview only, run `baw market-order quote --fromTokenQty <amount> --fromToken <BSC-USDT-address> --toToken <verified-RWA-token-address> --binanceChainId 56 --json`. Enforce amount <= maxSpend before issuing the command. Quote output is not a fill and not proof of profit.
5. Compare the wallet quote with PRONOUS's reference-price × share-ratio context. Explain price impact, quote age, token/platform, market status, and limitations.
6. Do not invoke `baw market-order swap` unless the human explicitly asks to place that exact order after reviewing a fresh quote, spend amount, slippage, and token address. Binance App confirmation/risk settings remain mandatory. A broad request to “integrate” or “finish the project” is not an instruction to spend funds.
7. After any human-authorized trade performed through the official skill, read back the transaction/order status and record the actual hash. Never fabricate transaction evidence.

## Boundaries

- BSC mainnet chain ID 56 and spot only.
- No perps; no token addresses inferred from a ticker.
- No executable quote calldata is requested by PRONOUS.
- Market-closed / stale-reference signals stay non-actionable.
- This skill complements the official `binance-agentic-wallet` skill; install it separately as documented in `agent/AGENTIC_WALLET.md`.
- No trade is executed by this PRONOUS MCP integration. Its Agentic Wallet tools are read-only status checks and quote previews (`broadcast: false`).
