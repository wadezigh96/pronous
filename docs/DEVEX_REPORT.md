# Developer Experience Report — PRONOUS

Hackathon: [BNB Hack: Tokenized Stocks Edition](https://www.bnbchain.org/en/hackathons/tokenized-stocks)
Project: https://github.com/wadezigh96/pronous
Live: https://pronous.vercel.app

This report is the actual build log. It is not a compliment sheet.

## 1. Onboarding

- Time from opening Binance Web3 API docs to first *authenticated* success: **about 16 hours of calendar time**, including a long stretch of `40102 Invalid signature`.
- First unauthenticated / demo page: minutes. First `live-auth-ok`: only after the signing string and key *type* were both correct.
- Exact first live success endpoint: `GET /build/api/v1/dex/balance/supported/chain?binanceChainId=56`
- First blocker: authentication, not market data.

## 2. Documentation issues

- Page: https://web3.binance.com/en/dev-docs/authentication
- Section: Base URL and pre-hash `requestPath`.
- What was unclear until it failed in production: the HTTP client can call `https://web3.binance.com/build` + `/api/v1/...` and still get routed, while the **signed** path must be `/build/api/v1/...`. Missing `/build` in the pre-hash returns `40102`, not a path error.
- Second trap: Ed25519 vs HMAC. Docs recommend Ed25519. Creating an HMAC key and signing with Ed25519 (or the reverse) also returns `40102`. The error does not say "wrong algorithm".
- Third trap: Vercel env vars flatten PEM newlines. A private key that works in Termux can fail to parse or silently become the wrong material unless `\n` is normalized.
- What would make it clearer: one official Node snippet that signs `timestamp + METHOD + /build + path + query + body`, plus one HMAC example and one Ed25519 example on the same page, plus an error body that names the failed component (`path`, `algo`, `key`).

## 3. API pitfalls

- Authentication/signing: `40102 Invalid signature` was the dominant error. Local `crypto.verify` of the Ed25519 signature succeeded while Binance still rejected it, because the registered API key was not that public key / not Ed25519.
- Timestamp / recvWindow: `40103` did not appear after clocks were UTC ISO-8601 with milliseconds. `X-OC-RECV-WINDOW=60000` was used while debugging; 5000 is enough once signing is correct.
- Error codes: `40102` is overloaded. It covers missing `/build`, wrong algo, wrong secret, and mismatched public key.
- RWA search / tokens: `GET /api/v1/dex/market/rwa/tokens?binanceChainId=56` works and is the useful universe call.
- RWA price fields initially made a few names look wildly mispriced: PPLT showed **+900% raw spread**, NOW **+400%**, and CRWD **+300%**. A later measured 488-row snapshot showed why those readings were misleading: in every row with valid inputs, `tokenPrice` matched `referencePrice × tokenToShareRatio` exactly within the script’s precision. The raw spread was reflecting the token-to-share multiplier, not an independent market price. I no longer treat that raw gap as a trade signal.
- Trading / simulation: quote and swap adapters are wired; official simulation schema is still gated. Broadcasting from the server is intentionally off.
- Latency: market list is slower than a single ticker scan. Acceptable for a desk, too slow if every UI tile hits search+price+underlying-market separately.

## 4. Tokenized-stock behavior

- Platforms seen live on BSC: **Ondo** (majority) and **bStocks**. xStocks was in the allowlist but did not appear in the 488-asset snapshot we pulled.
- Tokenized vs reference: the evidence now points to a semantic problem in the feed fields, not proof that the feed itself is broken. The script run against `https://pronous.vercel.app/api/agent?action=assets` on **2026-10-09 20:47:58 UTC** received **488** live assets: **442 Ondo, 46 bStocks, 0 xStocks**. All **488/488** had valid positive token/reference/ratio fields; all **488/488** were in the `≤0.000001%` deviation histogram bucket for `abs(tokenPrice - referencePrice × ratio) / tokenPrice × 100`; median, P90, and maximum deviation were all **0%**, and there were **0** outliers above the configured **0.1%** threshold. The run and full per-asset artifact are linked here: https://github.com/wadezigh96/pronous/actions/runs/37989233347.
- Liquidity / slippage: I measured PancakeSwap quote previews for **NVDA, TSLA, and SPY**, each on Ondo and bStocks where listed, at **10 / 100 / 1,000 USDT**. The 18 quote attempts produced **17 routes, 1 no-route, 0 quote errors**. Quote latency ranged **231–755 ms** (median **278 ms**); reported price impact ranged **0–30.96%** (median **0.01%**). This is an indicative one-way buy quote, not a sell quote or a round-trip arbitrage calculation. The largest number—SPY/Ondo at 100 USDT—was **+62.752842% onchainGapPct with 30.96% price impact and 62.278069% worse price than the 10 USDT baseline**. I treat that as a route/liquidity warning, not an opportunity. One SPY/Ondo 1,000 USDT request returned `NO_ROUTE`, so the gap is null, never zero. Full raw measurements and same-ticker comparisons are saved in [`docs/quote-measurements.json`](./quote-measurements.json); the run's original log and artifacts are in [CI run 37990603018](https://github.com/wadezigh96/pronous/actions/runs/37990603018). No quote requested calldata, signed, or broadcast a transaction.
- The numeric upstream `volume24H` field was present in the quote snapshot, but its unit is not documented; values were around **14–19 billion** for the sampled assets. Radar sorts by that reported field only when present. I recommend the API add an explicit `volume24HUsd` and `volumeUnit` instead of asking clients to guess what the raw number means.
- Market hours: token can stay available while the reference session is closed. The desk therefore shows `marketStatus` / `openState` before treating a gap as a plan.
- Platform differences: Ondo dominated the universe. bStocks appeared as a smaller set. Comparing the same ticker across venues still depends on search results including more than one `platformId`.

## 4A. Derived-price audit and what I changed

The verifier was run on the production assets endpoint, not on a hand-written fixture. Its exact formula was:

`abs(tokenPrice - referencePrice * shareRatio) / tokenPrice * 100`

The saved run summary is **488 analysed, 488 valid, 488 within 0.000001%, 0 outliers above 0.1%**. Examples from the same live snapshot:

| Ticker / platform | tokenPrice | referencePrice | tokenToShareRatio | Raw token/reference spread |
|---|---:|---:|---:|---:|
| PPLT / Ondo | 1,528.5833 | 152.85833 | 10 | +900% |
| NOW / Ondo | 3,522.5 | 704.5 | 5 | +400% |
| CRWD / Ondo | 4,400.8 | 1,100.2 | 4 | +300% |
| KLAC / Ondo | 19,662.802529607463 | 1,961.1684819027985 | 10.026064925604905 | +902.6065% |
| SOXS / Ondo | ratio multiplier 0.1016956630866353 | — | 0.1016956630866353 | −89.8304% |

Those large raw spreads are explained by the share multiplier in these rows. This supports the derived-price hypothesis; it does not prove how Binance internally produced the field. The full measurement JSON was uploaded as the `derived-price-analysis` artifact in [CI run 37989233347](https://github.com/wadezigh96/pronous/actions/runs/37989233347); the compact checked-in summary is `docs/derived-price-analysis.json`.

I changed the definition of `actionable` so that a valid adjusted gap has to clear a configurable absolute threshold (`PRONOUS_MIN_ACTIONABLE_GAP_PCT`, default **1%**). Missing/invalid ratios stay non-actionable. That is only the feed-quality gate; the Divergence Radar uses a separate quote-derived field, `onchainGapPct`, and a quote route must exist before it can display a numeric gap.

Measured same-ticker on-chain gaps from the actual quote run (all values are **buy-side quote** relative to `referencePrice × shareRatio`; price impact is reported by PancakeSwap):

| Ticker | Size | Ondo gap / impact | bStocks gap / impact | Route |
|---|---:|---:|---:|---|
| NVDA | 10 USDT | +1.026828% / 0.94% | +0.006079% / 0% | Both |
| NVDA | 100 USDT | +1.781797% / 1.09% | +0.006079% / 0% | Both |
| NVDA | 1,000 USDT | +2.857447% / 2.12% | +0.006079% / 0% | Both |
| TSLA | 10 USDT | +0.517309% / 3.68% | +0.038757% / 0% | Both |
| TSLA | 100 USDT | +6.203777% / 6.50% | +0.038757% / 0% | Both |
| TSLA | 1,000 USDT | +10.141729% / 3.25% | +0.043413% / 0% | Both |
| SPY | 10 USDT | +0.292568% / 0.69% | −0.029489% / 0.01% | Both |
| SPY | 100 USDT | +62.752842% / 30.96% | −0.028641% / 0.01% | Both |
| SPY | 1,000 USDT | `NO_ROUTE` | −0.021914% / 0% | bStocks only |

The differences between Ondo and bStocks are materially different, but the high-impact Ondo quotes are not evidence of executable arbitrage. At the adjacent source snapshot, Ondo records for these tickers reported `marketStatus: "postmarket"`; after-hours reference staleness is an additional reason not to promote the observed gap to an action. The radar now treats premarket/postmarket/closed states as stale-reference risk and requires a configured meaningful gap **and** a known price impact no greater than **1%** before marking a quote actionable. The code is intentionally conservative.

Suggested API contract, instead of overloading one `spreadPct` field:

- `priceSource`, `referencePriceSource`, `referenceAgeMs`, `qualityFlag`
- `onchainPrice`, `onchainPriceSource`, `onchainGapPct`
- `routeStatus` (`ROUTE`, `NO ROUTE`, `QUOTE ERROR`), `quoteSizeUSDT`, `quotedAt`, `validForMs`
- `priceImpactPct`, `slippageVs10USDTPct`, `marketSessionStatus`, `actionable`

A missing route must remain null and be labelled `NO ROUTE`; a missing price must never silently become zero. If the underlying market is closed, the same gap may mean either a real opportunity or a stale reference and should not automatically pass the actionability gate.

## 5. AI stack

- Agentic Wallet: documented command contract in `agent/AGENTIC_WALLET.md`. Live wallet execution is available only after preflight, quote/build, chain simulation, explicit confirmation, transaction-binding hash verification, and a final chain simulation; the user's wallet performs the signing/broadcast. Server-side broadcast remains off.
- Wallet Skills: targeted for the $2,000 special. Skills are not a substitute for a funded user wallet.
- BNB Agent Studio: deploy prompt is in `agent/AGENT_STUDIO_DEPLOY.md`. A GitHub repo cannot mint the hosted ERC-8004 identity or x402 runtime; that step is still manual in Studio.
- Model / IDE: Grok + Vercel + GitHub. Termux/OpenSSL used to generate Ed25519 keys that we later abandoned for HMAC after the key-type mismatch.
- What worked: MCP (`npx -y github:wadezigh96/pronous`), live RWA after HMAC auth, deterministic preflight.
- What failed: Ed25519 production auth against an HMAC (or differently registered) API key; Vercel redeploys that reused an older git SHA while `main` already had the `/build` signing fix.

## 6. Redesign suggestions

1. Put the `/build` prefix in every official signing example, including copy-paste Node and curl.
2. Return `40102_PATH` / `40102_ALGO` / `40102_KEY` instead of one signature error.
3. Ship a `POST /build/api/v1/dex/auth/self-test` that echoes algorithm detected and whether the public key matches.
4. Document Vercel/serverless PEM storage (`replace \\n`, keep BEGIN/END).
5. Mark RWA rows with a quality flag when `|token/reference - 1|` exceeds a published bound.
6. One page that says: pick HMAC *or* Ed25519 at key creation, then use that exact algo in `X-OC-SIGN`.

## 7. Requested capabilities

- Official transaction simulation schema that matches the swap builder output.
- Cross-venue payload: same underlying ticker with Ondo / bStocks / xStocks quotes in one call.
- Server-side quality score for token vs reference.
- Agent Studio hook that accepts a public GitHub repo and returns the ERC-8004 agent id without a second dashboard paste.
