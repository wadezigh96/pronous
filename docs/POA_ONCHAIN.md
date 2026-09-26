# On-chain POA anchor

PRONOUS Proof of Action can stay off-chain (hash only) or be **anchored on BSC**.

## Live deployment (BSC mainnet)

**PoaAnchor:** [`0xD729eFf0E050195D464cC9597d7A5Cc7194911B5`](https://bscscan.com/address/0xD729eFf0E050195D464cC9597d7A5Cc7194911B5)

Hardcoded as default in the desk. Users can override via Save field / localStorage.

## Model

1. Create POA off-chain → `poaId` + `poaHash` (free).
2. User clicks **Anchor POA on-chain**.
3. Wallet sends one tx to `PoaAnchor.anchor(poaHash, status, poaId)`.
4. **User pays BNB gas** (~$0.05–0.30 typical on BSC).
5. Event `PoaAnchored` is permanent on-chain evidence.

This does **not** broadcast swaps. Execution remains a separate, guarded flow.

## Deploy (once)

Already deployed at the address above. To redeploy:

1. Open [Remix](https://remix.ethereum.org).
2. Paste `contracts/PoaAnchor.sol`.
3. Compile (solc 0.8.20+).
4. Deploy with Injected Provider → **BNB Smart Chain (56)**.
5. Copy contract address into the desk POA field → **Save**.

Optional: set `localStorage.pronous_poa_anchor` or `window.PRONOUS_POA_ANCHOR`.

## Contract

- `anchor(bytes32 poaHash, uint8 status, string poaId)` — one hash once; reverts if already anchored.
- Status: 0 PLANNED … 6 EXPIRED (same lifecycle as off-chain POA-1).
- `getRecord(bytes32)` — read actor, status, timestamp, poaId.

## Security notes

- Anyone can anchor any hash (open attestation). For production, add allowlist or EIP-712 signed payload.
- `EXECUTED` should only be used when a real swap `txHash` exists off-chain.
- Gas is always paid by `msg.sender` (the connected wallet).
