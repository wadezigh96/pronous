# PancakeSwap quote-preview integration

## Scope
- BNB Smart Chain mainnet only (chain ID 56).
- Read-only exact-input quote preview for USDT/USDC and a selected supported RWA token.
- Requires the token to resolve through PRONOUS's existing supported RWA data source.
- Token decimals are read from BSC with `eth_call`; the read-only metadata is cached in-process for up to 24 hours.
- A no-route, unavailable upstream, unverified token, invalid amount, or demo configuration is shown as unavailable rather than a successful quote.

## Important limitations
- This phase does not build PancakeSwap calldata, request token approvals, sign, send, or broadcast transactions.
- PRONOUS's existing simulation / execution flow still uses its separately configured Binance DEX builder. A PancakeSwap quote preview must not be used as proof that the Binance builder produced the same route.
- Some tokenized stocks / bStocks may have no PancakeSwap pool or may not be transferable on an AMM. No route means no trade; never treat a display/reference price as executable liquidity.
- Only enable transaction building after route calldata, router family/version, token approvals, spend caps, slippage, quote expiry, and simulation have separate tests.

## User-facing behavior
The desk labels Binance DEX and PancakeSwap separately. Only an actual live Binance quote advances the existing execution quote gate. A PancakeSwap-only quote remains a preview, not an execution-ready intent.
