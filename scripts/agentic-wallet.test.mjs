import test from "node:test";
import assert from "node:assert/strict";
import {
  BSC_USDT,
  buildAgenticWalletQuoteArgs,
  runBawJson,
  readAgenticWalletStatus
} from "../mcp/agentic-wallet.mjs";

const TOKEN = "0x1234567890123456789012345678901234567890";

test("Agentic Wallet quote is pinned to BSC mainnet USDT and RWA token", () => {
  assert.deepEqual(buildAgenticWalletQuoteArgs({
    amount: "1.25", maxSpend: "2", tokenAddress: TOKEN, chainId: 56
  }), [
    "market-order", "quote", "--fromTokenQty", "1.25",
    "--fromToken", BSC_USDT, "--toToken", TOKEN,
    "--binanceChainId", "56", "--json"
  ]);
});

test("Agentic Wallet quote rejects values above the caller's spend cap", () => {
  assert.throws(() => buildAgenticWalletQuoteArgs({
    amount: "2.01", maxSpend: "2", tokenAddress: TOKEN
  }), /SPEND_CAP_EXCEEDED/);
});

test("Agentic Wallet quote refuses non-BSC chain or invalid token", () => {
  assert.throws(() => buildAgenticWalletQuoteArgs({
    amount: "1", maxSpend: "2", tokenAddress: TOKEN, chainId: 97
  }), /BSC_MAINNET_ONLY/);
  assert.throws(() => buildAgenticWalletQuoteArgs({
    amount: "1", maxSpend: "2", tokenAddress: "not-an-address"
  }), /INVALID_TOKEN_ADDRESS/);
});

test("baw command wrapper refuses mutating swap commands", async () => {
  await assert.rejects(
    runBawJson(["market-order", "swap", "--json"], { exec: async () => ({ stdout: "{}" }) }),
    /BAW_COMMAND_NOT_ALLOWLISTED/
  );
});

test("baw command wrapper parses only JSON output", async () => {
  const output = await runBawJson(["wallet", "status", "--json"], {
    exec: async () => ({ stdout: "{\"connected\":true}" })
  });
  assert.deepEqual(output, { connected: true });
  await assert.rejects(
    runBawJson(["wallet", "status", "--json"], {
      exec: async () => ({ stdout: "connected yes" })
    }),
    /BAW_INVALID_JSON_RESPONSE/
  );
});

test("wallet status reports read-only and no broadcast", async () => {
  const report = await readAgenticWalletStatus({
    run: async (args) => ({ command: args[1], ok: true })
  });
  assert.equal(report.mode, "read-only");
  assert.equal(report.execution.broadcast, false);
  assert.equal(report.execution.quoteOnly, true);
  assert.deepEqual(Object.keys(report.checks).sort(), ["address", "balance", "chains", "status"]);
});
