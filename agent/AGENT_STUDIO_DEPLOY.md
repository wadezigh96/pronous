# PRONOUS × BNB Agent Studio

PRONOUS is designed to target the Best Use of BNB Agent Studio special prize.

Official Studio:
https://www.bnbchain.org/en/bnb-agent-studio

## Deploy prompt

Deploy PRONOUS as a BSC mainnet autonomous tokenized-stock market-gap agent. Use Binance Web3 RWA Data as the market-data layer and keep at least one of bStocks, Ondo or xStocks central. Give the agent an ERC-8004 identity and an ERC-8183 task interface. Enable x402 self-funding where supported. The agent accepts a ticker or structured market-gap task, reads token price, underlying reference price and market status, calculates the spread, and returns an auditable structured decision. For live execution, connect Binance Agentic Wallet / Wallet Skills as the execution layer. Enforce BSC chain ID 56, spot-only trading, token allowlists, per-task and daily spend caps, quote-before-trade, simulation/preflight before broadcast, and confirmation for the first live execution. Never execute from unvalidated free-form model output. Keep a read-only/demo mode available without a funded wallet. Return the agent identity, task id, quote, policy decision, execution result and transaction/order hash when available.

## Expected Studio capabilities

- ERC-8004 on-chain agent identity
- ERC-8183 task interface
- managed autonomous runtime
- x402 self-funding
- Binance RWA market intelligence
- Agentic Wallet / Wallet Skills execution
- auditable task results

A GitHub repository cannot itself create the hosted Agent Studio identity/runtime. The final Studio deployment must be performed by the builder in the Studio environment and then linked in the hackathon submission.

Never put Studio wallet secrets, API keys, or seed phrases in GitHub.

## Current implementation in the three-category branch

The nested TypeScript agent now imports a PRONOUS research module from `app/agent/src/pronousResearch.ts`. When a task contains a recognizable ticker, it queries the deployed PRONOUS `/api/agent?action=scan` endpoint and attaches a compact fact snapshot only when the response confirms a supported Ondo/bStocks/xStocks asset, valid token address, positive prices and share ratio, and `dataQuality: "ok"`. An unavailable response is passed through as unavailable; off-hours stays explicitly non-actionable. The seller model is still limited to read-only chain tools and is instructed not to invent values or sign or broadcast transactions.

A GitHub Actions workflow builds this TypeScript workspace and tests the live-data policy. This is **source integration, not a completed Studio deployment**. The workspace still needs its operator-owned `app/agent/studio.toml`, encrypted throwaway wallet, LLM activation, deploy-time storage configuration, and a real `bag doctor` / `bag deploy prepare` / selected-provider deployment/verification run. Do not claim an Agent Studio endpoint or ERC-8004 runtime identity until the deployed endpoint and on-chain record are independently verified.

### Safe deployment path

Use the official [BNB Agent Studio quickstart](https://docs.bnbchain.org/developer-kit/bnbchain-studio/quickstart/). Install `@bnbagent/studio-cli` and the `/bnbagent-studio` skill, inspect the workspace with `bag scan` and `bag doctor`, and have the skill reconcile configuration before deploy. The managed `bnb` provider is a 48-hour **testnet** trial; create a throwaway wallet and never reuse a mainnet wallet. Storage must be configured for IPFS for hosted delivery. Do not commit `.studio/`, `.env.local`, wallet material, or provider credentials. Only claim the Studio special prize after the live deployment and identity endpoint verify successfully.
