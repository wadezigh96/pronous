import test from "node:test";
import assert from "node:assert/strict";
import {
  BSC_USDT,
  buildAgenticWalletQuoteArgs,
  runBawJson,
  readAgenticWalletStatus,
  quoteWithAgenticWallet
} from "../mcp/agentic-wallet.mjs";

const TOKEN = "0x1234567890123456789012345678901234567890";

test("quote uses BSC mainnet USDT and the exact RWA address", () => {
  assert.deepEqual(buildAgenticWalletQuoteArgs({
    amount: "1.25", maxSpend: "2", tokenAddress: TOKEN, chainId: 56
  }), [
    "market-order", "quote", "--fromTokenQty", "1.25",
    "--fromToken", BSC_USDT, "--toToken", TOKEN,
    "--binanceChainId", "56", "--json"
  ]);
});

test("quote rejects amount over cap, wrong chain, bad token, and non-decimal input", () => {
  assert.throws(() => buildAgenticWalletQuoteArgs({amount:"2.01",maxSpend:"2",tokenAddress:TOKEN}), /SPEND_CAP_EXCEEDED/);
  assert.throws(() => buildAgenticWalletQuoteArgs({amount:"1",maxSpend:"2",tokenAddress:TOKEN,chainId:97}), /BSC_MAINNET_ONLY/);
  assert.throws(() => buildAgenticWalletQuoteArgs({amount:"1",maxSpend:"2",tokenAddress:"invalid"}), /INVALID_TOKEN_ADDRESS/);
  assert.throws(() => buildAgenticWalletQuoteArgs({amount:"1e3",maxSpend:"2000",tokenAddress:TOKEN}), /INVALID_AMOUNT_OR_MAX_SPEND/);
});

test("baw wrapper rejects commands outside the read-only allowlist", async () => {
  await assert.rejects(runBawJson(["market-order","swap","--json"], {
    exec: async () => ({stdout:"{}"})
  }), /BAW_COMMAND_NOT_ALLOWLISTED/);
});

test("baw wrapper parses JSON and does not accept a prose response", async () => {
  assert.deepEqual(await runBawJson(["wallet","status","--json"], {
    exec: async () => ({stdout:"{\"connected\":true}"})
  }), {connected:true});
  await assert.rejects(runBawJson(["wallet","status","--json"], {
    exec: async () => ({stdout:"connected yes"})
  }), /BAW_INVALID_JSON_RESPONSE/);
});

test("wallet status combines read-only responses and marks broadcast false", async () => {
  const report = await readAgenticWalletStatus({run: async (args) => ({kind:args[1],ok:true})});
  assert.equal(report.mode,"read-only");
  assert.equal(report.execution.broadcast,false);
  assert.deepEqual(Object.keys(report.checks).sort(),["address","balance","chains","status"]);
});

test("quote workflow blocks closed market and requires all live guards before baw", async () => {
  let bawCalls = 0;
  const liveBody = {
    mode:"live-data",
    asset:{
      ticker:"NVDA", platformId:"ondo",
      tokenContractAddress:TOKEN, tokenSymbol:"NVDA",
      tokenPrice:"1.23", referencePrice:"123", shareRatio:"0.01",
      dataQuality:"ok", marketStatus:"open", adjustedSpreadPct:0
    }
  };
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    if (url.searchParams.get("action") === "scan") return Response.json(liveBody);
    return Response.json({preflight:{status:"READY_FOR_SIMULATION",warning:null}});
  };
  const quote = await quoteWithAgenticWallet({
    ticker:"NVDA",amount:"1",maxSpend:"2",fetchImpl,
    run: async (args) => { bawCalls++; return {quoteId:"sample"}; }
  });
  assert.equal(quote.execution.broadcast,false);
  assert.equal(bawCalls,1);

  await assert.rejects(quoteWithAgenticWallet({
    ticker:"NVDA",amount:"1",maxSpend:"2",
    fetchImpl: async (input) => {
      const url=new URL(String(input));
      if (url.searchParams.get("action")==="scan") {
        return Response.json({...liveBody,asset:{...liveBody.asset,marketStatus:"offhours"}});
      }
      return Response.json({preflight:{status:"READY_FOR_SIMULATION"}});
    },
    run: async () => { bawCalls++; return {}; }
  }), /UNDERLYING_MARKET_CLOSED/);
  await assert.rejects(quoteWithAgenticWallet({
    ticker:"NVDA",amount:"1",maxSpend:"2",
    fetchImpl: async (input) => {
      const url=new URL(String(input));
      if (url.searchParams.get("action")==="scan") {
        const { marketStatus, ...withoutStatus } = liveBody.asset;
        return Response.json({...liveBody,asset:withoutStatus});
      }
      return Response.json({preflight:{status:"READY_FOR_SIMULATION"}});
    },
    run: async () => { bawCalls++; return {}; }
  }), /MARKET_HOURS_NOT_CONFIRMED/);
  assert.equal(bawCalls,1);
});
