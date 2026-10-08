# PRONOUS User Utilities

PRONOUS is intended to be a market utility for tokenized stocks on BSC, not only a dashboard.

## Available now

### 1. Market scanner

A user can scan a ticker and receive:

- tokenized asset
- platform
- token price
- reference price
- spread
- data quality
- market status
- execution guard state

Example:

```
NVDA → token/reference gap → quality → market state
```

### 2. Opportunity radar

The live radar compares the monitored universe and surfaces the largest gaps that pass the current data-quality filter.

A large gap is **not** a buy instruction.

### 3. Pre-trade guard

The execution path remains:

```
preflight
→ quote/build
→ chain simulation
→ explicit confirmation
→ wallet signing/broadcast
```

The agent cannot turn a market signal into automatic spending.

### 4. MCP

AI clients can use PRONOUS for market intelligence and deterministic preflight without receiving private keys or signing access.

## Next product utilities

These are intentionally separated from the trading path.

### Portfolio watcher

Read-only wallet analysis:

- tokenized-stock holdings
- estimated exposure
- concentration
- venue/platform distribution
- market-value changes

No transaction permission is required.

### User alerts

User-defined conditions such as:

- NVDA discount above a threshold
- premium above a threshold
- market session opens
- data quality becomes unreliable

Alerts should be read-only and should never auto-execute a trade.

### Cross-venue comparison

For the same underlying ticker, compare available venues:

```
NVDA
├── Ondo
├── bStocks
└── xStocks
```

The comparison must distinguish missing data from a genuine price difference.

### Market-data quality score

Publish a simple quality state for every observation:

- **HIGH** — token and reference prices are coherent
- **CAUTION** — unusual divergence or incomplete context
- **UNRELIABLE** — observation must not be treated as an opportunity

The quality layer exists to prevent large feed errors from becoming trading signals.

## Product principle

```
Observe → Explain → Guard → Prepare → Simulate → Confirm
```

The most important boundary remains:

> A market signal is never permission to spend.
