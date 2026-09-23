# PRONOUS — Tokenized Stock Agent

PRONOUS is a public-first autonomous agent for the BNB Hack: Tokenized Stocks Edition.

## Submission positioning

PRONOUS combines two parts of the BNB stack in one product:

- **Agentic Wallet / Wallet Skills** — wallet state, tokenized-stock data, quotes, policy checks, simulation and spot execution.
- **BNB Agent Studio** — an autonomous agent runtime with on-chain identity, task handling and x402-based payments.

The goal is a working end-to-end flow: discover a tokenized stock, compare its token price with the reference price, create a structured action, run safety checks and simulation, then execute through a scoped wallet when the user enables live execution.

See: `agent/AGENTIC_WALLET.md`, `agent/AGENT_STUDIO_DEPLOY.md`, `agent/task-schema.json`

## Integrations

### Agentic Wallet / Wallet Skills

PRONOUS uses the wallet layer as the execution boundary. The agent can:

1. read wallet state;
2. inspect tokenized-stock market data;
3. prepare a structured trade intent;
4. request a quote;
5. validate the configured policy;
6. simulate the transaction;
7. request confirmation when required;
8. execute a spot transaction through the scoped wallet;
9. return the execution result and transaction/order reference.

### BNB Agent Studio

PRONOUS is designed to run as an autonomous agent through BNB Agent Studio. The Studio side covers the agent runtime, on-chain identity, task interface and x402 payments.

The web application remains the user-facing control and observation layer, while the agent runtime handles autonomous tasks.

## Product idea

**Pronous Market Gap Agent** watches tokenized-equity prices against their underlying reference prices. It identifies the current spread, checks market status and produces a structured execution plan.

The execution policy is deliberately simple:

- BSC mainnet;
- spot only;
- no leverage or perpetuals;
- simulation before live execution;
- explicit spend limits;
- token allowlist;
- secrets stay server-side;
- demo/read-only mode when live credentials are not configured.

## Quick start

This repository is intentionally dependency-light and deploys cleanly to Vercel.

Set these server-side environment variables for live Binance Web3 API access:

- `BINANCE_WEB3_API_KEY`
- `BINANCE_WEB3_API_SECRET`
- `BINANCE_WEB3_SIGN_ALGO` = `HMAC_SHA256` or `ED25519`
- optional `BINANCE_WEB3_RECV_WINDOW` (default 5000)

For Agent Studio, follow `agent/AGENT_STUDIO_DEPLOY.md` and deploy the agent through BNB Agent Studio.

## Demo

1. Search a ticker such as NVDA.
2. Inspect tokenized-stock data.
3. Compare token price and reference price.
4. Generate the execution plan.
5. Run the plan in simulation.
6. Enable the wallet execution layer only when ready.

## Hackathon deliverables

- Public repository: this repo.
- Public web experience: `index.html`.
- API integration: `api/agent.js`.
- Agent Studio path: `agent/`.
- Developer Experience Report template: `docs/DEVEX_REPORT.md`.

AI-assisted code is used in this repository, but the Developer Experience Report should reflect the builder's actual experience and observations.
