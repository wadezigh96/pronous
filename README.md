# PRONOUS — Tokenized Stock Agent

PRONOUS is a public-first autonomous agent for the BNB Hack: Tokenized Stocks Edition.

## Submission positioning

PRONOUS is intentionally built around the two $2,000 stack-special surfaces:
- Best Use of Agentic Wallet / Wallet Skills — real wallet state, quote, policy validation and spot execution flow.
- Best Use of BNB Agent Studio — persistent agent runtime, ERC-8004 identity, ERC-8183 task interface and x402 self-funding.

These are special prizes, not separate tracks, and the official rules allow one project to win a main placement and a special. PRONOUS does not claim a prize outcome; the implementation is being built to satisfy the published criteria.

See: agent/AGENTIC_WALLET.md, agent/AGENT_STUDIO_DEPLOY.md, agent/task-schema.json

## Two special-prize integrations

1. **Best Use of Agentic Wallet / Wallet Skills** — the agent is designed around an execution layer that can read strategy, inspect tokenized-stock data, prepare a trade, simulate it, and request/execute the action through a scoped wallet.
2. **Best Use of BNB Agent Studio** — the repository includes an Agent Studio deployment prompt/configuration path for an on-chain agent with ERC-8004 identity, ERC-8183 task interface and x402 self-funding.

The hackathon officially requires at least one of bStocks, Ondo or xStocks to be central, spot-only execution, and BSC mainnet for the final demo.

## Product idea

**Pronous Market Gap Agent** watches tokenized-equity price versus the underlying reference price. It explains the spread, checks market status, and produces a deterministic execution plan. The same plan can be run in demo mode by anyone or connected to a funded wallet for live BSC execution.

The default safety policy is:
- spot only;
- no leverage/perps;
- simulate before live execution;
- explicit spend cap;
- explicit allowlist;
- never expose API secrets to the browser;
- public demo mode when credentials are absent.

## Quick start

This repository is intentionally dependency-light and deploys cleanly to Vercel.

Set these server-side environment variables for live Binance Web3 API access:

- `BINANCE_WEB3_API_KEY`
- `BINANCE_WEB3_API_SECRET`
- `BINANCE_WEB3_SIGN_ALGO` = `HMAC_SHA256` or `ED25519`
- optional `BINANCE_WEB3_RECV_WINDOW` (default 5000)

The API signing pre-hash follows the current Binance Web3 API guidance: `timestamp + METHOD + requestPath + body`.

For Agent Studio, follow `agent/AGENT_STUDIO_PROMPT.md` and deploy the agent with BNB Agent Studio. The public web UI remains useful even before the managed agent runtime is deployed.

## Demo

Open the deployed site and:
1. Search a ticker such as NVDA.
2. Inspect tokenized assets from Ondo/bStocks.
3. Compare token price and reference price.
4. Generate a strategy plan.
5. Run the plan in simulation.
6. Connect the real API + wallet only when ready.

## Hackathon deliverables

- Public repository: this repo.
- Public web experience: `index.html`.
- API integration: `api/agent.js`.
- Agent Studio path: `agent/`.
- Developer-experience report template: `docs/DEVEX_REPORT.md`.

AI-assisted code is used in this repository, but the Developer Experience Report must be based on the builder's actual experience and observations.
