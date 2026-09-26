# PRONOUS — Submission pack

Hackathon: [BNB Hack: Tokenized Stocks Edition](https://www.bnbchain.org/en/hackathons/tokenized-stocks)
Deadline: **11 Oct 2026, 12:00 UTC**

| Item | Status | Link |
|---|---|---|
| Public repo | Ready | https://github.com/wadezigh96/pronous |
| Deployed app | Ready | https://pronous.vercel.app |
| DevEx report (25%) | Ready | [DEVEX_REPORT.md](./DEVEX_REPORT.md) |
| Judge walkthrough | Ready | this file |
| Demo script (≤ 4 min) | Ready | [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) |
| Demo video | Still required | record from DEMO_SCRIPT.md |
| Registration form | Builder action | https://forms.gle/NEmy3FxYc4f5Dua47 |
| Agent Studio hosted id | Builder action | [AGENT_STUDIO_DEPLOY.md](../agent/AGENT_STUDIO_DEPLOY.md) |

This pack is the judge-facing map. It is not a second product story.

## One-line claim

PRONOUS is a guarded tokenized-stock desk on BSC: watch the RWA universe, explain token vs reference gaps, refuse garbage spreads, and keep spend behind preflight → quote → simulation → human confirmation.

## Official constraints hit

- Universe: **Ondo / bStocks / xStocks** via Binance Web3 RWA on **BSC mainnet only**
- Venue: **spot only** — no perps
- Auth: live `HMAC_SHA256` against Binance Web3 (`/api/agent?action=authcheck`)
- Execution: server never broadcasts; wallet confirmation is the last gate
- Proof: POA hash chain links intent → simulation → confirmation → tx status

## 90-second judge walkthrough

1. Open https://pronous.vercel.app
2. Confirm `SYSTEM ONLINE` and wait for Market mode = `LIVE` (auth + assets).
3. Scan `NVDA`. Tight token/reference gap is the honest case.
4. Open Market watch / Radar. Large multi-hundred-percent gaps are marked as feed quality, not a trade.
5. Run Preflight with a spend inside the cap. Status should be `READY_FOR_SIMULATION` or a named block.
6. Connect wallet (Privy embedded, BSC `0x38`). Quote → build unsigned tx → BSC RPC simulation.
7. Confirm only after simulation `PASSED`. Create POA and show the hash.
8. Optional MCP: `npx -y github:wadezigh96/pronous` then `scan_asset` NVDA.

Live probes:

- https://pronous.vercel.app/api/agent?action=authcheck
- https://pronous.vercel.app/api/agent?action=assets
- https://pronous.vercel.app/api/agent?action=radar
- https://pronous.vercel.app/api/agent?action=scan&ticker=NVDA

## Scoring map

| Criterion | Weight | Where |
|---|---|---|
| Technical implementation | 30% | `api/agent.js`, `lib/*`, HMAC auth, quote/build/simulate adapters, MCP |
| Creativity | 25% | gap desk + quality flags + guarded loop + POA |
| Developer Experience Report | 25% | `docs/DEVEX_REPORT.md` |
| Product quality / UX | 20% | https://pronous.vercel.app |

Special prizes:

- Agentic Wallet / Wallet Skills — `agent/AGENTIC_WALLET.md`
- BNB Agent Studio — `agent/AGENT_STUDIO_DEPLOY.md` (hosted identity still has to be linked in Studio UI)

## What is intentionally unfinished

- Demo video file (must be recorded by the builder before 11 Oct).
- Hosted BNB Agent Studio ERC-8004 id / x402 runtime (cannot be minted from this repo).
- Server-side broadcast (policy: off).

## Honesty notes for judges

- First live auth took ~16 hours because `40102` hides path, algo, and key-type failures. Details are in the DevEx report.
- RWA rows can print both token and reference prices and still be garbage. PRONOUS treats `|spread| ≥ 25%` as unreliable.
- xStocks is allowlisted; recent snapshots were Ondo-heavy with a smaller bStocks set.
