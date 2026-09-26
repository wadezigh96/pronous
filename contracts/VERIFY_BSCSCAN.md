# Verify PoaAnchor on BscScan

**Contract:** [`0xD729eFf0E050195D464cC9597d7A5Cc7194911B5`](https://bscscan.com/address/0xD729eFf0E050195D464cC9597d7A5Cc7194911B5)

## Recommended: Solidity (Single file) — simpler

1. Open https://bscscan.com/verifyContract
2. Address: `0xD729eFf0E050195D464cC9597d7A5Cc7194911B5`
3. Compiler Type: **Solidity (Single file)**
4. Compiler Version: **v0.8.34+commit.80d5c536** (same as deploy)
5. Open Source License: **MIT**
6. Optimization: try **Yes**, runs **200** first
7. EVM Version: **shanghai** (or default if listed)
8. Paste entire contents of `contracts/PoaAnchor.sol`
9. Constructor arguments: **leave empty** (no constructor args)
10. Verify and Publish

If bytecode mismatch: toggle Optimization **No**, or EVM **cancun**, verify again.

## Alternative: Standard JSON-Input (your current screen)

1. Stay on **STANDARD JSON-INPUT** + compiler **v0.8.34+commit.80d5c536**
2. Download / use file: `contracts/standard-input-PoaAnchor.json` from this repo
3. Upload that `.json` file
4. Constructor arguments: empty
5. Verify and Publish

Direct raw file:
https://raw.githubusercontent.com/wadezigh96/pronous/main/contracts/standard-input-PoaAnchor.json

## Settings that must match the deploy

Verification fails when compiler settings differ from Remix deploy:

| Setting | Try first | Fallback |
|---------|-----------|----------|
| Compiler | 0.8.34 | Exact version used in Remix |
| Optimizer | Yes, 200 runs | Off |
| EVM | shanghai | cancun |
| License | MIT | MIT |
| Constructor args | (empty) | (empty) |

Check Remix → Compilation details → **Compiler configuration** for the exact flags used at deploy time.
