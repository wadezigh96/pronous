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
- RWA price: token and reference can both be present and still be garbage. Observed live spreads of **+900%** on names such as NFLX/PPLT while NVDA was a realistic **+0.17%**.
- Trading / simulation: quote and swap adapters are wired; official simulation schema is still gated. Broadcasting from the server is intentionally off.
- Latency: market list is slower than a single ticker scan. Acceptable for a desk, too slow if every UI tile hits search+price+underlying-market separately.

## 4. Tokenized-stock behavior

- Platforms seen live on BSC: **Ondo** (majority) and **bStocks**. xStocks was in the allowlist but did not appear in the 488-asset snapshot we pulled.
- Tokenized vs reference: NVDA/Ondo was tight. Several other names printed multi-hundred-percent gaps with matching token and reference strings, which is a feed/quality problem, not a trading signal.
- Liquidity / slippage: not measured with live size. Policy refuses to treat an unreliable gap as actionable.
- Market hours: token can stay available while the reference session is closed. The desk therefore shows `marketStatus` / `openState` before treating a gap as a plan.
- Platform differences: Ondo dominated the universe. bStocks appeared as a smaller set. Comparing the same ticker across venues still depends on search results including more than one `platformId`.

## 5. AI stack

- Agentic Wallet: documented command contract in `agent/AGENTIC_WALLET.md`. Live wallet execution is not broadcast by the web app.
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
