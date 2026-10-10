import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const DECIMAL_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;

export const BSC_CHAIN_ID = 56;
export const BSC_USDT = "0x55d398326f99059ff775485246999027b3197955";
const SUPPORTED_PLATFORMS = new Set(["ondo", "bstock", "xstocks"]);

function amountValue(value) {
  const text = String(value ?? "").trim();
  if (!DECIMAL_RE.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const units = BigInt(whole + fraction.padEnd(18, "0"));
  return units > 0n ? { text, units } : null;
}

async function getJson(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000)
  });
  let data;
  try { data = await response.json(); } catch { throw new Error("PRONOUS_INVALID_JSON"); }
  if (!response.ok) throw new Error(`PRONOUS_HTTP_${response.status}`);
  return data;
}

export function buildAgenticWalletQuoteArgs({ amount, maxSpend, tokenAddress, chainId = BSC_CHAIN_ID } = {}) {
  const spend = amountValue(amount);
  const cap = amountValue(maxSpend);
  if (!spend || !cap) throw new Error("INVALID_AMOUNT_OR_MAX_SPEND");
  if (spend.units > cap.units) throw new Error("SPEND_CAP_EXCEEDED");
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

/** No shell is used. Only known read-only status and quote commands are allowed. */
export async function runBawJson(args, {
  exec = execFileAsync,
  binary = "baw",
  timeoutMs = 15_000
} = {}) {
  if (!Array.isArray(args) || args.some((item) => typeof item !== "string")) {
    throw new Error("INVALID_BAW_ARGUMENTS");
  }
  const walletRead = args[0] === "wallet" &&
    ["status", "chains", "address", "balance"].includes(args[1]) &&
    args.length === 3 && args[2] === "--json";
  const quoteAmount = args[3] === undefined ? null : amountValue(args[3]);
  const quoteTokenIn = String(args[5] ?? "").toLowerCase();
  const quoteTokenOut = String(args[7] ?? "");
  const marketQuote = args.length === 11 &&
    args[0] === "market-order" && args[1] === "quote" &&
    args[2] === "--fromTokenQty" && quoteAmount !== null &&
    args[4] === "--fromToken" && quoteTokenIn === BSC_USDT.toLowerCase() &&
    args[6] === "--toToken" && ADDRESS_RE.test(quoteTokenOut) &&
    quoteTokenOut.toLowerCase() !== BSC_USDT.toLowerCase() &&
    args[8] === "--binanceChainId" && args[9] === String(BSC_CHAIN_ID) &&
    args[10] === "--json";
  if (!walletRead && !marketQuote) throw new Error("BAW_COMMAND_NOT_ALLOWLISTED");
  try {
    const result = await exec(binary, args, {
      timeout: timeoutMs,
      maxBuffer: 512 * 1024,
      windowsHide: true
    });
    const stdout = String(result?.stdout ?? "").trim();
    if (!stdout) throw new Error("BAW_EMPTY_RESPONSE");
    try { return JSON.parse(stdout); }
    catch { throw new Error("BAW_INVALID_JSON_RESPONSE"); }
  } catch (error) {
    if (/^BAW_[A-Z_]+$/.test(String(error?.message ?? ""))) throw error;
    if (String(error?.code ?? "") === "ENOENT") throw new Error("BAW_NOT_INSTALLED");
    if (String(error?.code ?? "") === "ETIMEDOUT" ||
        String(error?.code ?? "") === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      throw new Error("BAW_COMMAND_TIMEOUT_OR_OUTPUT_LIMIT");
    }
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

export async function quoteWithAgenticWallet({
  ticker, amount, maxSpend, apiBase = process.env.PRONOUS_API_URL || "https://pronous.vercel.app",
  fetchImpl = fetch, run = runBawJson
} = {}) {
  const spend = amountValue(amount);
  const cap = amountValue(maxSpend);
  if (!spend || !cap) throw new Error("INVALID_AMOUNT_OR_MAX_SPEND");
  if (spend.units > cap.units) throw new Error("SPEND_CAP_EXCEEDED");
  const symbol = String(ticker ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,20}$/.test(symbol)) throw new Error("INVALID_TICKER");

  const scanUrl = new URL("/api/agent", apiBase);
  scanUrl.searchParams.set("action", "scan");
  scanUrl.searchParams.set("ticker", symbol);
  const scan = await getJson(scanUrl, fetchImpl);
  const asset = scan?.asset;
  if (scan?.mode !== "live-data") throw new Error("LIVE_RWA_DATA_NOT_VERIFIED");
  if (!asset || !SUPPORTED_PLATFORMS.has(String(asset.platformId ?? "").toLowerCase())) {
    throw new Error("UNSUPPORTED_RWA_PLATFORM");
  }
  const tokenAddress = String(asset.tokenContractAddress ?? "");
  if (!ADDRESS_RE.test(tokenAddress)) throw new Error("INVALID_RWA_TOKEN_ADDRESS");
  const tokenPrice = Number(asset.tokenPrice);
  const referencePrice = Number(asset.referencePrice);
  const shareRatio = Number(asset.shareRatio ?? asset.tokenToShareRatio);
  if (asset.dataQuality !== "ok" ||
      !Number.isFinite(tokenPrice) || tokenPrice <= 0 ||
      !Number.isFinite(referencePrice) || referencePrice <= 0 ||
      !Number.isFinite(shareRatio) || shareRatio <= 0) {
    throw new Error("INVALID_OR_MISSING_PRICE_RATIO");
  }
  const marketStatus = String(asset.marketStatus ?? "").trim();
  if (/closed|off.?hours|pre.?market|post.?market|after.?hours|overnight|extended.?hours|no.?trading/i.test(marketStatus) ||
      scan?.market?.referenceStale === true || asset.openState === false ||
      String(asset.openState ?? "").toLowerCase() === "false") {
    throw new Error("UNDERLYING_MARKET_CLOSED");
  }
  if (!/^(open|trading|market[ _]open|regular|regular[ _]session)$/i.test(marketStatus)) {
    throw new Error("MARKET_HOURS_NOT_CONFIRMED");
  }

  const preflightUrl = new URL("/api/agent", apiBase);
  preflightUrl.searchParams.set("action", "preflight");
  preflightUrl.searchParams.set("ticker", symbol);
  preflightUrl.searchParams.set("amount", spend.text);
  preflightUrl.searchParams.set("maxSpend", cap.text);
  const preflight = await getJson(preflightUrl, fetchImpl);
  if (preflight?.preflight?.warning === "ACK_REQUIRED") throw new Error("OFF_HOURS_ACK_REQUIRED");
  if (preflight?.preflight?.status !== "READY_FOR_SIMULATION") throw new Error("PRONOUS_PREFLIGHT_BLOCKED");

  const walletQuote = await run(buildAgenticWalletQuoteArgs({
    amount: spend.text, maxSpend: cap.text, tokenAddress, chainId: BSC_CHAIN_ID
  }));
  return {
    agent: "PRONOUS",
    mode: "agentic-wallet-quote-only",
    ticker: symbol,
    source: "Binance Agentic Wallet CLI (baw)",
    market: {
      platform: asset.platformId,
      tokenSymbol: asset.tokenSymbol ?? null,
      tokenAddress,
      tokenPrice: Number(asset.tokenPrice),
      referencePrice: Number(asset.referencePrice),
      shareRatio: Number(asset.shareRatio ?? asset.tokenToShareRatio),
      adjustedSpreadPct: asset.adjustedSpreadPct ?? null,
      marketStatus: asset.marketStatus ?? null,
      quoteAmountUSDT: spend.text,
      maxSpendUSDT: cap.text,
      preflight: preflight.preflight
    },
    walletQuote,
    note: "Quote preview only. This is not an order, fill, or profit guarantee. No transaction was signed or broadcast.",
    execution: { quoteOnly: true, broadcast: false, tradeExecuted: false, chainId: BSC_CHAIN_ID }
  };
}
