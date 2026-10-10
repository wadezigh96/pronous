# Developer Experience Report — PRONOUS

**Hackathon:** [BNB Hack: Tokenized Stocks Edition](https://www.bnbchain.org/en/hackathons/tokenized-stocks)  
**Repository:** https://github.com/wadezigh96/pronous  
**Production:** https://pronous.vercel.app

## Summary

The main integration work is complete, but a few parts remain limited by the upstream API and hosted tooling. The most time-consuming issue was Binance API authentication: the first authenticated request took about 16 hours of debugging. After authentication worked, the largest data issue was interpreting tokenized-stock prices without accounting for each token's share ratio. The app now adjusts for that ratio, uses PancakeSwap quotes for the radar's on-chain comparison, and keeps execution non-broadcasting.

The results below distinguish measured behavior from assumptions. Quote previews are not fills, and a successful build or documented flow does not by itself prove a hosted wallet integration is live.

## 1. Setup and authentication

- Time from opening the Binance Web3 API documentation to the first authenticated request: approximately **16 hours**, including repeated `40102 Invalid signature` responses.
- First successful endpoint: `GET /build/api/v1/dex/balance/supported/chain?binanceChainId=56`.
- The key issue was the path used in the signature. The HTTP request could reach `https://web3.binance.com/build/api/v1/...`, while the signed request path also needed the `/build` prefix.
- A second issue was the key algorithm. An HMAC key must be used with HMAC signing; an Ed25519 key must be used with Ed25519 signing. The `40102` response did not clearly identify which part was wrong.
- When storing PEM keys in Vercel environment variables, newline escaping also needs to be handled consistently.

**Documentation improvement:** include complete Node.js signing examples for both supported algorithms, show the exact signed path including `/build`, and return a more specific error for path, algorithm, or key mismatches.

## 2. API and data findings

- The RWA token list endpoint used for the asset universe is `GET /api/v1/dex/market/rwa/tokens?binanceChainId=56`.
- A production snapshot collected on **2026-10-09 21:19:28 UTC** contained **488 assets**: 442 Ondo and 46 bStocks, with no xStocks in that response.
- All 488 rows had positive token price, reference price, and share-ratio values. For every row, `tokenPrice` matched `referencePrice × shareRatio` within the analysis script's precision. The maximum reported deviation was 0%, and no row exceeded the configured 0.1% threshold.
- This indicates that the large raw token/reference differences in this snapshot were explained by the token-to-share multiplier. It does not establish how Binance internally calculates or populates those fields.
- The raw upstream `volume24H` field was present, but its unit was not documented. The app therefore treats it as a provider-reported ranking field rather than confirmed USD volume.
- The in-memory request guard allows 60 requests per 60 seconds per IP per warm function instance. It is a local safeguard, not a globally coordinated rate limit across serverless instances.

Analysis output: [derived-price-analysis.json](./derived-price-analysis.json)  
Source run: [CI run 37992545416](https://github.com/wadezigh96/pronous/actions/runs/37992545416)

## 3. Quote and liquidity measurements

PancakeSwap quote previews were measured for NVDA, TSLA, and SPY across Ondo and bStocks where available, using requested sizes of 10, 100, and 1,000 USDT.

- **18 attempts:** 17 routes, 1 no-route response, and 0 quote errors.
- Quote latency ranged from **231 to 1,069 ms**, with a median of **313 ms**.
- Reported price impact ranged from **0% to 30.96%**, with a median of 0%.
- SPY/Ondo at 100 USDT returned a **+62.745719%** on-chain gap and **30.96%** price impact. At 1,000 USDT, that route returned `NO_ROUTE`.
- These figures are one-way buy-side quote previews, not completed trades, sell-side quotes, or round-trip arbitrage calculations. High-impact quotes are treated as route/liquidity warnings rather than trade opportunities.

Full measurements: [quote-measurements.json](./quote-measurements.json)  
Source run: [CI run 37992545416](https://github.com/wadezigh96/pronous/actions/runs/37992545416)

## 4. Price-gap definitions and safeguards

The feed's raw spread is not a reliable trade signal when it includes the token-to-share multiplier. The app calculates a ratio-adjusted feed spread and uses a separate quote-based radar to compare the buy quote against `referencePrice × shareRatio`.

The radar now distinguishes:

- `onchainGapPct`: requested-size buy quote versus the ratio-adjusted reference.
- `impactAdjustedGapPct`: the quoted price adjusted for the reported price impact before comparing it with the reference.
- `lowImpactGapPct`: a smaller-size buy quote used as a lower-impact proxy. It is **not** a true bid/ask midpoint.

A missing route remains `NO_ROUTE` with no numeric gap; it is not converted to zero. A quote is not marked actionable unless a route exists, the gap clears the configured threshold, the reported impact is within the configured limit, and the underlying reference session is not considered stale. Off-hours drift remains informational and non-actionable.

### CRWD scan regression

A live request to `GET /api/agent?action=scan&ticker=CRWD` previously returned a 300% raw spread without a share ratio, even though the full RWA token list contained a ratio of 4. The single-ticker path now resolves the ratio from the price response, search result, or full RWA token list matched by contract and platform. It records the source of the resolved ratio; if no valid ratio is found, the result remains non-actionable rather than guessing from the raw spread.

The original response-shape check did not reproduce a radar-shaped response from the single-ticker scan. The regression was the missing ratio in the scan content, not the response shape. Evidence: [CI run 37994303713](https://github.com/wadezigh96/pronous/actions/runs/37994303713).

## 5. Latest production verification

After the current changes were deployed, I queried the production API on **2026-10-09 around 23:58 UTC**:

- Scans for **NVDA, CRWD, and MSFT** returned HTTP 200, valid share ratios sourced from the RWA token list, and `dataQuality: ok`.
- The market-session state was post-market or paused. Each scan remained non-actionable and reported `broadcast: false`.
- NVDA preflight without acknowledgement returned `warning: ACK_REQUIRED` and included a warning that the underlying reference price may be stale.
- NVDA preflight with `ackOffHours=true` cleared the acknowledgement warning, but remained non-actionable and still required simulation.
- Radar returned five quote candidates, five routes, zero quote errors, and zero actionable candidates. The response included `impactAdjustedGapPct` and `lowImpactGapPct`; it no longer returned `midGapPct`.
- No transaction was signed or broadcast during these checks.

These are point-in-time API responses; market prices, routes, impact, and session status can change.

## 6. Execution and agent integration status

- The execution flow requires preflight, a quote/build step, simulation, explicit user confirmation, and transaction-binding checks. Server-side transaction broadcasting remains disabled.
- The documented Agentic Wallet flow is a gated design and code path; it is not evidence that a live hosted Agentic Wallet runtime has been verified.
- The Wallet Skills path is prepared for the hackathon special, but it still depends on the user's wallet and approval.
- The BNB Agent Studio deployment instructions are in [agent/AGENT_STUDIO_DEPLOY.md](../agent/AGENT_STUDIO_DEPLOY.md). A GitHub repository alone does not create the hosted ERC-8004 identity or complete the Studio deployment; those steps require the Studio workflow.
- The MCP package can be launched with `npx -y github:wadezigh96/pronous`. The benchmark and smoke-test workflow is tracked in GitHub Actions.

## 7. Remaining upstream and product improvements

1. Publish an official signing example that includes the `/build` prefix and separate HMAC and Ed25519 flows.
2. Return more specific authentication errors instead of a single `40102` signature error.
3. Document the unit for `volume24H`, or expose a clearly named field such as `volume24HUsd` when the value is actually USD-denominated.
4. Provide a simulation schema that matches the swap-builder output.
5. Provide a cross-venue response for the same underlying ticker across Ondo, bStocks, and xStocks.
6. Expose price source, reference age, quote timestamp, route status, and validity window in the API contract.
7. Reduce market-list latency by avoiding repeated search, price, and session lookups for each UI tile.

## 8. Supporting evidence

- [Derived-price analysis](./derived-price-analysis.json)
- [Quote measurements](./quote-measurements.json)
- [Derived-price and quote measurement CI run](https://github.com/wadezigh96/pronous/actions/runs/37992545416)
- [CRWD scan regression probe](https://github.com/wadezigh96/pronous/actions/runs/37994303713)
