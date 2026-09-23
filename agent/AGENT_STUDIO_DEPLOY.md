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