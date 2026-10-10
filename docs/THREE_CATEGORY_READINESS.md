# Three-category readiness — PRONOUS

This document separates source-code integration from independently verified runtime behavior. A special-prize checkbox is not evidence of a working live integration.

## 1. Main track — Tokenized Stocks Products & Agents

**Existing product evidence:** the deployed app is https://pronous.vercel.app/ and source is public. The PRONOUS API reads Binance Web3 RWA feeds, supports Ondo/bStocks/xStocks, validates token-to-share ratios, and reports quote-based gap data. Off-hours signals remain non-actionable. Historical evidence, formulas and limitations are recorded in `docs/SUBMISSION.md` and `docs/DEVEX_REPORT.md`. On-chain POA evidence attests actions; it does not attest to a swap.

**Submission must include:** a public repository, deployed app/run instructions, a demo video no longer than four minutes, and the required Developer Experience Report form.

## 2. Special prize — Best Use of Agentic Wallet / Wallet Skills

This branch adds a local MCP integration:
- `agentic_wallet_status` reads status, supported chains, address and balances via the official `baw` CLI.
- `agentic_wallet_quote` only returns a quote after a verified live PRONOUS scan, valid RWA token and share ratio, confirmed open market, deterministic preflight and amount ≤ maxSpend.
- The wrapper uses argument arrays rather than shell evaluation and does not expose signing, swap submission or transaction broadcast. Quote output is marked `broadcast: false`.

**Operator proof still required:** install the official skill, authenticate in Binance App on the machine running the MCP server, invoke both tools, and capture the genuine CLI response. Do not claim a connected wallet from source code or mocked CI tests.

Official skill installation:

```bash
npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet
```

## 3. Special prize — Best Use of BNB Agent Studio

The nested TypeScript seller now queries PRONOUS's deployed scan API for a ticker task and attaches only validated live RWA facts. The model receives explicit instructions not to invent prices, treat unavailable data as live, or sign/broadcast. The dedicated workflow compiles the workspace and tests the verification/market-data policy.

**Operator proof still required:** the repository has not established a valid Studio deployment configuration, authenticated wallet, LLM/storage configuration, hosted endpoint, or deployed ERC-8004 identity. The official Studio-managed `bnb` provider is a 48-hour testnet trial and requires a throwaway wallet; IPFS storage is required for hosted deliverables. Complete the official `bag doctor`, `bag deploy prepare`, deployment, and `bag deploy verify` steps on the operator machine before claiming this integration as a live hosted service.

Official quickstart: https://docs.bnbchain.org/developer-kit/bnbchain-studio/quickstart/

## Verification boundaries

- Unit tests and CI prove guard logic and buildability, not a user's logged-in Wallet CLI session or a hosted Studio deployment.
- Do not claim an order was executed unless the signed-in provider returned actual order/transaction status and the hash was independently checked.
- Do not commit `.studio/`, `.env.local`, wallet files, credentials, or seed phrases.
- This work is proposed on `feat/three-category-hackathon-20261010`; it must pass CI and be reviewed before merging into the deployed app.
