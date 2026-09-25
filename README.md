# PRONOUS

<div align="center">

**TOKENIZED STOCK MARKET DESK ON BSC**

[![BNB Chain](https://img.shields.io/badge/BNB_Smart_Chain-Mainnet-F0B90B?style=for-the-badge&logo=binance&logoColor=white)](https://www.bnbchain.org/en/hackathons/tokenized-stocks)
[![Stack](https://img.shields.io/badge/Stack-HTML_%2B_JS-111111?style=for-the-badge)](./index.html)
[![Agent](https://img.shields.io/badge/Agent-Guarded_Execution-7C3AED?style=for-the-badge)](./api/agent.js)
[![Market](https://img.shields.io/badge/RWA-bStocks_Ondo_xStocks-00A86B?style=for-the-badge)](./docs/PRODUCT.md)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

**Watch → Compare → Explain → Guard → Prepare → Confirm**

[Live App](https://pronous.vercel.app/) · [Hackathon map](docs/HACKATHON.md) · [DevEx report](docs/DEVEX_REPORT.md) · [Product](docs/PRODUCT.md)

</div>

---

## Hackathon alignment

Built for [BNB Hack: Tokenized Stocks Edition](https://www.bnbchain.org/en/hackathons/tokenized-stocks) (16 Sep – 11 Oct 2026).

Official rules this repo implements:

- **bStocks / Ondo / xStocks** are the market universe
- **BSC mainnet only**
- **Spot only** — no perps
- Binance Web3 API for market + quote adapters
- Agentic Wallet / Wallet Skills as the execution boundary
- BNB Agent Studio + x402 documented as the hosted-agent path
- Live broadcast stays off until simulation + user confirmation

Judges: public repo, deployed app, [DevEx report](docs/DEVEX_REPORT.md) (25% of score), demo video still required before 11 Oct.

---

## Connect PRONOUS MCP

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

> **Use PRONOUS to scan NVDA and explain the token/reference gap.**

Tools: `market_assets` · `scan_asset` · `preflight` · `ask_pronous`

[Full MCP setup →](docs/MCP.md)

---

## What is PRONOUS?

PRONOUS is a market desk for **tokenized stocks on BNB Smart Chain**.

It shows token price vs reference price, flags unreliable feeds, and keeps execution behind policy. A gap is not permission to spend.

Live checks:

- https://pronous.vercel.app/api/agent?action=authcheck
- https://pronous.vercel.app/api/agent?action=assets
- https://pronous.vercel.app/api/agent?action=radar
- https://pronous.vercel.app/api/agent?action=scan&ticker=NVDA

---

## Safety model

| Gate | Rule |
|---|---|
| Network | BSC `binanceChainId=56` |
| Asset | Ondo, bStocks or xStocks |
| Spot | No leverage / perps |
| Price | Token + reference required |
| Quality | Gaps ≥25% are marked unreliable |
| Spend cap | Intent must fit the cap |
| Simulation | Required before live action |
| Confirmation | User is the last approval |

---

## Quick start

Live auth uses **HMAC_SHA256** (the key type that currently works on Vercel):

```text
BINANCE_WEB3_API_KEY=
BINANCE_WEB3_API_SECRET=
BINANCE_WEB3_SIGN_ALGO=HMAC_SHA256
BINANCE_WEB3_RECV_WINDOW=5000
```

Never commit PEM files or secrets. See `.gitignore`.

Agent Studio / Agentic Wallet:

- [agent/AGENT_STUDIO_DEPLOY.md](agent/AGENT_STUDIO_DEPLOY.md)
- [agent/AGENTIC_WALLET.md](agent/AGENTIC_WALLET.md)

---

## Status

**Active build.** Market data is live. Execution planning is guarded. Server-side broadcast is off.

## License

[MIT](LICENSE)
