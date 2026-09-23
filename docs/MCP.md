# PRONOUS MCP

PRONOUS can be used as an MCP server so an MCP-compatible AI client can ask about the tokenized-stock market and run guarded analysis.

The current MCP surface exposes:

- `market_assets` — inspect monitored tokenized stocks
- `scan_asset` — scan a ticker and return the market-gap assessment
- `preflight` — run deterministic spend/policy checks without executing a transaction
- `ask_pronous` — ask the PRONOUS market assistant
- `pronous://overview` — MCP resource describing capabilities and safety

## Run locally

Requirements: Node.js 20+.

```bash
npm install
npm run mcp
```

The server uses `PRONOUS_API_URL` when set; otherwise it uses the deployed PRONOUS API.

Example MCP client configuration:

```json
{
  "mcpServers": {
    "pronous": {
      "command": "node",
      "args": ["/absolute/path/to/pronous/mcp/server.mjs"],
      "env": {
        "PRONOUS_API_URL": "https://pronous.vercel.app"
      }
    }
  }
}
```

## Safety boundary

MCP does **not** expose private keys, seed phrases, wallet signing, or transaction broadcast.

The `preflight` tool only checks a proposed action. The user remains responsible for any wallet confirmation in the PRONOUS application.

The server follows the MCP model of exposing tools and resources to an MCP-compatible client. The current TypeScript SDK provides separate server/client packages and supports stdio and HTTP transports. See the official SDK documentation for client and server integration.
