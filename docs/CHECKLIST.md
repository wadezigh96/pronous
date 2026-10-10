# PRONOUS submission checklist

Use this before pasting links into the current BNB Chain submission form.

## Required package

- [x] Public repo: https://github.com/wadezigh96/pronous
- [x] Live app: https://pronous.vercel.app
- [x] User utility center: https://pronous.vercel.app/utilities.html
- [x] DevEx report: [DEVEX_REPORT.md](./DEVEX_REPORT.md)
- [ ] Demo video ≤ 4 minutes uploaded to the form (last remaining submission item)

## Live smoke (judge path)

- [x] `GET /api/agent?action=authcheck` returns `live-auth-ok`
- [x] `GET /api/agent?action=scan&ticker=NVDA` returns live token + reference prices
- [x] Desk loads Market / Radar without a wallet
- [x] Preflight is deterministic and does not broadcast
- [x] Simulation stays behind a connected wallet + spend token
- [x] POA create / verify works off-chain
- [x] PoaAnchor live on BSC: `0xD729eFf0E050195D464cC9597d7A5Cc7194911B5`

## ERC-8004 identity

- [x] Dedicated PRONOUS ERC-8004 identity minted on BSC Mainnet
- [x] agentId: `367667`
- [x] Registry: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- [x] Registration transaction: `0x43de410c1f554e3dc178e3778df67187a4c6957d719291123d4194f0c5d68774`
- [x] `agent-card.json` records `minted-verified`
- [ ] B402/x402 production settlement verified
- [ ] x402 support enabled in `agent-card.json` after real settlement evidence

## Agentic Wallet evidence

- [x] Agentic Wallet authentication/read-only checks documented
- [x] BSC chain `56` wallet balance verified read-only
- [x] Direct Agentic Wallet CLI swap smoke test recorded: BNB→USDT on BSC (not PRONOUS API or tokenized-stock execution)
- [ ] Agent Studio hosted runtime independently verified live

> Current submission wording intentionally does not claim live Agentic Wallet execution or a hosted Agent Studio runtime as independently verified.

## x402 seller

- [x] Dedicated seller project generated separately from PRONOUS
- [x] BSC Mainnet selected
- [x] Seller wallet created
- [x] Live PRONOUS market-intelligence work hook tested
- [x] Seller price configured at $0.01
- [ ] B402 production merchant credentials issued
- [ ] `verify/settle` production payment completed
- [ ] Public x402 endpoint verified by an external buyer
- [ ] Bazaar discovery verified after successful settlement

## User utilities

- [x] Live market scanner
- [x] Opportunity radar
- [x] Deterministic preflight / execution guard
- [x] MCP market intelligence
- [x] ERC-8004 identity
- [x] Read-only BSC portfolio watcher
- [x] Local divergence alert rules
- [x] Cross-venue comparison
- [x] Published market-data quality view
- [x] API security hardening + smoke checks
- [ ] Persistent server-side notifications (future)
- [ ] Historical portfolio performance (future)

## Safety claims that must stay true

- BSC mainnet only (chain ID 56)
- Spot only, no perps
- Signal is never permission to spend
- Server does not broadcast swaps
- On-chain anchor is attestation only (user pays BNB gas)

## Special-prize extras

- Agentic Wallet: [agent/AGENTIC_WALLET.md](../agent/AGENTIC_WALLET.md)
- Agent Studio: [agent/AGENT_STUDIO_DEPLOY.md](../agent/AGENT_STUDIO_DEPLOY.md)
- ERC-8004 identity: [ERC8004_IDENTITY.md](./ERC8004_IDENTITY.md)
- MCP: [MCP.md](./MCP.md)
- x402 seller: [X402.md](./X402.md)
