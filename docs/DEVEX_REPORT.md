# PRONOUS — Developer Experience Report

**Event:** BNB Hack: Tokenized Stocks Edition  
**Repository:** https://github.com/wadezigh96/pronous  
**Production:** https://pronous.vercel.app/

## Scope

PRONOUS is a BNB Smart Chain dashboard for tokenized equities, covering Ondo and bStocks data, with xStocks included in the intended coverage. The app reads Binance Web3 RWA data, adjusts token prices for share ratios, and compares reference prices with PancakeSwap buy quotes.

The execution boundary is deliberate: the current PRONOUS API/MCP path provides data and quote/preflight results. It does not broadcast transactions from the server. A direct wallet CLI test is documented in §8 and should not be interpreted as PRONOUS-managed execution.

## Binance Web3 API authentication

The first authenticated request succeeded after correcting the signed request path and using the algorithm associated with the API key.

- Requests use `https://web3.binance.com/build/api/v1/...`; the `/build` prefix must be included in the pre-hash signing string.
- Omitting that prefix returned `40102 Invalid signature`.
- Attempts to sign with an algorithm that did not match the registered key also returned `40102`. A successful local `crypto.verify` check did not establish that the remote service would accept the request.
- The working configuration used HMAC with the matching secret. PEM values stored in Vercel environment variables required newline normalization using explicit `\\n` replacement.
- The first successful request was `GET /build/api/v1/dex/balance/supported/chain?binanceChainId=56`.
- Using UTC ISO-8601 timestamps with milliseconds resolved the observed `40103` timestamp error. `X-OC-RECV-WINDOW=60000` was used during debugging; 5000 was sufficient after signing was corrected.

In practice, `40102` did not identify a single cause: the path, key, and signing algorithm all needed to be checked.

## RWA prices and share ratios

A production asset snapshot taken at **2026-10-09T21:19:28.729Z** contained 488 rows: 442 Ondo, 46 bStocks, and no xStocks. All rows had positive token, reference, and ratio values.

For each row, the following deviation was calculated:

`|tokenPrice − referencePrice × shareRatio| / tokenPrice × 100`

The median, P90, and maximum deviation were all 0% at the reported precision; the maximum observed deviation was no more than 0.000001%, with no rows above the 0.1% outlier threshold. This confirms that raw token/reference price differences can be explained by the share multiplier in this snapshot. For example, the large raw spreads observed for PPLT and CRWD were not, by themselves, evidence of mispricing. Raw spread is not used as a trade signal.

A single-ticker CRWD scan initially returned `shareRatio: null` and `dataQuality: "missing_ratio"`, even though the full RWA list contained the ratio. The lookup order now checks the price response, search result, then the full RWA token list by contract and platform. Responses include `shareRatioSource` when a ratio is recovered. Missing or invalid ratios remain non-actionable; the ratio is not inferred from the price spread.

Production probes on 2026-10-10 returned a ratio for NVDA from `rwa-tokens-list` and a ratio of 4 for CRWD from the same source. Adjusted spreads were near zero when the ratio was available. The NVDA observation was off-hours and should not be treated as a current trading signal.

## PancakeSwap quote checks

Quote observations were collected at **2026-10-09T21:19:33Z** for NVDA, TSLA, and SPY, across Ondo and bStocks, at requested sizes of 10, 100, and 1,000 USDT using PancakeSwap Unified Swap.

| Measurement | Result |
|---|---:|
| Quote attempts | 18 |
| Routes returned | 17 |
| `NO_ROUTE` responses | 1 |
| Latency | 231–1,069 ms; median 313 ms |
| Price impact | 0–30.96%; median 0% |

The missing route was SPY/Ondo at 1,000 USDT. These were one-way buy quotes. No calldata was requested, no wallet signed a transaction, and no transaction was broadcast. The SPY/Ondo quote at 100 USDT showed a 62.75% gap and 30.96% impact; it was treated as a liquidity warning, not an opportunity. A missing route remains null rather than being converted to zero.

The upstream `volume24H` field is present, but its unit is undocumented. Snapshot values were on the order of 14–19 billion. Radar can rank by the reported field when present, but the report does not label it USD volume.

Current radar responses expose:
- `onchainGapPct` and `requestedSizeGapPct`: requested-size buy-quote gap, including price impact.
- `lowImpactGapPct`: a smallest-size quote proxy, not a true midpoint.
- `impactAdjustedGapPct`: calculated as `((quotePrice / (1 + priceImpact)) / (referencePrice × shareRatio) − 1) × 100`.

