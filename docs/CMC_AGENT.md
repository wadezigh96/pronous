# CoinMarketCap Agent Context

PRONOUS can enrich its read-only MCP surface with official CoinMarketCap market context.

## What was added

- `mcp/cmc.mjs` uses CoinMarketCap's official Pro REST API.
- Authentication is supplied at runtime through `CMC_API_KEY`; the key is never stored in the repository.
- `cmc_market_context` is exposed by `mcp/server.mjs`.
- The tool can return global crypto market context and, optionally, a simple price lookup for a crypto symbol.
- It never signs, places, or broadcasts a transaction.

CoinMarketCap's current official MCP endpoint is `https://mcp.coinmarketcap.com/mcp` and uses the `X-CMC-MCP-API-KEY` header. CoinMarketCap also documents an x402 MCP endpoint for pay-per-request access without an API key. PRONOUS's local adapter deliberately does not make payments; it uses an ordinary runtime API key instead.

## Runtime configuration

Set the key only in the local environment or deployment secret store:

```bash
export CMC_API_KEY="YOUR_CMC_API_KEY"
```

Never commit the value or place it in source code.

## Local MCP test

```bash
npm run build
node --test scripts/cmc.test.mjs
node mcp/server.mjs
```

The new tool is:

```text
cmc_market_context
```

Example input:

```json
{"symbol":"BTC"}
```

PRONOUS should treat the CMC result as external crypto market context, not as an execution authorization or tokenized-stock reference price.

## Optional direct CMC MCP

For Claude Code/Cursor/Windsurf, CoinMarketCap provides a separate MCP endpoint:

```json
{
  "mcpServers": {
    "cmc-mcp": {
      "url": "https://mcp.coinmarketcap.com/mcp",
      "headers": {
        "X-CMC-MCP-API-KEY": "YOUR_CMC_API_KEY"
      }
    }
  }
}
```

Keep `YOUR_CMC_API_KEY` outside Git. The direct CMC MCP is read-only market intelligence; PRONOUS remains the BSC tokenized-stock guardrail/execution layer.
