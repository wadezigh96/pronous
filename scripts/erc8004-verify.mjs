import { createPublicClient, getAddress, http, parseAbi } from "viem";
import { bsc } from "viem/chains";

const REGISTRY = getAddress("0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
const DEFAULT_AGENT_ID = "367667";
const DEFAULT_REGISTRATION_TX =
  "0x43de410c1f554e3dc178e3778df67187a4c6957d719291123d4194f0c5d68774";
const DEFAULT_EXPECTED_OWNER = getAddress(
  "0x30ce2986c17BeF0496435809158E5F0a7aE77989"
);

const agentIdText = process.env.ERC8004_AGENT_ID ?? DEFAULT_AGENT_ID;
if (!/^\d+$/.test(agentIdText)) {
  throw new Error("ERC8004_AGENT_ID must be a decimal token ID.");
}
const agentId = BigInt(agentIdText);
const registrationTx = process.env.ERC8004_REGISTRATION_TX ?? DEFAULT_REGISTRATION_TX;
if (!/^0x[0-9a-fA-F]{64}$/.test(registrationTx)) {
  throw new Error("ERC8004_REGISTRATION_TX must be a 32-byte transaction hash.");
}
const expectedOwner = getAddress(
  process.env.ERC8004_EXPECTED_OWNER ?? DEFAULT_EXPECTED_OWNER
);
const rpcUrl = process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org/";

const client = createPublicClient({
  chain: bsc,
  transport: http(rpcUrl, { timeout: 15_000 }),
});

const abi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

console.log("PRONOUS ERC-8004 read-only verification");
console.log(`Registry: ${REGISTRY}`);
console.log(`Agent ID: ${agentId}`);
console.log("Expected network: BSC Mainnet (56)");

const chainId = await client.getChainId();
if (chainId !== 56) {
  fail(`RPC returned chain ID ${chainId}; refusing to verify on a non-BSC network.`);
  process.exit();
}
console.log("PASS: RPC chain ID is 56.");

const receipt = await client.getTransactionReceipt({ hash: registrationTx });
if (receipt.status !== "success") {
  fail(`Registration transaction receipt status is ${receipt.status}.`);
  process.exit();
}
console.log(`PASS: registration transaction succeeded in block ${receipt.blockNumber}.`);

const owner = getAddress(
  await client.readContract({
    address: REGISTRY,
    abi,
    functionName: "ownerOf",
    args: [agentId],
  })
);
if (owner !== expectedOwner) {
  fail(`ownerOf(${agentId}) returned ${owner}; expected ${expectedOwner}.`);
} else {
  console.log(`PASS: on-chain owner matches ${owner}.`);
}

const uri = await client.readContract({
  address: REGISTRY,
  abi,
  functionName: "tokenURI",
  args: [agentId],
});
if (typeof uri !== "string" || uri.trim().length === 0) {
  fail("tokenURI is empty or invalid.");
} else {
  console.log("PASS: on-chain tokenURI is non-empty.");
  console.log("tokenURI:");
  console.log(uri);
  console.log(
    "Note: this verifier prints the registered URI but does not modify it or assume the hosted runtime is deployed."
  );
}

if (process.exitCode !== 1) {
  console.log("ERC-8004 identity checks completed. Review the URI and transaction in BscScan before making submission claims.");
}
