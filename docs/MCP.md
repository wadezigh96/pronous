# PRONOUS MCP

## Connect PRONOUS

PRONOUS can be connected to an MCP-compatible AI client as a local stdio server.

### One-copy setup

Copy this configuration into your MCP client's server configuration:

```json
{
  "mcpServers": {
    "pronous": {
      "command": "npx",
      "args": ["-y", "github:wadezigh96/pronous"]
    }
  }
}
```

The server defaults to `https://pronous.vercel.app`.

To use another deployment, add:

```json
"env": {
  "PRONOUS_API_URL": "https://your-pronous-deployment.example"
}
```

### What you can ask

- **market_assets** — inspect monitored tokenized stocks
- **scan_asset** — scan a ticker and its token/reference gap
- **preflight** — check a proposed spend against deterministic guardrails
- **ask_pronous** — ask about tokenized stocks, gaps, market hours, BSC and execution

Example:

```text
Use PRONOUS to scan NVDA and explain the token/reference gap.
```

### Safety boundary

MCP exposes market intelligence and preflight only.

It does **not** expose:
- private keys
- seed phrases
- wallet signing
- transaction broadcast

The user remains the final approval boundary for any wallet action.

### Local test

Requires Node.js 20+.

```bash
npm install
npm run mcp
```

For the official MCP Inspector:

```bash
npx @modelcontextprotocol/inspector npx pronous-mcp
```

MCP's official TypeScript SDK documents stdio as the transport for local process-spawned integrations; stdout is reserved for protocol messages. citeturn0search0turn0search10
