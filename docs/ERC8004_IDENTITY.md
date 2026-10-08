# PRONOUS × ERC-8004 Agent Identity

Target: **Best Use of BNB Agent Studio** special prize.

## What ERC-8004 is

On-chain AI agent passport (ERC-721 + URIStorage):

- **agentId** — tokenId minted by the Identity Registry
- **agentURI** — JSON registration file (name, description, services, MCP/A2A endpoints)
- Optional reputation / validation registries

**Identity Registry (BSC mainnet):** `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`

On **BSC mainnet**, registration can be gas-sponsored via MegaFuel through the BNB Agent SDK.

## Verified PRONOUS identity

The PRONOUS identity was registered on BSC Mainnet and independently verified by querying the BSC RPC.

| Item | Verified value |
| --- | --- |
| On-chain `agentId` | **367667** |
| Identity wallet | `0x30ce2986c17BeF0496435809158E5F0a7aE77989` |
| Chain | BSC Mainnet (56) |
| Registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| Registration transaction | `0x43de410c1f554e3dc178e3778df67187a4c6957d719291123d4194f0c5d68774` |
| Receipt status | `0x1` (success) |
| Block | `0x788b2f8` |
| Explorer | https://bscscan.com/tx/0x43de410c1f554e3dc178e3778df67187a4c6957d719291123d4194f0c5d68774 |

The registration transaction was sent from the dedicated PRONOUS ERC-8004 wallet to the BSC Identity Registry. No trading transaction or PRONOUS Execute flow was used for this registration.

## Registration source

The repository contains a one-time local registration utility:

- `scripts/erc8004-register.mjs`
- npm command: `npm run erc8004:register`

The utility is intended for local operator use only. It does not run as part of the Vercel application and does not replace the existing user-confirmed trading execution path.

Never commit `PRIVATE_KEY`, `WALLET_PASSWORD`, seed phrases, or wallet keystore files.

## Registration JSON

The public registration metadata template is:

- [agent/erc8004-registration.json](../agent/erc8004-registration.json)

The registered identity uses the PRONOUS web/API/MCP service metadata described by that document.

## Safety boundary

The ERC-8004 identity wallet is separate from the PRONOUS trading wallet.

The MCP layer remains preflight/read-only; live execution stays behind the existing wallet, BSC chain, simulation, explicit confirmation, execution-gate, and Proof-of-Action controls.
