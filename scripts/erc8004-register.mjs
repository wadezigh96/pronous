import { loadEnv, EVMWalletProvider } from "@bnbagent/sdk";
import { AgentEndpoint, ERC8004Agent } from "@bnbagent/sdk/erc8004";

loadEnv();

const network = process.env.NETWORK ?? "bsc-mainnet";

if (network !== "bsc-mainnet") {
  throw new Error(
    `REFUSED: ERC-8004 PRONOUS registration requires BSC Mainnet. Got: ${network}`
  );
}

if (!process.env.WALLET_PASSWORD) {
  throw new Error("Missing WALLET_PASSWORD");
}

const wallet = new EVMWalletProvider({
  password: process.env.WALLET_PASSWORD,
  privateKey: process.env.PRIVATE_KEY,
});

console.log("PRONOUS ERC-8004 registration");
console.log("Network: BSC Mainnet");
console.log("Chain ID: 56");
console.log(`Wallet: ${wallet.address}`);

const sdk = await ERC8004Agent.create({
  walletProvider: wallet,
  network: "bsc-mainnet",
});

const agentUri = sdk.generateAgentUri({
  name: "PRONOUS",
  description:
    "Agentic market desk for tokenized equities on BNB Smart Chain. Watches Ondo, bStocks and xStocks token-vs-reference gaps, runs deterministic preflight, and keeps execution behind simulation and explicit user confirmation.",
  endpoints: [
    new AgentEndpoint({
      name: "web",
      endpoint: "https://pronous.vercel.app/",
    }),
    new AgentEndpoint({
      name: "MCP",
      endpoint: "https://github.com/wadezigh96/pronous",
      version: "2025-06-18",
    }),
    new AgentEndpoint({
      name: "api",
      endpoint: "https://pronous.vercel.app/api/agent",
      version: "1",
    }),
  ],
});

console.log("Registration URI generated.");
console.log("Submitting ERC-8004 registration...");

const result = await sdk.registerAgent(agentUri);

console.log("");
console.log("=== ERC-8004 REGISTERED ===");
console.log(`agentId: ${result.agentId}`);
console.log(`transactionHash: ${result.transactionHash}`);
console.log("network: BSC Mainnet");
console.log("chainId: 56");
console.log(
  "registry: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
);
