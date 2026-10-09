# PRONOUS — Hackathon Submission

**BNB Hack: Tokenized Stocks Edition** (16 Sep – 11 Oct 2026)

| Item | Link |
|------|------|
| **Live app** | https://pronous.vercel.app |
| **Public repo** | https://github.com/wadezigh96/pronous |
| **PoaAnchor (BSC)** | [`0xD729eFf0E050195D464cC9597d7A5Cc7194911B5`](https://bscscan.com/address/0xD729eFf0E050195D464cC9597d7A5Cc7194911B5) |

---

## Capability status — evidence boundary

### Live / verified observations
- The public assets endpoint returned `mode: "live-data"` and 488 tokenized-stock rows in a timestamped snapshot on 9 October 2026. See the source run at [derived-price analysis CI](https://github.com/wadezigh96/pronous/actions/runs/37989233347). This is a measured snapshot, not an uptime guarantee.
- The existing production feed relies on server-side Binance Web3 credentials. A browser reader does not need to connect a wallet or provide API credentials. If the server-side feed is unavailable, the revised endpoint returns an explicit unavailable response rather than pretending demo values are live.
- The PoaAnchor address and both POA transactions above are the on-chain evidence for the attestation feature. They are not evidence that a swap was executed.

### Quote-preview only
- The PancakeSwap Unified Swap API was queried with USDT input at 10, 100 and 1,000 USDT for NVDA, TSLA and SPY on Ondo and bStocks where listed. The recorded run produced 18 attempts: 17 routes and one `NO_ROUTE`, with no quote errors. See [quote-measurement CI run](https://github.com/wadezigh96/pronous/actions/runs/37992545416) and [saved measurements](./quote-measurements.json).
- `onchainGapPct` compares a one-way buy quote with `referencePrice × tokenToShareRatio`. It is a quote-preview metric, **not a round-trip arbitrage proof**. Large gaps that carry large price impact are treated as a route/liquidity warning. No quote request in that measurement asked for calldata or broadcast a transaction.

### Not enabled / not independently verified
- Server-side transaction broadcast and autonomous execution without explicit user confirmation are not enabled by this verification.
- The live hosted BNB Agent Studio runtime and Agentic Wallet execution were not independently verified as working hosted services.
- x402 payments are not enabled.
- xStocks did not appear in the 488-asset snapshot.

---

## One-liner

PRONOUS is a BSC mainnet desk for tokenized equities: live RWA feeds, guarded preflight → simulate → confirm, and **Proof of Action (POA)** that can stay off-chain or be **anchored on-chain** with the user paying **BNB gas only** (no swap broadcast).

---

## POA contract reference and optional demo records

The documented **PoaAnchor** contract records `poaHash` and lifecycle status; its anchor call does not execute swaps. The records below have been independently verified on BSC mainnet via the public RPC. Both referenced transactions returned `status=0x1`, target the documented PoaAnchor contract, originate from the documented actor, and emit the expected `PoaAnchored` event.

| # | poaId | Status | Tx |
|---|--------|--------|-----|
| 1 | `POA-MUIRMLF` | **CONFIRMED — independently verified on-chain** | [BscScan reference](https://bscscan.com/tx/0xaac0d01ff85b77dde8f3c7240479820eadbfb5cc76306f867aa3798a085bd1e7) |
| 2 | `POA-MUIRRIEL` | **CONFIRMED — independently verified on-chain** | [BscScan reference](https://bscscan.com/tx/0x5665fd14d1d23e5a4e215470f19ab533df346fd0e47722f8bf010cb1dde264de) |

**Verified actor:** `0xfceafec082f9e8b17cdb51f33c3d5c9759a25e03`

**Event:** `PoaAnchored(poaHash, actor, status, timestamp, poaId)`

**Verify on-chain read:** BscScan → Contract → Read → `getRecord(bytes32 poaHash)`

Verified `poaHash` values from BSC mainnet transaction logs:

- Tx1: `0xe2fce44f8f9e2a6e45aa2e596c9059bba401522d2c80e2be1396e2b30687b33f`
- Tx2: `0x68372ee4c7a67863a7e961afdac351bb357d7dccc86b28f5872bc17de0786000`

---

## Architecture (judge path)

```
Market (bStocks / Ondo / xStocks)
  → Scan / gap radar
  → Quote preview (buy-side, quote-only)
  → Preflight (policy, spend caps)
  → Simulation (dry-run)
  → Explicit user confirmation
  → Wallet-owned signing/broadcast only behind gates (not used in these measurements)
  → POA create (off-chain SHA-256, free)
  → Optional POA Anchor (on-chain, user pays BNB gas)
  → Execution only after gates (spot only)
```

- **Off-chain POA:** canonical JSON → SHA-256 → verify hash match.
- **On-chain anchor:** `anchor(poaHash, status, poaId)` — does **not** execute swaps.
- **Network:** BSC mainnet (chainId 56) only.

See also: [CHECKLIST.md](./CHECKLIST.md) · [POA_ONCHAIN.md](./POA_ONCHAIN.md) · [PRODUCT.md](./PRODUCT.md) · [HACKATHON.md](./HACKATHON.md) · [DEVEX_REPORT.md](./DEVEX_REPORT.md)

---

## Verified production flow and optional demo steps

Verified production checks: `/api/agent` and the assets/radar actions returned HTTP 200; the assets action returned 488 live assets. Preflight with `amount=1` and `maxSpend=2` returned `READY_FOR_SIMULATION`. The simulation endpoint returned HTTP 200 with `simulationMode: DRY_RUN` and `broadcast: false`.

The following POA verification steps are complete: the documented PoaAnchor contract was verified on BSC mainnet, both referenced anchor transactions were independently verified with successful receipts and expected `PoaAnchored` logs, and the documented actor, POA IDs, and `poaHash` values matched the on-chain records. The market data and quote values in the linked JSON files are timestamped read-only measurements. They do not imply that an order was signed, broadcast, or filled. Agent Studio hosted runtime and Agentic Wallet live execution have not been independently verified as live.

---

## Compliance with track rules

| Rule | PRONOUS |
|------|---------|
| Tokenized stocks universe | bStocks / Ondo / xStocks feeds |
| BSC mainnet | Yes |
| Spot only / no perps | Enforced in product + copy |
| Guarded execution | Preflight and dry-run simulation verified; confirmation/broadcast remain gated, and broadcast was not used in this verification |
| Public repo + deployed app | This repo + Vercel |
| On-chain attestation | **PoaAnchor records independently verified on BSC mainnet via public RPC** |

---

## Contract note

- Source: `contracts/PoaAnchor.sol`
- Deploy settings that match bytecode: **solc 0.8.34**, **optimizer off**, **EVM cancun**
- Verification guide: `contracts/VERIFY_BSCSCAN.md`

---

*PRONOUS — Watch → Compare → Guard → Prove (optional on-chain) → Confirm.*
