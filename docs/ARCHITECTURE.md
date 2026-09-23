# PRONOUS Architecture

PRONOUS is organized as a small product system rather than a single-page demo.

## System shape

```
                    PRONOUS DESK
                         │
              ┌──────────┴──────────┐
              │                     │
         Market UI              Ask / Agent
              │                     │
              └──────────┬──────────┘
                         │
                    Agent Layer
                         │
          ┌──────────────┼──────────────┐
          │              │              │
       Observe         Guard          Plan
          │              │              │
          └──────────────┼──────────────┘
                         │
                  Binance Web3 API
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
    RWA Data          Trading          Wallet
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │
                  BNB Smart Chain
```

## Request flow

```
Market data
   ↓
Normalize asset
   ↓
Compare token/reference price
   ↓
Detect gap
   ↓
Check market state
   ↓
Apply policy
   ↓
Build plan
   ↓
Preflight / simulation
   ↓
User confirmation
   ↓
Execution
   ↓
Record result
```

## Repository layers

- **UI** — `index.html`: product dashboard, market terminal, asset drawer and execution cockpit.
- **Agent** — `api/agent.js`: market intelligence, plans, preflight and execution adapters.
- **Skills** — `api/skills.js`: specialized agent capabilities and routing.
- **Assistant** — `api/ask.js`: lightweight deterministic PRONOUS assistant.
- **Agent docs** — `agent/`: Agentic Wallet, Agent Studio and task definitions.
- **Documentation** — `docs/`: architecture, product and developer notes.

## Safety boundary

The agent can observe and prepare an action without automatically spending funds.

```
READ → ANALYZE → GUARD → PREPARE → SIMULATE → CONFIRM → EXECUTE
```

Wallet confirmation and configured policy remain the boundary for consequential actions.
