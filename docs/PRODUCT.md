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

**Watch → Compare → Explain → Guard → Prepare → Simulate → Confirm**

## Product hierarchy

```
PRONOUS
├── Market
│   ├── Ondo / bStocks / xStocks universe
│   ├── Token vs reference price
│   └── Market hours
├── Intelligence
│   ├── Divergence radar
│   ├── Data-quality flags
│   └── Market-state context
├── User utilities
│   ├── Market scanner
│   ├── Opportunity radar
│   ├── Portfolio watcher (read-only)
│   ├── User alerts (read-only)
│   └── Cross-venue comparison
├── Execution boundary
│   ├── Preflight
│   ├── Quote / build
│   ├── Simulation gate
│   └── Explicit confirmation
├── Proof
│   ├── Off-chain POA
│   └── Optional BSC PoaAnchor
├── Agent access
│   ├── MCP
│   ├── ERC-8004 identity
│   └── x402 / B402 paid intelligence
└── Assistant
```

## Utility principles

1. Read-only utilities must not require signing permission.
2. Alerts never auto-execute trades.
3. A large token/reference gap is not automatically an opportunity.
4. Data-quality state must be visible before a gap is acted upon.
5. Payment grants access to intelligence; it does not grant trading authorization.

See [USER_UTILITIES.md](./USER_UTILITIES.md) and [X402.md](./X402.md) for the current implementation state and remaining production gates.
