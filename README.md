# PRONOUS

**See the gap. Understand the market. Act with guardrails.**

PRONOUS is a simple on-chain market desk for tokenized stocks on BNB Smart Chain. It watches tokenized-equity prices against their reference prices, explains the difference, and turns a market signal into a controlled action plan.

## What it does

1. **Watch** — track tokenized stocks and market status.
2. **Compare** — see token price vs. reference price and the spread.
3. **Explain** — ask PRONOUS why the gap exists or what the market state means.
4. **Guard** — apply spot-only rules, spend limits and token checks.
5. **Prepare** — build a structured plan and run preflight/simulation before any live action.
6. **Confirm** — keep the final wallet action under user control.

PRONOUS is built for the tokenized-stock workflow highlighted by the [BNB Hack: Tokenized Stocks Edition](https://www.bnbchain.org/en/hackathons/tokenized-stocks), where bStocks, Ondo and xStocks can be used as the tokenized-equity layer.

## Why PRONOUS?

Traditional market hours and on-chain availability do not always move together. PRONOUS makes that difference visible instead of hiding it.

The core idea is intentionally simple:

**Token price → Reference price → Gap → Market state → Guardrails → Action**

## Core features

- Tokenized-stock market terminal
- Token/reference price comparison
- Divergence radar
- Market-hours awareness
- 24/7 natural-language questions
- Agent skills for observation, detection and safety checks
- Preflight checks with explicit spend limits
- Simulation-first execution flow
- Agentic Wallet / Wallet Skills integration path
- BNB Agent Studio integration path
- BSC mainnet, spot-only execution policy

## Safety model

PRONOUS does not treat a market signal as permission to spend.

The execution path is separated into:

**Observe → Detect → Verify → Guard → Plan → Simulate → Confirm → Execute → Record**

Live execution remains behind wallet confirmation and configured policy controls.

## Integrations

### Binance Web3 API

PRONOUS uses Binance Web3 APIs for the tokenized-stock data and execution workflow. The project is structured around RWA data, market information, trading/quote flows, transaction simulation and wallet state.

### Agentic Wallet / Wallet Skills

The wallet layer is used as the execution boundary. PRONOUS is designed to read relevant wallet/asset state, prepare an action, apply policy checks and require confirmation before a consequential transaction.

### BNB Agent Studio

PRONOUS can be extended into a persistent agent through BNB Agent Studio, using its agent runtime, identity/task capabilities and x402 payment layer.

## Run locally

This repository is intentionally dependency-light.

Set these server-side environment variables for live Binance Web3 API access:

- `BINANCE_WEB3_API_KEY`
- `BINANCE_WEB3_API_SECRET`
- `BINANCE_WEB3_SIGN_ALGO` = `HMAC_SHA256` or `ED25519`
- optional `BINANCE_WEB3_RECV_WINDOW` (default `5000`)

Then deploy the project to Vercel or run it with a static/serverless JavaScript environment.

For Agent Studio deployment, see:

- `agent/AGENT_STUDIO_DEPLOY.md`
- `agent/AGENTIC_WALLET.md`
- `agent/task-schema.json`

## Project structure

- `index.html` — PRONOUS market desk and user interface
- `api/agent.js` — market intelligence, plans and guarded execution adapters
- `api/skills.js` — agent skill definitions and routing
- `api/ask.js` — simple 24/7 PRONOUS assistant
- `agent/` — Agentic Wallet and Agent Studio integration notes

## Status

PRONOUS is an active hackathon build. Read-only market intelligence and guarded planning are the primary product surface; live execution remains deliberately gated while transaction flows are verified.

## License

See the repository for the applicable license and project terms.
