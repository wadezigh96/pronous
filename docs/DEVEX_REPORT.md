# Developer Experience Report — PRONOUS

Hackathon: BNB Hack: Tokenized Stocks Edition  
Project: https://github.com/wadezigh96/pronous  
Live: https://pronous.vercel.app  

## 1. Project and integration scope

PRONOUS is a BSC mainnet desk for tokenized equities (Ondo, bStocks, xStocks). It consumes Binance Web3 RWA market data, computes ratio-adjusted spreads, and surfaces quote-based divergence via PancakeSwap. Execution paths remain gated: preflight, simulation, and explicit confirmation. No server-side transaction broadcast is implemented.

The integration targets live RWA token lists, single-ticker scans, quote previews, and an off-hours acknowledgement flow that warns without blocking simulation readiness. All measurements below are historical snapshots unless noted as current production behavior.

## 2. Binance authentication and API integration

First authenticated success required correcting both the signed request path and the key algorithm.

The HTTP client can reach `https://web3.binance.com/build/api/v1/...`, but the pre-hash string for signing must include the `/build` prefix. Omitting it produced `40102 Invalid signature`.

Docs recommend Ed25519. An HMAC-registered key signed with Ed25519 (or the reverse) also returned `40102`. Local `crypto.verify` succeeded while the remote rejected the signature, confirming a key/algorithm mismatch. The working path used HMAC with a properly formatted secret. PEM newlines flattened by Vercel environment variables required explicit `\n` normalization.

First successful endpoint: `GET /build/api/v1/dex/balance/supported/chain?binanceChainId=56`.  
`40103` did not appear once timestamps were UTC ISO-8601 with milliseconds. `X-OC-RECV-WINDOW=60000` was used during debugging; 5000 is sufficient once signing is correct.

Error code `40102` is overloaded across path, algorithm, and key mismatches.

## 3. Tokenized-stock price and share-ratio validation

A 488-asset snapshot taken 2026-10-09T21:19:28Z from the production assets endpoint showed 442 Ondo, 46 bStocks, and 0 xStocks. All 488 rows had valid positive token, reference, and ratio fields. The absolute deviation `|tokenPrice − referencePrice × shareRatio| / tokenPrice × 100` was ≤ 0.000001% for every row (median, P90, and maximum all 0%). There were zero outliers above a 0.1% threshold.

This supports the relation `tokenPrice ≈ referencePrice × shareRatio`. Large raw spreads (for example PPLT +900%, CRWD +300%) were explained by the share multiplier, not independent mispricing. Raw spread is no longer treated as a trade signal.

Single-ticker scan initially returned `shareRatio: null` and `dataQuality: "missing_ratio"` for CRWD even though the full token list contained the ratio. The current resolution order is: price response, search result, then full RWA token list matched by contract and platform. The response includes `shareRatioSource` when a ratio is recovered. Missing or invalid ratios remain non-actionable. Ratios are never inferred from raw price spreads.

Current production scan for NVDA returns `shareRatioSource: "rwa-tokens-list"` and a valid ratio. CRWD returns ratio 4 from the same source. Adjusted spreads on these rows are near zero when the ratio is present.

## 4. PancakeSwap quote and liquidity observations

Quote measurements were collected 2026-10-09T21:19:33Z for NVDA, TSLA, and SPY (Ondo and bStocks) at 10 / 100 / 1,000 USDT using PancakeSwap Unified Swap. 18 attempts produced 17 routes and 1 `NO_ROUTE` (SPY/Ondo at 1,000 USDT). Latency ranged 231–1,069 ms (median 313 ms). Price impact ranged 0–30.96% (median 0%).

These are one-way buy quotes. No calldata was requested, no wallet signed, and no transaction was broadcast. A high-impact quote (SPY/Ondo at 100 USDT: +62.75% gap, 30.96% impact) is treated as a liquidity warning, not an opportunity. Missing routes remain null, never zero.

The upstream `volume24H` field appears in responses but its unit is undocumented. Values in the snapshot were on the order of 14–19 billion. Radar ranks by the reported field when present; it is not asserted to be USD volume.

Current radar responses expose `onchainGapPct` / `requestedSizeGapPct` (requested-size buy quote including impact), `lowImpactGapPct` (smallest-size quote proxy, not a true midpoint), and `impactAdjustedGapPct` calculated as:

`((quotePrice / (1 + priceImpact)) / (referencePrice × shareRatio) − 1) × 100`

Missing or invalid price-impact values are not silently replaced with zero unless the provider explicitly reports zero. Unavailable reference data cannot produce an actionable signal.

## 5. Implementation decisions and safety constraints

Off-hours preflight returns `READY_FOR_SIMULATION` with `warning: "ACK_REQUIRED"` and a `referenceWarning` until the client sends `ackOffHours=true`. Acknowledging the warning does not make the signal actionable. Automated evaluation loops retain conservative off-hours blocking. Signals stay non-actionable until all existing execution gates pass. No server-side broadcast path was added.

`isMarketClosed` treats statuses matching closed, off-hours, pre/post-market, after-hours, overnight, or extended-hours (and equivalent openState values) as closed for warning purposes.

Actionable flags require a valid ratio, acceptable data quality, a configured gap threshold, bounded price impact, and an open market session. Quote radar uses the low-impact gap for actionability decisions.

`@bnbagent/sdk` is used only by the ERC-8004 registration script and is declared under `devDependencies`.

## 6. Remaining API or developer-experience issues

- `40102` remains a single error for multiple distinct failure modes (path, algorithm, key).
- `volume24H` unit is still undocumented.
- Agentic Wallet, Wallet Skills, and Agent Studio runtime identity/x402 are documented targets; no live hosted runtime or ERC-8004 registration is claimed from this repository alone.
- Simulation schema matching the swap builder is not independently verified.
- Rate limiting is per warm function instance; production-wide enforcement would require shared state.

## 7. Supporting evidence and reproducibility

Historical snapshots:

- 488-asset derived-price analysis: `docs/derived-price-analysis.json` (measuredAt 2026-10-09T21:19:28.729Z), CI run https://github.com/wadezigh96/pronous/actions/runs/37992545416
- Quote measurements: `docs/quote-measurements.json` (2026-10-09T21:19:33Z), same CI run
- CRWD scan regression probe: CI run https://github.com/wadezigh96/pronous/actions/runs/37994303713

Current production (2026-10-10):

- NVDA scan resolves share ratio from RWA token list; marketStatus may be `offhours`.
- CRWD scan resolves ratio 4; preflight without acknowledgement returns `warning: "ACK_REQUIRED"` and `referenceWarning` while status remains `READY_FOR_SIMULATION`.
- Radar responses contain `impactAdjustedGapPct` and `lowImpactGapPct`; `midGapPct` is absent. `broadcast: false`.

Audit workflow (with timeouts, npm cache, and install retries) completed successfully on the merged PR: https://github.com/wadezigh96/pronous/actions/runs/37999867180.

No production probe artifact is claimed beyond the live endpoint responses inspected above. Server-side broadcast remains disabled.
