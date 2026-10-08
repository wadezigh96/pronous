# PRONOUS User Utilities

The utility center is available at **/utilities.html** and is intentionally separated from the transaction execution surface.

## Implemented

### Portfolio watcher

Read-only BSC Mainnet wallet inspection:

- native BNB balance
- tracked tokenized-stock balances
- token price and estimated tokenized value
- venue/platform
- data quality and market status
- requested-vs-resolved coverage

The API never signs or broadcasts. It accepts a validated wallet address and a bounded list of tickers.

### Smart alerts

Local user rules can watch divergence thresholds. Alerts are informational only and do not call the execution path.

### Cross-venue comparison

The utility page compares the same underlying ticker across supported venues and displays:

- venue
- token price
- reference price
- spread
- data quality
- market status

Missing rows remain missing; they are not synthesized.

### Market quality

The quality state is shown next to the spread. Unreliable data is not silently converted into an opportunity.

## Production boundaries

- BSC Mainnet only
- Read-only wallet observation
- No private keys
- No signing
- No automatic network switching
- No transaction construction
- No transaction broadcast
- No alert-triggered execution
- Existing execution gates remain unchanged

## Remaining improvements

Future iterations can add persistent authenticated preferences, push/email delivery for alerts, richer historical portfolio performance, and broader token coverage without weakening the execution boundary.

Product principle:

```
Observe → Compare → Explain → Guard → Prepare → Simulate → Confirm
```

A market signal is never permission to spend.