Invalid or missing price-impact values are not silently treated as zero unless the provider explicitly reports zero. If reference data is unavailable, the result cannot be actionable.

## Execution and market-state handling

Off-hours preflight returns `READY_FOR_SIMULATION` with `warning: "ACK_REQUIRED"` and a `referenceWarning` until the client sends `ackOffHours=true`. Acknowledging the warning does not make the signal actionable. Automated evaluation loops continue to block off-hours execution. A signal must also pass the existing data-quality, ratio, configured gap, price-impact, and market-session checks.

For warning purposes, `isMarketClosed` recognizes statuses containing closed, off-hours, pre/post-market, after-hours, overnight, or extended-hours, as well as equivalent `openState` values.

The `@bnbagent/sdk` dependency is used by the ERC-8004 registration script only and is declared under `devDependencies`.

## Integration status and open issues

- **Agentic Wallet:** local MCP tools `agentic_wallet_status` and `agentic_wallet_quote` use the official `baw` CLI for wallet reads and quote previews. The adapter validates live PRONOUS data, max-spend, and market state, and returns `broadcast: false`. A direct operator-device CLI swap was completed; see §8. This does not verify order execution through PRONOUS API/MCP.
- **BNB Agent Studio:** the seller attaches a verified PRONOUS scan snapshot to ticker-research tasks and exposes the research task/skill in its A2A card. The workspace compiles and its policy tests run in a dedicated workflow. The `studio.toml`, operator-owned wallet and LLM configuration, hosted provider deployment, endpoint, and ERC-8004 runtime identity have not been verified.
- Simulation schema compatibility with the swap builder has not been independently verified.
- Rate limiting is enforced per warm function instance. Production-wide enforcement would require shared state.
- The `volume24H` unit remains undocumented.
- The API reports `40102` for several distinct signing/configuration failures.

## Evidence

Historical artifacts:
- Asset and ratio analysis: [`docs/derived-price-analysis.json`](./derived-price-analysis.json), measured at `2026-10-09T21:19:28.729Z`; [CI run](https://github.com/wadezigh96/pronous/actions/runs/37992545416).
- Quote measurements: [`docs/quote-measurements.json`](./quote-measurements.json), measured at `2026-10-09T21:19:33Z`; same CI run.
- CRWD scan regression probe: [CI run](https://github.com/wadezigh96/pronous/actions/runs/37994303713).
- Audit workflow on the merged PR: [CI run](https://github.com/wadezigh96/pronous/actions/runs/37999867180).

Production observations checked on 2026-10-10:
- NVDA scan resolved its ratio from the RWA token list; market status could be `offhours`.
- CRWD scan resolved ratio 4. Without acknowledgement, preflight returned `warning: "ACK_REQUIRED"` and `referenceWarning`, while status remained `READY_FOR_SIMULATION`.
- Radar responses contained `impactAdjustedGapPct` and `lowImpactGapPct`; `midGapPct` was absent. The adapter response included `broadcast: false`.

These production observations are endpoint checks, not a claim that every production path has been tested. Server-side transaction broadcast remains disabled.

## Direct wallet CLI smoke test — 2026-10-10

A user-approved `baw market-order swap` was submitted directly from the operator device on BNB Smart Chain mainnet (chain ID 56). The order history reported `FINISHED`; the operator also reported a successful BscScan receipt and a matching post-trade wallet balance.

| Field | Recorded value |
|---|---|
| Order ID | `26101000001954786511` |
| Transaction | [`0x72fff2b91f185314f633550ca3727b28a52275dc78afd3e287cd178c0e88a0c7`](https://bscscan.com/tx/0x72fff2b91f185314f633550ca3727b28a52275dc78afd3e287cd178c0e88a0c7) |
| Input | 0.0005 BNB |
| Quoted output | 0.374419082392055826 USDT |
| Output in order history | 0.374478155412700851 USDT |
| Slippage tolerance | 0.5% |
| MEV protection | Enabled |
| Gas setting | MEDIUM |

The subsequent wallet query returned 0.374478155412700851 USDT and 0.001135983657424455 BNB. The recorded BNB balance before the swap was 0.001696207822463896 BNB. The balance delta includes the input and transaction costs; the exact gas fee was not recorded here and should be read from the explorer transaction details before quoting a fee.

This verifies one manually approved wallet CLI swap on BSC. It does not verify execution through the PRONOUS API or MCP adapter and was not a tokenized-stock trade. The NVDA production scan was off-hours with a stale reference, so no RWA swap was attempted. The hosted Agent Studio runtime remains unverified.
