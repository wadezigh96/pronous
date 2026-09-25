# PRONOUS Product Map

## One-line utility

**PRONOUS makes tokenized-stock price gaps on BSC understandable and guarded.**

Built for [BNB Hack: Tokenized Stocks Edition](https://www.bnbchain.org/en/hackathons/tokenized-stocks).

## Official constraints

- Central assets: **bStocks, Ondo, xStocks**
- Network: **BSC mainnet only**
- Venue: **spot only** (no perps)
- Execution: quote → simulate → confirm. The server does not broadcast.

## Core loop

**Watch → Compare → Explain → Guard → Prepare → Confirm**

## Product hierarchy

```
Dashboard
├── Market
│   ├── Ondo / bStocks / xStocks universe
│   ├── Token vs reference price
│   └── Market hours
├── Intelligence
│   ├── Divergence radar (actionable gaps only)
│   └── Data-quality flags
├── Execution boundary
│   ├── Preflight
│   ├── Simulation gate
│   └── Confirmation
└── Assistant / MCP
```
