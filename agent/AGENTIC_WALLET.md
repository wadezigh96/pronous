# PRONOUS × Binance Agentic Wallet / Wallet Skills

PRONOUS is designed to target the Best Use of Agentic Wallet / Wallet Skills special prize.

Official Binance Agentic Wallet documentation:
https://developers.binance.com/en/docs/products/agentic-wallet/welcome

Install the official skill:
npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet

## Agent execution contract

The agent converts natural-language requests into a structured intent and validates:
- BSC mainnet (chain ID 56)
- spot tokenized-stock operations only
- bStocks, Ondo or xStocks as the supported asset layer
- explicit maximum spend
- approved token scope
- quote before execution
- simulation/preflight before execution
- user confirmation for the first live trade
- no private keys in the browser or repository

## Wallet Skills flow

1. wallet status
2. wallet address / wallet balance
3. PRONOUS RWA scan
4. calculate token-vs-reference spread
5. produce a structured intent
6. obtain a quote
7. run safety checks
8. ask for confirmation when required
9. execute the spot order through Agentic Wallet
10. return order/transaction status and an audit record

Useful commands:
- baw wallet status --json
- baw wallet chains --json
- baw wallet address --json
- baw wallet balance --json
- baw market-order quote --fromTokenQty <amount> --fromToken <address> --toToken <address> --binanceChainId 56 --json
- baw market-order swap --fromTokenQty <amount> --fromToken <address> --toToken <address> --binanceChainId 56 --slippage auto --mev true --gasLevel MEDIUM --json

PRONOUS adds an application-level policy layer so the agent can explain why an action is allowed or blocked.

## Public-first mode

PRONOUS remains useful without credentials. The public web app runs deterministic simulation and never broadcasts a transaction in demo mode.

Live execution requires the user's own authenticated Agentic Wallet and funds. Never commit wallet secrets.