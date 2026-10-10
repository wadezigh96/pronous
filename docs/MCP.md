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
- **agentic_wallet_status** — read Binance Agentic Wallet status, supported chains, address and balances from the official `baw` CLI
- **agentic_wallet_quote** — request a fresh BSC mainnet quote only after PRONOUS validates live token data, market session, ratio and spend cap
- **ask_pronous** — ask about tokenized stocks, gaps, market hours, BSC and execution

Example:

```text
Use PRONOUS to scan NVDA and explain the token/reference gap.
```

### Safety boundary

MCP market scans and preflight remain read-only. The optional Agentic Wallet tools use the installed official `baw` CLI for wallet reads and a quote preview; they require the operator to complete Wallet Skill authentication on their device. The quote tool enforces BSC mainnet, a verified supported RWA token, explicit max spend, valid ratio/data quality, and an open underlying market.

The PRONOUS MCP adapter does **not** expose:
- private keys, seed phrases, or unlock passwords
- swap submission or transaction signing
- transaction broadcast

Quote output is not an order or fill. The result includes `broadcast: false`; the human must independently review any order in Binance Agentic Wallet and complete its required confirmation.

### Local test

Requires Node.js 20+.

```bash
npm install
npm run pronous

# `npm run mcp` remains supported as a compatibility alias
```

For the official MCP Inspector:

```bash
npx @modelcontextprotocol/inspector npx pronous-mcp
```

MCP's official TypeScript SDK documents stdio as the transport for local process-spawned integrations; stdout is reserved for protocol messages. citeturn0search0turn0search10
