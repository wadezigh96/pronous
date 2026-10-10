# PRONOUS × Binance Agentic Wallet / Wallet Skills

## Implemented in this branch

The local stdio MCP server exposes `agentic_wallet_status` and `agentic_wallet_quote`:

- `agentic_wallet_status` calls the official `baw` CLI for status, chains, address and balances. The data is not mocked; CLI sign-in is still required on the operator's device.
- `agentic_wallet_quote` first requires a live PRONOUS scan for a supported Ondo/bStocks/xStocks token, a valid contract address and share ratio, acceptable data quality, an open underlying market, and `READY_FOR_SIMULATION` preflight. It enforces the explicit max-spend cap, then requests a quote through the official Agentic Wallet CLI on BSC mainnet (chain ID 56).
- The MCP adapter is quote-only. It never signs or broadcasts a transaction and returns `broadcast: false`. A returned quote is not a fill or a profit guarantee.

## Install the official Wallet Skill

On the same machine where the local PRONOUS MCP server runs:

```bash
npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet
```

Then, through the AI client that has the official skill installed, say **“Sign in to Binance Agentic Wallet”** and finish setup in the Binance App. Never share seed phrases, private keys, password, recovery material, or session tokens in chat or GitHub.

## Run and verify locally

From the repository root, run:

```bash
npm test
npm run mcp
```

Configure the client to use `npm run mcp` as a local stdio MCP server. Confirm the two new tools appear. Invoke `agentic_wallet_status` first. Only after the live Wallet CLI is signed in should you call `agentic_wallet_quote`, with an explicit ticker, amount and maxSpend (for example `NVDA`, `1`, `2`). This example is a read-only quote request, not authorization to buy or trade.

## Security boundary / evidence status

The helper uses `execFile` (not a shell), an allowlist of wallet-read and quote subcommands, bounded output/time, JSON parsing, BSC chain pinning, max spend, live-data gates, and market-session checks. Automated tests cover these guards. The feature is a local integration, not a hosted Vercel signer. Do not claim live wallet connectivity until the operator runs the status command in a signed-in environment. This PRONOUS adapter intentionally does not expose swap/broadcast.
