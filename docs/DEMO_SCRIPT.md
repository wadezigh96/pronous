# PRONOUS demo script (≤ 4 minutes)

Record against https://pronous.vercel.app. Speak in English. Keep the cursor on the thing you name.

## 0:00–0:20 — Hook

"PRONOUS is a tokenized-stock desk on BNB Smart Chain. It watches Ondo, bStocks and xStocks, explains the token versus reference gap, and will not spend until preflight, quote, simulation and a human confirmation all pass."

Show: top bar `SYSTEM ONLINE`, Market mode flipping to `LIVE`, asset count filling.

## 0:20–1:10 — Market intelligence

"The feed is live Binance Web3 RWA data, not a mock."

- Refresh Market watch.
- Search `NVDA`. Open the row. Point at token price, reference price, market state.
- Scan `NVDA` in the Scan card. Read the gap out loud.
- Open Radar. Point at a huge spread if one exists: "This is a data-quality flag, not a trade. Policy treats gaps at or above 25 percent as unreliable."

## 1:10–2:20 — Guarded action

"A gap never authorizes a spend."

- Set amount `10`, max spend `100`.
- Run Preflight. Read two passing checks and the next step.
- Connect Wallet (Privy). Confirm BSC mainnet.
- Paste a source token only if you will stay in dry-run. Otherwise stop after preflight and say: "Quote and build stay behind a connected wallet and a valid source token. The server does not broadcast."
- If you have a quote: Build unsigned transaction → Simulate execution. Show `PASSED`.
- Do **not** confirm a live swap in the video unless the wallet is a funded test account you control.

## 2:20–3:10 — Proof and agent surface

- Create POA. Show `poaId` + hash.
- Verify proof. Say: "Every action can leave tamper-evident evidence."
- Optional: show MCP config from the README and the tools `market_assets`, `scan_asset`, `preflight`, `ask_pronous`.

## 3:10–3:50 — Constraints + close

"Rules we implemented: BSC only, spot only, Binance Web3 auth, human confirmation last. What a GitHub repo cannot mint is the hosted Agent Studio identity — that link is a separate Studio step."

End on the live URL and the repo URL.

## B-roll if time remains

- `/api/agent?action=authcheck` → `live-auth-ok`
- Skills card
- On-chain panel after an asset with a contract address

## Do not do on camera

- Do not paste API secrets or PEM material.
- Do not present a 900% NFLX-style print as an arbitrage.
- Do not broadcast a transaction unless it is intentional and reversible in your own wallet.
