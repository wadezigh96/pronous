# PRONOUS submission checklist

Use this before pasting links into https://forms.gle/NEmy3FxYc4f5Dua47

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

## Safety claims that must stay true

- BSC mainnet only (chain ID 56)
- Spot only, no perps
- Signal is never permission to spend
- Server does not broadcast swaps
- On-chain anchor is attestation only (user pays BNB gas)

## Special-prize extras (not mandatory for the core track)

- Agentic Wallet contract: [agent/AGENTIC_WALLET.md](../agent/AGENTIC_WALLET.md)
- Agent Studio deploy prompt: [agent/AGENT_STUDIO_DEPLOY.md](../agent/AGENT_STUDIO_DEPLOY.md)
- MCP one-paste: [MCP.md](./MCP.md)
