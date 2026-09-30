# PRONOUS × ERC-8004 Agent Identity

Target: **Best Use of BNB Agent Studio** special prize.

## What ERC-8004 is

On-chain AI agent passport (ERC-721 + URIStorage):

- **agentId** — tokenId minted by the Identity Registry
- **agentURI** — JSON registration file (name, description, services, MCP/A2A endpoints)
- Optional reputation / validation registries

**Identity Registry (mainnets, CREATE2):** `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`

On **BSC mainnet**, registration can be gas-sponsored via MegaFuel (BNB Agent SDK).

## Status in this repo

| Item | Status |
| --- | --- |
| Registration JSON template | [agent/erc8004-registration.json](../agent/erc8004-registration.json) |
| Studio deploy prompt | [agent/AGENT_STUDIO_DEPLOY.md](../agent/AGENT_STUDIO_DEPLOY.md) |
| On-chain `agentId` | **Pending** — must be minted in BNB Agent Studio (or SDK) by the builder |
| Linked in submission form | **Pending** |

A GitHub commit cannot mint the hosted Studio identity/runtime. That step is manual in Studio UI.

## Mint path (recommended)

1. Open [BNB Agent Studio](https://www.bnbchain.org/en/bnb-agent-studio).
2. Paste the deploy prompt from `agent/AGENT_STUDIO_DEPLOY.md`.
3. Attach or host `agent/erc8004-registration.json` as the agentURI payload (IPFS or HTTPS).
4. Complete wallet / x402 / runtime steps in Studio.
5. Record here and in [CHECKLIST.md](./CHECKLIST.md):

```md
- agentId: <tokenId>
- chain: BSC (56)
- registry: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
- explorer: https://bscscan.com/token/<registry>?a=<agentId>
- studio URL: <paste>
```

## Alternative: BNB Agent SDK

```bash
pip install bnbagent
# optional: pip install "bnbagent[ipfs]"
```

See https://docs.bnbchain.org/developer-kit/bnbagent-sdk/ — register against BSC Identity Registry, pin metadata, store `agentId` in this doc.

## Safety note

Never commit Studio wallet secrets, API keys, or seed phrases. The MCP layer remains preflight/read-only; live execution stays behind user confirmation and Agentic Wallet.
