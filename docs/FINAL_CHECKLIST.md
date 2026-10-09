# Final Submission Checklist

**Live app:** https://pronous.vercel.app/  
**Public repository:** https://github.com/wadezigh96/pronous  
**Submission document:** [docs/SUBMISSION.md](./SUBMISSION.md)  
**Demo video:** [ADD FINAL VIDEO URL BEFORE SUBMISSION]  
**Demo storyboard:** [docs/DEMO_VIDEO.md](./DEMO_VIDEO.md)

## Evidence links

- PR #19 ratio-adjustment merge: https://github.com/wadezigh96/pronous/pull/19
- PR #19 original green CI (96 tests, 96 pass, 0 fail): https://github.com/wadezigh96/pronous/actions/runs/37988305052
- Derived-price live snapshot + committed 488-row JSON: https://github.com/wadezigh96/pronous/actions/runs/37992545416
- Quote-only measurements (18 attempts, 17 routes, 1 no-route): https://github.com/wadezigh96/pronous/actions/runs/37992545416
- Saved data: [derived-price-analysis.json](./derived-price-analysis.json), [quote-measurements.json](./quote-measurements.json)

## Local smoke commands

Run from a clean checkout with Node.js 20 or later:

```bash
git clone https://github.com/wadezigh96/pronous.git
cd pronous
npm install
npm test
npm run build
npx -y github:wadezigh96/pronous
```

The exact `npx` MCP command is interactive/stdio; the CI smoke script initializes it and checks `market_assets`, `scan_asset`, and `preflight`. Do not mark this check complete until the Node 20 CI step prints `NPM_NPX_SMOKE_PASS`.

## Read-only API smoke checks

```bash
curl -i 'https://pronous.vercel.app/api/agent?action=assets&limit=100&offset=0'
curl -i 'https://pronous.vercel.app/api/agent?action=radar&limit=5&sizeUSDT=100'
```

Expected behavior:
- When the upstream live feed is available: `mode: live-data`, pagination metadata, and at most five quote candidates in radar.
- Quote routes show `ROUTE`, `NO ROUTE`, or `QUOTE ERROR`; missing quotes never become a zero gap.
- `onchainGapPct` / `requestedSizeGapPct` is the requested-size BUY quote gap and includes price impact; label it as an execution-price estimate, not an actual fill.
- `lowImpactGapPct` uses the smallest-size quote (10 USDT by default) as a lower-impact proxy, not a true bid/ask midpoint.
- `impactAdjustedGapPct` is a separate estimate after adjusting the requested-size quote price for reported fractional price impact; it is not a fill price.
- Off-hours preflight should remain `READY_FOR_SIMULATION` with `warning: "ACK_REQUIRED"` until acknowledged. The UI must show the stale-reference warning, keep the signal non-actionable, and send `ackOffHours=true` only when the checkbox is checked.
- Closed/pre-market/post-market assets can show `OFF_HOURS_DRIFT` and a stale-reference warning. Keep the gap visible, but keep the signal non-actionable; preflight must require acknowledgement before quote-build, and the automated loop must block it.
- The radar is not an arbitrage proof: it is a one-way quote comparison. Read price impact and session context alongside both gaps.
- When the live feed is not configured or unavailable: a clear unavailable response, no fabricated live prices.
- More than 60 requests/minute from one IP should return HTTP 429 with `Retry-After: 60` when requests hit the same warm function instance. The in-memory counter is per instance, not a shared global serverless limit.

## Manual browser checks (mobile and desktop)

- [ ] Confirm production URL points at the intended merge commit; inspect deployment details first.
- [ ] With no wallet connected, open the market feed and radar. Read-only paths should not ask the reader to connect a wallet.
- [ ] If API returns 429, confirm an explicit rate-limit message; if API is down/503, confirm the UI does not substitute stale demo numbers.
- [ ] Switch the connected wallet to a non-BSC network. Confirm execution actions show a clear BSC Mainnet / chain ID 56 error and remain gated.
- [ ] Confirm `NO ROUTE` rows show no number for `onchainGapPct`.
- [ ] Confirm postmarket/premarket/closed assets show a stale-reference warning and cannot become actionable.
- [ ] Confirm high-impact quotes show a warning and do not become actionable; the configured default cap is 1% impact.
- [ ] Check 360–430px mobile width: radar columns wrap, route state remains legible, and buttons do not overflow.
- [ ] Check README and Submission separate “Live / verified”, “Quote-preview only” and “Not enabled / not independently verified”.
- [ ] Confirm the on-chain POA records still point to their actual BSCScan transaction URLs.

## Submission form contents

- [ ] Project name: PRONOUS
- [ ] Live app URL: https://pronous.vercel.app/
- [ ] Repository URL: https://github.com/wadezigh96/pronous
- [ ] Demo video URL: [ADD FINAL VIDEO URL BEFORE SUBMISSION]
- [ ] One-line description: “A BSC tokenized-stock monitor that separates ratio-derived feed fields from independent buy-quote previews and gates action on data quality, price impact, and market session.”
- [ ] State clearly that PancakeSwap evidence is quote-only, uses USDT as the input token, and sent no transaction.
- [ ] Do not claim xStocks coverage in this snapshot, a successful Agent Studio hosted deployment, an independently verified live Agentic Wallet runtime, or enabled x402 payments without additional evidence.
- [ ] Save final CI URL, merge commit SHA, and Vercel deployment ID before pressing Submit.
