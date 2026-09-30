# PRONOUS submission checklist

Use this before pasting links into the current BNB Chain submission form: https://forms.gle/yToDUzaDMwWnq6R6A

## Required package

- [x] Public repo: https://github.com/wadezigh96/pronous
- [x] Live app: https://pronous.vercel.app
- [x] DevEx report: [DEVEX_REPORT.md](./DEVEX_REPORT.md)
- [ ] Demo video ≤ 4 minutes uploaded to the form (record from [DEMO_SCRIPT.md](./DEMO_SCRIPT.md))

## Live smoke (judge path)

- [x] `GET /api/agent?action=authcheck` returns `live-auth-ok`
- [x] `GET /api/agent?action=scan&ticker=NVDA` returns live token + reference prices
- [x] Desk loads Market / Radar without a wallet
- [x] Preflight is deterministic and does not broadcast
- [x] Simulation stays behind a connected wallet + spend token
- [x] POA create / verify works off-chain
- [x] PoaAnchor live on BSC: `0xD729eFf0E050195D464cC9597d7A5Cc7194911B5`

## Agentic Wallet live evidence

- [x] Agentic Wallet authenticated and `CONNECTED`
- [x] BSC chain `56` wallet balance verified read-only
- [x] Quote-only USDT → BNB succeeded before execution
- [x] Live USDT → BNB market order finished on BSC
  - Order ID: `26093000001928633252`
  - Input: `0.030000000000000000 USDT`
  - Output: `0.000038972065408586 BNB`
  - Status: `FINISHED`
  - Tx hash: `0xa5bb9f8a3c549b69c25444f716ab6ac97ba0bd8ecf53aa07bc4f23413fbe2a4b`
- [x] Prior live BNB → USDT market order also finished
  - Order ID: `26092500001914567268`
  - Tx hash: `0x3361450a5b42c05c1b807ab29bfbf7d3600c0fcb9106a7f46746d5ce61f39e5d`
- [ ] Agent Studio hosted identity/runtime linked to the submission
  - Template: [agent/erc8004-registration.json](../agent/erc8004-registration.json)
  - How-to: [ERC8004_IDENTITY.md](./ERC8004_IDENTITY.md)
  - agentId: _pending Studio mint_
- [ ] Demo video ≤ 4 minutes uploaded

## Safety claims that must stay true

- BSC mainnet only (chain ID 56)
- Spot only, no perps
- Signal is never permission to spend
- Server does not broadcast swaps
- On-chain anchor is attestation only (user pays BNB gas)

## Special-prize extras (not mandatory for the core track)

- Agentic Wallet contract: [agent/AGENTIC_WALLET.md](../agent/AGENTIC_WALLET.md)
- Agent Studio deploy prompt: [agent/AGENT_STUDIO_DEPLOY.md](../agent/AGENT_STUDIO_DEPLOY.md)
- ERC-8004 identity pack: [ERC8004_IDENTITY.md](./ERC8004_IDENTITY.md)
- MCP one-paste: [MCP.md](./MCP.md)
