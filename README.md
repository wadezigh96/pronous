# PRONOUS

<div align="center">

**AGENT UTILITY + TOKENIZED STOCK MARKET DESK ON BSC**

[![BNB Chain](https://img.shields.io/badge/BNB_Smart_Chain-Mainnet-F0B90B?style=for-the-badge&logo=binance&logoColor=white)](https://www.bnbchain.org/en/hackathons/tokenized-stocks)

**Watch → Compare → Explain → Guard → Prepare → Confirm**

[Live App](https://pronous.vercel.app/) · [**User Utilities**](https://pronous.vercel.app/utilities.html) · [Submission](docs/SUBMISSION.md) · [Product](docs/PRODUCT.md) · [User Utilities docs](docs/USER_UTILITIES.md) · [x402](docs/X402.md) · [DevEx](docs/DEVEX_REPORT.md) · [Demo](docs/DEMO_VIDEO.md)

</div>

---

## About

PRONOUS is an **agent utility layer** and **market desk** for tokenized equities on **BNB Smart Chain**.

> The agent may observe, explain, and prepare — but a market signal is never permission to spend.

PRONOUS separates observation, decision, execution, and proof. Guards, simulation, and explicit user confirmation sit between the agent and the chain. Optional POA can be anchored on-chain; the anchor is attestation only.

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

**Active build.** Live market intelligence, read-only user utilities, guarded client-wallet execution and POA are implemented. x402 remains pending production merchant credentials/settlement verification.

## License

[MIT](LICENSE)
