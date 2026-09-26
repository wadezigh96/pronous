# PRONOUS — Hackathon Submission

**BNB Hack: Tokenized Stocks Edition** (16 Sep – 11 Oct 2026)

| Item | Link |
|------|------|
| **Live app** | https://pronous.vercel.app |
| **Public repo** | https://github.com/wadezigh96/pronous |
| **PoaAnchor (BSC)** | [`0xD729eFf0E050195D464cC9597d7A5Cc7194911B5`](https://bscscan.com/address/0xD729eFf0E050195D464cC9597d7A5Cc7194911B5) |

---

## One-liner

PRONOUS is a BSC mainnet desk for tokenized equities: live RWA feeds, guarded preflight → simulate → confirm, and **Proof of Action (POA)** that can stay off-chain or be **anchored on-chain** with the user paying **BNB gas only** (no swap broadcast).

---

## On-chain evidence (live mainnet)

Contract **PoaAnchor** records `poaHash` + lifecycle status. Value of every anchor tx is **0** — only network gas.

| # | poaId | Status | Tx |
|---|--------|--------|-----|
| 1 | `POA-MUIRMLF` | PLANNED (0) | [0xaac0d01f…d1e7](https://bscscan.com/tx/0xaac0d01ff85b77dde8f3c7240479820eadbfb5cc76306f867aa3798a085bd1e7) |
| 2 | `POA-MUIRRIEL` | PLANNED (0) | [0x5665fd14…64de](https://bscscan.com/tx/0x5665fd14d1d23e5a4e215470f19ab533df346fd0e47722f8bf010cb1dde264de) |

**Actor (both txs):** `0xfceafec082f9e8b17cdb51f33c3d5c9759a25e03`

**Event:** `PoaAnchored(poaHash, actor, status, timestamp, poaId)`

**Verify on-chain read:** BscScan → Contract → Read → `getRecord(bytes32 poaHash)`

Example hashes:

- Tx1: `0xe2fce44f8f9e2a6e45aa2e596c9059bba401522d2c80e2be1396e2b30687b33f`
- Tx2: `0x68372ee4c7a67863a7e961afdac351bb357d7dccc86b28f5872bc17de0786000`

---

## Architecture (judge path)

```
Market (bStocks / Ondo / xStocks)
  → Scan / gap radar
  → Preflight (policy, spend caps)
  → Quote (from ≠ to token)
  → Simulation (dry-run)
  → Explicit user Confirm
  → POA create (off-chain SHA-256, free)
  → Optional POA Anchor (on-chain, user pays BNB gas)
  → Execution only after gates (spot only)
```

- **Off-chain POA:** canonical JSON → SHA-256 → verify hash match.
- **On-chain anchor:** `anchor(poaHash, status, poaId)` — does **not** execute swaps.
- **Network:** BSC mainnet (chainId 56) only.

See also: [POA_ONCHAIN.md](./POA_ONCHAIN.md) · [PRODUCT.md](./PRODUCT.md) · [HACKATHON.md](./HACKATHON.md) · [DEVEX_REPORT.md](./DEVEX_REPORT.md)

---

## Demo flow (suggested video)

1. Open https://pronous.vercel.app — market live.
2. Scan NVDA (or any listed ticker).
3. Preflight → Simulate.
4. Create POA → Verify (VALID · hash match).
5. Connect wallet → **Anchor POA on-chain** → approve (gas only).
6. Show BscScan tx + `PoaAnchored` event + optional `getRecord`.

---

## Compliance with track rules

| Rule | PRONOUS |
|------|---------|
| Tokenized stocks universe | bStocks / Ondo / xStocks feeds |
| BSC mainnet | Yes |
| Spot only / no perps | Enforced in product + copy |
| Guarded / confirmed execution | Preflight → sim → confirm gates |
| Public repo + deployed app | This repo + Vercel |
| On-chain attestation | PoaAnchor + live txs above |

---

## Contract note

- Source: `contracts/PoaAnchor.sol`
- Deploy settings that match bytecode: **solc 0.8.34**, **optimizer off**, **EVM cancun**
- Verification guide: `contracts/VERIFY_BSCSCAN.md`

---

*PRONOUS — Watch → Compare → Guard → Prove (optional on-chain) → Confirm.*
