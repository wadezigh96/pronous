# CoinMarketCap Agent Context

PRONOUS can enrich its read-only MCP surface with official CoinMarketCap market context.

## What was added

- `mcp/cmc.mjs` uses CoinMarketCap's official keyless public REST surface.
- `cmc_market_context` is exposed by `mcp/server.mjs`.
- The tool can return global crypto market context and, optionally, a simple price lookup for a crypto symbol.
- It never signs, places, or broadcasts a transaction.
- No CoinMarketCap API key is stored in the repository.

CoinMarketCap documents the keyless public API at `https://pro-api.coinmarketcap.com/public-api` and its AI Agent Hub/MCP separately. The official MCP server remains available at `https://mcp.coinmarketcap.com/mcp` when a CMC API key is desired.

## Local MCP test

```bash
npm run build
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

Example use from an MCP client is to ask for CMC global market context, or request a specific crypto symbol. PRONOUS should treat the CMC result as external market context, not as an execution authorization or tokenized-stock reference price.

## Optional direct CMC MCP

For Claude Code/Cursor/Windsurf, CoinMarketCap also provides a separate MCP endpoint:

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
