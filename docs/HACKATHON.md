# PRONOUS × BNB Hack: Tokenized Stocks Edition

Official page: https://www.bnbchain.org/en/hackathons/tokenized-stocks

Build window: **16 Sep 2026 – 11 Oct 2026 (UTC)**.
Prize pool: **$20,000** (BNB Chain + Binance Web3 Wallet).

## Official rules this repo follows

- At least one of **bStocks, Ondo or xStocks** is central. PRONOUS uses Binance Web3 RWA data for those platforms on **BSC mainnet**.
- **Spot only.** Perps are out of policy.
- **BSC mainnet only** (`binanceChainId=56`).
- Dry-run first. Live broadcast stays behind quote → simulation → confirmation.
- Public repo + deployed app + this report package.

## What to submit (mandatory)

| Item | PRONOUS |
|---|---|
| Public repo | https://github.com/wadezigh96/pronous |
| Deployed link | https://pronous.vercel.app |
| Demo video (≤ 4 minutes) | Still required before 11 Oct |
| Developer Experience Report (25% of score) | [DEVEX_REPORT.md](./DEVEX_REPORT.md) |

Registration form: https://forms.gle/NEmy3FxYc4f5Dua47

## Judging map

| Criteria | Weight | Where it shows |
|---|---|
| Technical implementation | 30% | Binance Web3 API auth, RWA market, quote/build adapters, MCP |
| Creativity | 25% | Gap desk + guarded agent loop + MCP tools |
| Developer Experience Report | 25% | docs/DEVEX_REPORT.md |
| Product quality / UX | 20% | https://pronous.vercel.app |

Tie-break: depth of Web3 API usage, then honesty of the DevEx report.

## Special prizes targeted

| Prize | Amount | Repo evidence |
|---|---|
| Best Use of Agentic Wallet / Wallet Skills | $2,000 | [agent/AGENTIC_WALLET.md](../agent/AGENTIC_WALLET.md) |
| Best Use of BNB Agent Studio | $2,000 | [agent/AGENT_STUDIO_DEPLOY.md](../agent/AGENT_STUDIO_DEPLOY.md) |

Studio identity / x402 runtime cannot be created by a GitHub repo. The hosted agent still has to be linked in the Studio UI by the builder.

## Stack used

- Binance Web3 API — market / RWA / quote / swap adapters
- Agentic Wallet / Wallet Skills — execution boundary docs + command contract
- BNB Agent Studio — deploy prompt + ERC-8004 / ERC-8183 / x402 intent
- MCP — `npx -y github:wadezigh96/pronous`

## Eligibility note

This edition is not open to residents of / persons located in the United States, Canada, the Netherlands, Iran, Cuba, North Korea, Crimea, Donetsk, Luhansk, the United Kingdom, and Japan.
