# PRONOUS × BNB Hack: Tokenized Stocks Edition

Official page: https://www.bnbchain.org/en/hackathons/tokenized-stocks

Build window: **16 Sep 2026 – 11 Oct 2026 (UTC)**.
Prize pool: **$20,000** (BNB Chain + Binance Web3 Wallet).

## Official rules this repo follows

- At least one of **bStocks, Ondo or xStocks** is central. PRONOUS uses Binance Web3 RWA data for those platforms on **BSC mainnet**.
- **Spot only.** Perps are out of policy.
- **BSC mainnet only** (`binanceChainId=56`).
- Verified production flow includes preflight and a dry-run simulation. The intended architecture gates any live broadcast behind quote → preflight → simulation → explicit confirmation; broadcast was not used in this verification.
- Public repo + deployed app + this report package.

## What to submit (mandatory)

| Item | PRONOUS |
|---|---|
| Public repo | https://github.com/wadezigh96/pronous |
| Deployed link | https://pronous.vercel.app |
| Demo video (≤ 4 minutes) | Script ready: [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) · [DEMO_VIDEO.md](./DEMO_VIDEO.md). Upload the recorded file to the official form. |
| Developer Experience Report (25% of score) | [DEVEX_REPORT.md](./DEVEX_REPORT.md) |

Registration form: https://forms.gle/yToDUzaDMwWnq6R6A

## Judging map

| Criteria | Weight | Where it shows |
|---|---|
| Technical implementation | 30% | Production RWA market data verified; Binance API authentication, quote/build adapters, and MCP tools are not independently verified by this production check |
| Creativity | 25% | Gap desk + verified preflight/dry-run flow; live MCP tools are not independently verified |
| Developer Experience Report | 25% | docs/DEVEX_REPORT.md |
| Product quality / UX | 20% | https://pronous.vercel.app |

Tie-break: depth of Web3 API usage, then honesty of the DevEx report.

## Special prizes targeted

| Prize | Amount | Repo evidence |
|---|---|
| Best Use of Agentic Wallet / Wallet Skills (integration target; live execution not independently verified) | $2,000 | [agent/AGENTIC_WALLET.md](../agent/AGENTIC_WALLET.md) |
| Best Use of BNB Agent Studio (integration target; hosted runtime not independently verified) | $2,000 | [agent/AGENT_STUDIO_DEPLOY.md](../agent/AGENT_STUDIO_DEPLOY.md) |

Studio identity / x402 runtime cannot be created by a GitHub repo. The hosted agent still has to be linked in the Studio UI by the builder.

## Verified capabilities and integration targets

- **Verified in production:** Binance Web3 RWA market data; 488 live assets from the assets action; preflight returned `READY_FOR_SIMULATION`; dry-run returned `simulationMode: DRY_RUN` and `broadcast: false`.
- **Integration targets/documentation:** quote/build/swap adapters, Agentic Wallet / Wallet Skills execution, BNB Agent Studio runtime, and MCP tools. Agent Studio hosted runtime and Agentic Wallet live execution have not been independently verified as live.
- **Verification checks:** `npm test` passed 80/80; repository `HEAD` and `origin/main` were both `6483cc0` during verification. No blockchain transaction was broadcast during verification.

## Eligibility note

This edition is not open to residents of / persons located in the United States, Canada, the Netherlands, Iran, Cuba, North Korea, Crimea, Donetsk, Luhansk, the United Kingdom, and Japan.
