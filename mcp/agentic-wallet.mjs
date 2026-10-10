import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const BSC_CHAIN_ID = 56;
export const BSC_USDT = "0x55d398326f99059ff775485246999027b3197955";
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const DECIMAL_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;

function positiveDecimal(value) {
  const text = String(value ?? "").trim();
  if (!DECIMAL_RE.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? { text, number } : null;
}

export function buildAgenticWalletQuoteArgs({ amount, maxSpend, tokenAddress, chainId = BSC_CHAIN_ID } = {}) {
  const spend = positiveDecimal(amount);
  const cap = positiveDecimal(maxSpend);
  if (!spend || !cap) throw new Error("INVALID_AMOUNT_OR_MAX_SPEND");
  if (spend.number > cap.number) throw new Error("SPEND_CAP_EXCEEDED");
  if (Number(chainId) !== BSC_CHAIN_ID) throw new Error("BSC_MAINNET_ONLY");
  const address = String(tokenAddress ?? "").trim();
  if (!ADDRESS_RE.test(address)) throw new Error("INVALID_TOKEN_ADDRESS");
  if (address.toLowerCase() === BSC_USDT.toLowerCase()) throw new Error("TOKENS_MUST_DIFFER");
  return [
    "market-order", "quote",
    "--fromTokenQty", spend.text,
    "--fromToken", BSC_USDT,
    "--toToken", address,
    "--binanceChainId", String(BSC_CHAIN_ID),
    "--json"
  ];
}

/**
 * Runs only explicitly allowlisted, read-only baw subcommands. No shell is
 * involved, and this module intentionally does not expose the swap command.
 */
export async function runBawJson(args, {
  exec = execFileAsync,
  binary = "baw",
  timeoutMs = 15_000
} = {}) {
  if (!Array.isArray(args) || args.some((item) => typeof item !== "string")) {
    throw new Error("INVALID_BAW_ARGUMENTS");
  }
  const isWalletRead = args[0] === "wallet" &&
    ["status", "chains", "address", "balance"].includes(args[1]) &&
    args.length === 3 && args[2] === "--json";
  const isMarketQuote = args[0] === "market-order" &&
    args[1] === "quote" && args.at(-1) === "--json" &&
    args.includes("--fromTokenQty") && args.includes("--fromToken") &&
    args.includes("--toToken") && args.includes("--binanceChainId") &&
    !args.includes("--private-key") && !args.includes("--seed");
  if (!isWalletRead && !isMarketQuote) {
    throw new Error("BAW_COMMAND_NOT_ALLOWLISTED");
  }
  try {
    const result = await exec(binary, args, {
      timeout: timeoutMs,
      maxBuffer: 512 * 1024,
      windowsHide: true
    });
    const stdout = String(result?.stdout ?? "").trim();
    if (!stdout) throw new Error("BAW_EMPTY_RESPONSE");
    try {
      return JSON.parse(stdout);
    } catch {
      throw new Error("BAW_INVALID_JSON_RESPONSE");
    }
  } catch (error) {
    const code = String(error?.code ?? "");
    if (code === "ENOENT") throw new Error("BAW_NOT_INSTALLED");
    if (code === "ETIMEDOUT" || code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      throw new Error("BAW_COMMAND_TIMEOUT_OR_OUTPUT_LIMIT");
    }
    if (/^BAW_[A-Z_]+$/.test(String(error?.message ?? ""))) throw error;
    throw new Error("BAW_COMMAND_FAILED");
  }
}

export async function readAgenticWalletStatus({ run = runBawJson } = {}) {
  const commands = [
    ["wallet", "status", "--json"],
    ["wallet", "chains", "--json"],
    ["wallet", "address", "--json"],
    ["wallet", "balance", "--json"]
  ];
  const results = await Promise.all(commands.map(async (args) => ({
    command: args[1],
    result: await run(args)
  })));
  return {
    agent: "PRONOUS",
    integration: "Binance Agentic Wallet / Wallet Skills",
    mode: "read-only",
    chainId: BSC_CHAIN_ID,
    checks: Object.fromEntries(results.map(({ command, result }) => [command, result])),
    execution: { quoteOnly: true, broadcast: false }
  };
}
