# Demo Video Storyboard (maximum 4 minutes)

**Target runtime:** 3:30–3:50  
**Recording link:** https://youtube.com/watch?v=1mWSYCV5yyQ (user-reported duration: 3:27; contents/access not independently reviewed)  
**App:** https://pronous.vercel.app/  
**Repo:** https://github.com/wadezigh96/pronous

Record only after the exact merge commit has successful CI and Vercel shows its deployment as `READY`. Use a fresh browser session and visible timestamps. Do not stage or imply that a transaction was sent.

| Time | Screen / action | Narration point |
|---|---|---|
| 0:00–0:25 | Open the app and show the saved raw token/reference spread examples. | “A +900% raw spread looked like a dislocation, but it was not independent price evidence.” |
| 0:25–0:55 | Open `docs/derived-price-analysis.json` and [the derived-price CI run](https://github.com/wadezigh96/pronous/actions/runs/37992545416). Show 488/488 in the smallest histogram bucket and zero outliers above 0.1%. | “The measured rows matched `referencePrice × tokenToShareRatio`; the raw ratio is not a market opportunity by itself.” |
| 0:55–1:40 | Open Divergence Radar. Show `lowImpactGapPct` from the smallest-size quote proxy, `impactAdjustedGapPct`, and `onchainGapPct` / `requestedSizeGapPct` as the requested-size quote gap. | “The low-impact quote is a small-size proxy, not a midpoint. The requested-size quote is an execution-price estimate with impact; `impactAdjustedGapPct` is a separate modelled adjustment, not an actual fill.” |
| 1:40–2:15 | Show the NVDA / TSLA / SPY venue comparison. Highlight SPY/Ondo at 100 USDT (+62.75% gap, 30.96% impact) and SPY/Ondo at 1,000 USDT (`NO_ROUTE`). | “A huge gap with huge impact is a liquidity warning, not an instruction to trade. A missing route has no numeric gap.” |
| 2:15–2:45 | Show `OFF_HOURS_DRIFT`, its stale-reference warning and the measured `postmarket` state. If the feed is unavailable, show unavailable status rather than demo values. | “After regular hours, the gap remains visible but the signal is informational only and non-actionable.” |
| 2:45–3:15 | Run preflight while the underlying market is closed. Show `ACK_REQUIRED`, check the off-hours acknowledgement, rerun and show the stale-reference warning remains while `actionable: false`; then show a dry-run with `broadcast: false`. | “Preflight and simulation are gates, not evidence of a completed order.” |
| 3:15–3:40 | Show the explicit confirmation control but do not approve a real wallet transaction. End with the status boundaries in README/SUBMISSION. | “The user remains the signing boundary. This recording sends no swap.” |

## Capture checklist

- [ ] Confirm production URL is running the intended merged commit.
- [ ] Use only values visible in committed JSON or linked CI logs.
- [ ] Show quote size, route status and price impact beside any quote gap.
- [ ] Keep `NO_ROUTE` as a missing value, never 0%.
- [ ] Show `OFF_HOURS_DRIFT` and the stale-reference warning for closed/premarket/postmarket data, with the gap visible but non-actionable.
- [ ] Show preflight, dry-run simulation and the confirmation UI, then stop before signing/broadcast.
- [ ] Do not claim Agent Studio, x402 or hosted Agentic Wallet functionality without separate evidence.
- [ ] Keep the final cut under four minutes.
