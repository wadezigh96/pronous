# Treg-Inspired Tool Discovery for PRONOUS

## Purpose

Borrow the useful product idea from [Treg](https://github.com/superdesigndev/treg): an agent should discover the right tool by the task it needs to perform, inspect its input contract, and explain the result. This is a design adaptation, not a copy of Treg's service or code.

PRONOUS remains the source of truth for tokenized-stock market facts, policy decisions, and wallet quote guards. This proposal adds no runtime dependency, external API key, paid catalog, wallet signer, or new network access.

## Three-category fit

| Category | Tool-discovery contribution | Evidence boundary |
|---|---|---|
| RWA | Route market questions to live asset inventory, ticker scan, and preflight; preserve source, freshness, and unavailable states. | A scan is not an execution recommendation. Do not invent prices, ratios, or market status. |
| Agentic Wallet / Wallet Skills | Route connection checks to `agentic_wallet_status`; only request `agentic_wallet_quote` after all PRONOUS gates pass. | Quote-only. No LLM-callable signing, swap submission, or broadcast. |
| BNB Agent Studio | Reuse the same task vocabulary and response contract in Studio's read-only research agent. | Source integration and successful build are not proof of a deployed Studio endpoint or on-chain identity. |

## Proposed task routing

1. **Discover** — classify the user request by intent; do not guess a ticker from ordinary words.
2. **Inspect** — use only known PRONOUS tools and their declared schemas. If a tool is unavailable, say so instead of silently substituting another source.
3. **Read** — use `market_assets`, `scan_asset`, and `preflight` for market intelligence; use `agentic_wallet_status` for operator-authenticated wallet status.
4. **Guard** — request `agentic_wallet_quote` only with an explicit ticker, amount, and maximum spend, and only when live asset, contract, ratio, data-quality, market-session, and policy checks pass.
5. **Explain** — return the tool used, source/status, important checks, and blocking reason. Keep unavailable or stale data explicit.
6. **Stop before execution** — quote output is not an order, fill, or approval. The adapter does not sign or broadcast.

## Tool registry contract

For every exposed tool, document:

- Stable tool ID and one-sentence purpose.
- Input schema, required fields, and allowed values.
- Whether it is read-only, quote-only, or a non-mutating local write.
- Data source and how unavailable/stale results are represented.
- Cost/credential requirements, if any.
- Policy gates and explicit prohibited side effects.
- A representative safe example and the expected response shape.

Do not register a tool just because an external catalog offers it. New tools must have a clear PRONOUS use case, a reviewed schema, bounded network access, and tests for malformed input and unavailable data.

## Credential and trust boundaries

- Credentials stay in the operator's approved local/runtime secret store and are never included in prompts, tool output, Git, logs, or chat.
- The LLM may choose among documented read/quote tools; it must not receive a signing primitive or raw private-key material.
- Do not forward arbitrary user-provided URLs or headers to upstream services.
- Never use a fallback that turns missing live data into fabricated or stale price data.
- Any paid third-party catalog is opt-in and must disclose the endpoint and price before a billable call.
- Keep Treg optional. PRONOUS must continue to work without a Treg account, token, or service availability.

## Implementation sequence

1. Add the task-routing skill as documentation first.
2. Review it against the existing MCP tool schemas and current safety tests.
3. If useful, add small deterministic routing tests without changing production endpoints.
4. Only after those pass, consider UI surfacing or optional external tool catalogs in a separate change.

## Non-goals

- Replacing the existing PRONOUS MCP server.
- Copying Treg's backend, catalog, billing, identity, or secret-vault implementation.
- Claiming the Binance Agentic Wallet is connected before an authenticated status check.
- Claiming BNB Agent Studio is deployed before verifying the live endpoint and relevant on-chain evidence.
- Enabling automated transaction signing or broadcast.
