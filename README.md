# PRONOUS

<div align="center">

**AGENT UTILITY + TOKENIZED STOCK MARKET DESK ON BSC**

[![BNB Chain](https://img.shields.io/badge/BNB_Smart_Chain-Mainnet-F0B90B?style=for-the-badge&logo=binance&logoColor=white)](https://www.bnbchain.org/en/hackathons/tokenized-stocks)
[![Agent](https://img.shields.io/badge/Agent-MCP_%2B_Guarded_Execution-7C3AED?style=for-the-badge)](./api/agent.js)
[![Market](https://img.shields.io/badge/RWA-bStocks_Ondo_xStocks-00A86B?style=for-the-badge)](./docs/PRODUCT.md)
[![POA](https://img.shields.io/badge/POA-On--chain_anchor-F0B90B?style=for-the-badge)](./docs/POA_ONCHAIN.md)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

**Watch → Compare → Explain → Guard → Prepare → Confirm**

[Live App](https://pronous.vercel.app/) · [**Submission**](docs/SUBMISSION.md) · [Hackathon](docs/HACKATHON.md) · [DevEx](docs/DEVEX_REPORT.md) · [Product](docs/PRODUCT.md) · [User Utilities](docs/USER_UTILITIES.md) · [x402](docs/X402.md) · [On-chain POA](docs/POA_ONCHAIN.md) · [Demo](docs/DEMO_VIDEO.md)

</div>

---

## About

PRONOUS is an **agent utility layer** and **market desk** for tokenized equities on **BNB Smart Chain**.

The core principle is simple:

> The agent may observe, explain, and prepare — but a market signal is never permission to spend.

PRONOUS separates **observation**, **decision**, **execution**, and **proof**. Guards, simulation, and explicit user confirmation sit between the agent and the chain. Optional **Proof of Action (POA)** can stay off-chain (hash only) or be **anchored on-chain** — the user pays **BNB gas only**; swaps are not broadcast by the anchor.

---

## Core workflow

```text
Watch → Compare → Explain → Guard → Prepare → Simulate → Confirm → Prove
```

| Step | What happens |
|------|----------------|
| **Watch** | Tokenized-stock universe + market status |
| **Compare** | Token price vs reference price |
| **Explain** | Gap, premium/discount, market context |
| **Guard** | Network, asset, spot-only, spend cap |
| **Prepare** | Structured spot intent (no broadcast) |
| **Confirm** | Simulation + explicit wallet approval |
| **Prove** | POA hash · optional BSC anchor (gas only) |

---

## Agent path

1. Agent / MCP tool scans the market or a ticker (e.g. NVDA).
2. Intelligence explains token vs reference gap.
3. Policy checks network (BSC 56), asset allowlist, spot-only, spend cap.
4. Preflight + quote build a constrained intent.
5. Simulation is required before any live path.
6. User remains the final confirmation boundary.
7. POA records the action hash; optional **PoaAnchor** writes it on-chain.

**MCP (one paste):**

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

> Use PRONOUS to scan NVDA and explain the token/reference gap.

Tools: `market_assets` · `scan_asset` · `preflight` · `ask_pronous` — [MCP setup](docs/MCP.md)

---

## User utilities

**Available now:** live market scanning, opportunity radar, deterministic preflight, MCP intelligence, ERC-8004 identity, and guarded wallet execution.

**Next utility layer:** read-only portfolio watching, user-configurable alerts, cross-venue comparison, and a published market-data quality score. These utilities do not authorize transactions.

See [docs/USER_UTILITIES.md](docs/USER_UTILITIES.md).

---

## x402 / B402

PRONOUS has a dedicated BNB Agent Studio seller project configured for a $0.01 paid market-intelligence request on BSC Mainnet. Production merchant credentials and real verify/settle evidence are still pending, so `agent-card.json` intentionally keeps `x402Support: false`.

See [docs/X402.md](docs/X402.md).

---

## Safety boundaries

| Layer | Responsibility |
|-------|----------------|
| **Network** | BSC mainnet only (`chainId = 56`) |
| **Asset** | Ondo / bStocks / xStocks only |
| **Spot** | No leverage / perps |
| **Price** | Token + reference required |
| **Quality** | Large gaps marked unreliable |
| **Spend cap** | Intent must fit the cap |
| **Simulation** | Required before live action |
| **Confirmation** | User is the last approval |
| **POA anchor** | Attestation only — not a swap |
| **Broadcast** | Server-side live execution stays off until gates pass |

A market gap alone never authorizes spending. AI / agent logic is not a security boundary; policy + user confirmation remain the enforcement layer.

---

## Architecture

```text
Desk → Market/Agent → Intelligence → Guard → Quote/Build → Simulation → User Confirmation → Wallet → BSC
                                                        └→ POA off-chain / on-chain
```

Live API checks:

- https://pronous.vercel.app/api/agent?action=authcheck
- https://pronous.vercel.app/api/agent?action=assets
- https://pronous.vercel.app/api/agent?action=radar
- https://pronous.vercel.app/api/agent?action=scan&ticker=NVDA

---

## On-chain POA (live)

| Item | Link |
|------|------|
| **Contract** | [0xD729eFf0E050195D464cC9597d7A5Cc7194911B5](https://bscscan.com/address/0xD729eFf0E050195D464cC9597d7A5Cc7194911B5) |
| **Evidence** | [docs/SUBMISSION.md](docs/SUBMISSION.md) |
| **How it works** | [docs/POA_ONCHAIN.md](docs/POA_ONCHAIN.md) |

`anchor(poaHash, status, poaId)` — value `0`, user pays gas only. Does not execute swaps.

---

## Project structure

```text
pronous/
├── index.html
├── api/
├── lib/
├── agent/
├── contracts/
└── docs/
```

---

## Hackathon alignment

Built for [BNB Hack: Tokenized Stocks Edition](https://www.bnbchain.org/en/hackathons/tokenized-stocks) (16 Sep – 11 Oct 2026).

- **bStocks / Ondo / xStocks** universe · **BSC mainnet** · **spot only**
- Binance Web3 market + quote adapters
- Agentic Wallet / Wallet Skills as execution boundary
- BNB Agent Studio + x402 as hosted-agent path
- Live broadcast gated until simulation + user confirmation

Judges: public repo · deployed app · [DevEx report](docs/DEVEX_REPORT.md) · demo video — [DEMO_VIDEO.md](docs/DEMO_VIDEO.md)

---

## Quick start

```text
BINANCE_WEB3_API_KEY=
BINANCE_WEB3_API_SECRET=
BINANCE_WEB3_SIGN_ALGO=HMAC_SHA256
BINANCE_WEB3_RECV_WINDOW=5000
```

Deploy to Vercel (or any serverless JS host). Never commit secrets.

- [agent/AGENT_STUDIO_DEPLOY.md](agent/AGENT_STUDIO_DEPLOY.md)
- [agent/AGENTIC_WALLET.md](agent/AGENTIC_WALLET.md)

---

## Status

**Active build.** Market intelligence live · client-wallet execution is live behind preflight → quote/build → chain simulation → explicit confirmation → final chain simulation gates. Server-side broadcast remains off; the user's wallet is the signing/broadcast boundary. POA anchor is live on BSC.

## License

[MIT](LICENSE)
