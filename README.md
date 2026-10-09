# PRONOUS

<div align="center">

**AGENT UTILITY + TOKENIZED STOCK MARKET DESK ON BSC**

[![BNB Chain](https://img.shields.io/badge/BNB_Smart_Chain-Mainnet-F0B90B?style=for-the-badge&logo=binance&logoColor=white)](https://www.bnbchain.org/en/hackathons/tokenized-stocks)

**Watch → Compare → Explain → Guard → Prepare → Confirm**

[Live App](https://pronous.vercel.app/) · [**User Utilities**](https://pronous.vercel.app/utilities.html) · [Submission](docs/SUBMISSION.md) · [Product](docs/PRODUCT.md) · [User Utilities docs](docs/USER_UTILITIES.md) · [x402](docs/X402.md) · [DevEx](docs/DEVEX_REPORT.md) · [Demo](docs/DEMO_VIDEO.md)

</div>

---

## Verified state and production boundaries

PRONOUS is a BSC Mainnet spot desk, not an unsupervised trading bot. Read the status labels below as evidence boundaries—not roadmap language.

### Live / verified observations

- The public RWA assets endpoint returned `mode: "live-data"` and **488 assets** in the saved measurement snapshot on 9 October 2026. This is a timestamped observation, not a guarantee that the upstream API is always available.
- The production server uses its configured read-only Binance Web3 credentials for the RWA feed. Browser users do not need a wallet or paste API credentials to read the feed; if server credentials/feed access are unavailable, the API should return an explicit unavailable response, not demo prices.
- The current `api/agent.js` request guard allows 60 requests per 60 seconds per IP **per warm serverless instance**. It returns 429 with `Retry-After: 60`, but buckets are in memory and are not shared across Vercel instances; this is not a globally coordinated rate limit.
- The documented PoaAnchor contract and two example `PoaAnchored` transactions are independently verifiable on BSC mainnet; see [Submission evidence](docs/SUBMISSION.md).
- Previous smoke checks returned preflight `READY_FOR_SIMULATION` and simulation `DRY_RUN` with `broadcast: false`. They do not establish that a live trade was signed or sent.

### Quote-preview only

- The quote evidence in [`docs/quote-measurements.json`](docs/quote-measurements.json) is from PancakeSwap's Unified Swap quote endpoint, with **USDT as the from-token**. It is a one-way buy quote. No calldata was requested, no wallet signed, and no transaction was broadcast.
- `onchainGapPct` compares the quoted buy cost per token with `referencePrice × shareRatio`. A large positive value can be slippage/poor liquidity or a stale reference—not proof of arbitrage. Check price impact, quote size, route status, and market session.
- The measurements include high-impact quotes and a `NO_ROUTE` result; those records are intentionally not converted into a zero spread or a trade recommendation.

### Not enabled / not independently verified

- **Not enabled:** server-side transaction broadcast, autonomous trading without explicit user confirmation, and x402 payments.
- **Not independently verified as a live hosted service:** BNB Agent Studio deployment and Agentic Wallet runtime.
- **Local-only interface:** `npm run pronous` starts the stdio MCP server. It is not a hosted/public MCP endpoint and does not grant unrestricted wallet authority.
- **Not present in the 488-asset snapshot:** xStocks.

Any preview/development changes remain subject to the linked CI run and the deployment status for the exact merge commit. The live URL must not be assumed to be running branch-preview code before that deployment is verified.

## About

PRONOUS is an **agent utility layer** and **market desk** for tokenized equities on **BNB Smart Chain**.

> The agent may observe, explain, and prepare — but a market signal is never permission to spend.

PRONOUS separates observation, decision, execution, and proof. Guards, simulation, and explicit user confirmation sit between the agent and the chain. Optional POA can be anchored on-chain; the anchor is attestation only.

## Quick start — run the PRONOUS agent / MCP

PRONOUS includes a local **MCP server** that can be connected to an MCP-compatible AI client.

Requires **Node.js 20+**.

```bash
git clone https://github.com/wadezigh96/pronous.git
cd pronous
npm install
npm run pronous
```

`npm run pronous` starts the same local stdio MCP server as `npm run mcp`.

The MCP server defaults to the production PRONOUS API:

```text
https://pronous.vercel.app
```

To point the local agent at another PRONOUS deployment:

```bash
PRONOUS_API_URL=https://your-pronous-deployment.example npm run pronous
```

### Connect it to an MCP client

Use this configuration:

```json
{
  "mcpServers": {
    "pronous": {
      "command": "npx",
      "args": ["-y", "github:wadezigh96/pronous"]
    }
  }
}
```

Then an MCP-compatible AI client can ask PRONOUS to:

- inspect monitored tokenized stocks
- scan a ticker
- explain token/reference price divergence
- run deterministic preflight checks
- answer questions about BSC, market gaps and the PRONOUS safety model

Example:

```text
Use PRONOUS to scan NVDA and explain the token/reference gap.
```

### MCP tools

- `market_assets`
- `scan_asset`
- `preflight`
- `cmc_market_context`
- `ask_pronous`

The MCP interface is **read-only / preflight-only**. It does not expose private keys, seed phrases, wallet signing, or transaction broadcast.

## Wallet — user controlled

PRONOUS wallet actions are intentionally kept at the **user wallet boundary**.

For the web application:

1. Open **[PRONOUS](https://pronous.vercel.app/)**.
2. Connect the user's wallet through the supported wallet UI.
3. Use **BSC Mainnet / chain ID 56**.
4. Review the quote and preflight result.
5. Review the BSC simulation.
6. Give explicit confirmation.
7. The wallet remains responsible for signing the transaction.

The MCP process does **not** ask the user to paste a private key or seed phrase and does not silently take custody of the wallet.

For portfolio observation, open **[PRONOUS User Utilities](https://pronous.vercel.app/utilities.html)**. The Utilities center is read-only.

> **Important:** `npm run pronous` starts the PRONOUS MCP agent interface; it is not a private-key wallet daemon and does not grant the agent unrestricted trading authority.

---
## User utility center

Open **[PRONOUS User Utilities](https://pronous.vercel.app/utilities.html)** for the read-only control center.

### Portfolio Watcher
- BSC wallet balance
- tracked tokenized-stock balances
- estimated tokenized value
- venue and market-quality context
- coverage indicator

### Smart Alerts
- local user-defined divergence thresholds
- no server-side trading permission
- no automatic execution

### Cross-Venue Comparison
- compare the same underlying across supported venues
- token price, reference price, spread and quality
- missing data remains distinguishable from a real divergence

### Market Quality
- quality state is visible beside the spread
- unreliable observations are not promoted as trading signals

The utility center uses the wallet only as a **read-only observation source**.

## Agent path

1. Agent / MCP scans a ticker.
2. Intelligence explains token/reference divergence.
3. Policy checks network, asset, spot-only and spend limits.
4. Preflight + quote/build prepare a constrained intent.
5. Simulation is required.
6. User remains the final confirmation boundary.
7. POA can record the resulting action hash.

MCP tools: market_assets · scan_asset · preflight · ask_pronous.

## x402 / B402

A dedicated BNB Agent Studio seller project is configured for **$0.01 paid market intelligence on BSC Mainnet**. Production merchant credentials and real verify/settle evidence are still pending, so agent-card.json intentionally keeps x402Support false.

Payment never authorizes trading.

See [docs/X402.md](docs/X402.md).

## Safety boundaries

| Layer | Responsibility |
|---|---|
| Network | BSC mainnet only (chainId = 56) |
| Asset | Ondo / bStocks / xStocks |
| Spot | No leverage / perps |
| Quality | Large or unreliable gaps are guarded |
| Simulation | Required before live action |
| Confirmation | User is the last approval |
| POA | Attestation only |
| Broadcast | Wallet boundary; no server-side swap broadcast |

## Live API

- https://pronous.vercel.app/api/agent?action=authcheck
- https://pronous.vercel.app/api/agent?action=assets
- https://pronous.vercel.app/api/agent?action=radar
- https://pronous.vercel.app/api/agent?action=scan&ticker=NVDA
- https://pronous.vercel.app/api/portfolio?wallet=YOUR_BSC_ADDRESS&tickers=NVDA,AAPL

The portfolio endpoint is read-only and validates the wallet address and requested tickers.

## ERC-8004

PRONOUS has a minted BSC Mainnet ERC-8004 identity:

- agentId: 367667
- registry: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
- registration tx: 0x43de410c1f554e3dc178e3778df67187a4c6957d719291123d4194f0c5d68774

## Status

**Active build.** PancakeSwap integration is **quote-preview only** via the public Unified Swap API (`swap.pancakeswap.com/v1/quote`, BSC). It does not build calldata, request approvals, or broadcast. Some tokenized stocks have no route and are shown as unavailable. The read-only feed, user utilities and gated client-wallet path exist in code; this status is not proof that a hosted Agentic Wallet runtime or a live swap has been independently verified. POA evidence is documented in [Submission](docs/SUBMISSION.md). x402 remains pending production merchant credentials and settlement verification.

## License

[MIT](LICENSE)
