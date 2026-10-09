const { assessQuote, isSupportedPlatform } = require("../lib/market");
const { getPancakeQuote } = require("../lib/pancakeswap-quote");
const { buildGuardChecks, preflightStatus, validateSpendCap } = require("../lib/policy");
const { guardRequest, isAddress, isAmount, safeError } = require("../lib/http-policy");
const { buildQuoteParams, buildSwapParams } = require("../lib/execution");
const { signedGet, normalizeCredential, publicKeyFingerprint } = require("../lib/binance-web3");

const LIVE_ENABLED = Boolean((process.env.BINANCE_WEB3_API_KEY || "").trim() && (process.env.BINANCE_WEB3_API_SECRET || "").trim());

const AGENT_ALLOWED_ORIGIN = String(
  process.env.ALLOWED_ORIGIN || process.env.APP_ORIGIN || "https://pronous.vercel.app"
).trim().replace(/\/$/, "");

function requireAgentOrigin(req, res) {
  const origin = String(req.headers?.origin || "").trim().replace(/\/$/, "");
  if (origin === AGENT_ALLOWED_ORIGIN) return true;

  // Same-origin GET/fetch requests may omit the Origin header on some browsers/webviews.
  // Accept an explicit Fetch Metadata same-origin signal or an exact production Referer.
  const fetchSite = String(req.headers?.["sec-fetch-site"] || "").trim().toLowerCase();
  if (!origin && fetchSite === "same-origin") return true;

  const referer = String(req.headers?.referer || "").trim();
  if (!origin && referer) {
    try {
      const ref = new URL(referer);
      if (ref.origin === AGENT_ALLOWED_ORIGIN) return true;
    } catch (_) {}
  }

  res.status(403).json({ error: "FORBIDDEN_ORIGIN" });
  return false;
}

function requireAgentGet(req, res) {
  if (req.method === "GET") return true;
  res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  return false;
}

async function binanceGet(path, params = {}) {
  return signedGet(path, params);
}

const demoAssets = [
  ["NVDA","NVIDIA","181.20"],["AAPL","Apple","252.40"],["TSLA","Tesla","431.70"],
  ["MSFT","Microsoft","512.30"],["AMZN","Amazon","226.90"],["GOOGL","Alphabet","251.80"],
  ["META","Meta","744.10"],["NFLX","Netflix","1,238.00"],["AMD","AMD","162.50"],
  ["AVGO","Broadcom","366.20"],["MSTR","Strategy","342.80"],["COIN","Coinbase","324.60"]
];

function demoAsset(ticker) {
  const row = demoAssets.find(x => x[0] === ticker) || ["CUSTOM","Tokenized Asset","100.00"];
  const referencePrice = Number(String(row[2]).replace(",",""));
  const tokenPrice = Number((referencePrice * 1.008).toFixed(4));
  return {
    demo:true,ticker:row[0],companyName:row[1],platformId:"demo",
    tokenSymbol:row[0]+"on",tokenPrice:String(tokenPrice),
    referencePrice:String(referencePrice),
    rawSpreadPct:Number(((tokenPrice/referencePrice-1)*100).toFixed(3)),
    adjustedSpreadPct:null,spreadPct:null,shareRatio:null,tokenToShareRatio:null,
    dataQuality:"missing_ratio",actionable:false,marketStatus:"demo",openState:null
  };
}

function buildPreflight(asset, params={}) {
  const amount=Number(params.amount||0);
  const maxSpend=Number(params.maxSpend||100);
  const checks=buildGuardChecks(asset,{amount,maxSpend});
  return {
    status:preflightStatus(checks),
    amount,
    maxSpend,
    spreadPct:asset.adjustedSpreadPct ?? null,
    rawSpreadPct:asset.rawSpreadPct ?? null,
    adjustedSpreadPct:asset.adjustedSpreadPct ?? null,
    shareRatio:asset.shareRatio ?? asset.tokenToShareRatio ?? null,
    checks,
    next:checks.find(x=>!x.pass)?.id||"simulation"
  };
}

function evaluateLoop(asset, opts={}) {
  const spread=Number(asset.adjustedSpreadPct ?? asset.spreadPct ?? 0);
  const minSpread=Number(opts.minSpread||1);
  const fresh=opts.fresh!==false;
  const checks=[
    {name:"asset_data",pass:Boolean(asset.ticker&&asset.tokenPrice&&asset.referencePrice),reason:"token and reference price required"},
    {name:"spot_only",pass:true,reason:"perpetuals/leverage are excluded"},
    {name:"bsc_mainnet",pass:true,reason:"execution target is BSC mainnet"},
    {name:"fresh_data",pass:fresh,reason:"stale market data blocks execution"},
    {name:"share_ratio",pass:Number.isFinite(Number(asset.shareRatio ?? asset.tokenToShareRatio))&&Number(asset.shareRatio ?? asset.tokenToShareRatio)>0,reason:"valid token-to-share ratio is required"},
    {name:"data_quality",pass:asset.dataQuality==="ok",reason:"only a valid ratio-adjusted spread with acceptable quality is eligible"},
    {name:"spread_threshold",pass:Math.abs(spread)>=minSpread,reason:"gap below configured threshold"},
    {name:"simulation_required",pass:Boolean(opts.simulated),reason:"simulation must pass before broadcast"},
    {name:"confirmation_required",pass:Boolean(opts.confirmed),reason:"user confirmation is required for live execution"}
  ];
  const blocked=checks.filter(x=>!x.pass);
  return {status:blocked.length?"BLOCK":"READY",checks,blocked,signal:asset.dataQuality==="missing_ratio"?"MISSING_RATIO":asset.dataQuality!=="ok"?"UNRELIABLE":Math.abs(spread)>=minSpread?(spread>0?"PREMIUM":"DISCOUNT"):"OBSERVE",next:blocked.length?blocked[0].name:"EXECUTE"};
}

function makePlan(asset) {
  const spread = Number(asset.adjustedSpreadPct ?? asset.spreadPct ?? 0);
  let action = "HOLD / OBSERVE";
  if (asset.dataQuality === "missing_ratio") action = "BLOCK — MISSING SHARE RATIO";
  else if (asset.dataQuality !== "ok") action = "HOLD — DATA QUALITY REVIEW";
  else if (spread > 1) action = "WATCH PREMIUM";
  else if (spread < -1) action = "WATCH DISCOUNT";
  return {action,rationale:"Plan uses the ratio-adjusted token/reference spread; raw price difference is not a market signal.",spreadPct:asset.adjustedSpreadPct??null,adjustedSpreadPct:asset.adjustedSpreadPct??null,rawSpreadPct:asset.rawSpreadPct??null,shareRatio:asset.shareRatio??asset.tokenToShareRatio??null,
    guardrails:["spot only","BSC mainnet only","simulate before broadcast","spend cap required","ondo/bstock/xstocks only"]};
}

async function liveAssets() {
  const data = await binanceGet("/api/v1/dex/market/rwa/tokens",{binanceChainId:"56"});
  return (data.data || [])
    .filter(x => x.underlyingTicker && x.tokenContractAddress && isSupportedPlatform(x.platformId))
    .map(x => {
      const quality = assessQuote(x.tokenPrice, x.referencePrice, x.tokenToShareRatio);
      return {
        ticker:x.underlyingTicker,
        companyName:x.underlyingName || x.tokenName || "",
        platformId:x.platformId || "unknown",
        tokenSymbol:x.tokenSymbol || "",
        tokenContractAddress:x.tokenContractAddress,
        tokenPrice:x.tokenPrice ?? null,
        referencePrice:x.referencePrice ?? null,
        rawSpreadPct:quality.rawSpreadPct,
        adjustedSpreadPct:quality.adjustedSpreadPct,
        spreadPct:quality.adjustedSpreadPct,
        shareRatio:quality.shareRatio,
        dataQuality:quality.dataQuality,
        actionable:quality.actionable,
        marketStatus:x.statusInfo?.marketStatus || null,
        openState:x.statusInfo?.openState ?? null,
        nextOpenTime:x.statusInfo?.nextOpenTime ?? null,
        nextCloseTime:x.statusInfo?.nextCloseTime ?? null,
        volume24H:x.volume24H ?? null,
        marketCap:x.marketCap ?? null,
        tokenToShareRatio:x.tokenToShareRatio ?? null
      };
    });
}

async function findLiveAsset(ticker) {
  const data = await binanceGet("/api/v1/dex/market/rwa/search",{keyword:ticker});
  const candidates=(data.data||[]).flatMap(x=>(x.assets||[]).map(a=>({...x,...a})));
  const asset=candidates.find(x=>isSupportedPlatform(x.platformId));
  if(!asset) throw Object.assign(new Error("SUPPORTED_TOKEN_NOT_FOUND"),{status:404});
  const price = await binanceGet("/api/v1/dex/market/rwa/price",{
    binanceChainId:"56",
    tokenContractAddresses:asset.tokenContractAddress
  });
  const quote=price.data?.[0]||{};
  let market={};
  try {
    const m=await binanceGet("/api/v1/dex/market/rwa/underlying-market",{
      binanceChainId:"56",tokenContractAddress:asset.tokenContractAddress
    });
    market=m.data||{};
  } catch (_) {}
  const tokenPrice=Number(quote.tokenPrice||0), referencePrice=Number(quote.referencePrice||0);
  const shareRatio=quote.tokenToShareRatio ?? asset.tokenToShareRatio ?? asset.shareRatio ?? null;
  const quality=assessQuote(tokenPrice, referencePrice, shareRatio);
  return {demo:false,ticker:asset.ticker||ticker,companyName:asset.companyName||asset.underlyingName,
    platformId:asset.platformId,tokenSymbol:asset.tokenSymbol,tokenContractAddress:asset.tokenContractAddress,
    tokenPrice:String(tokenPrice),referencePrice:String(referencePrice),
    rawSpreadPct:quality.rawSpreadPct,adjustedSpreadPct:quality.adjustedSpreadPct,
    spreadPct:quality.adjustedSpreadPct,shareRatio:quality.shareRatio,
    tokenToShareRatio:shareRatio,dataQuality:quality.dataQuality,actionable:quality.actionable,
    marketStatus:market.statusInfo?.marketStatus||null,openState:market.statusInfo?.openState??null,
    nextOpenTime:market.statusInfo?.nextOpenTime??null,nextCloseTime:market.statusInfo?.nextCloseTime??null};
}


function rpcHex(value) {
  if (value == null || value === "") return undefined;
  const s = String(value);
  if (/^0x[0-9a-fA-F]+$/.test(s)) return s;
  if (/^\d+$/.test(s)) return "0x" + BigInt(s).toString(16);
  throw new Error("INVALID_RPC_NUMERIC_VALUE");
}

async function simulateEvmTransaction(evmTx = {}) {
  const rpcUrl = String(process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org").trim();
  let rpc;
  try {
    const parsed = new URL(rpcUrl);
    const allowed = new Set(String(process.env.BSC_RPC_ALLOWED_HOSTS || "bsc-dataseed.binance.org").split(",").map(x => x.trim().toLowerCase()).filter(Boolean));
    if (parsed.protocol !== "https:" || !allowed.has(parsed.hostname.toLowerCase())) throw new Error("BSC_RPC_HOST_NOT_ALLOWED");
  } catch (e) {
    const err = new Error("INVALID_BSC_RPC_URL");
    err.status = 500;
    throw err;
  }
  const tx = {
    from: evmTx.from,
    to: evmTx.to,
    data: evmTx.data || evmTx.input,
    value: rpcHex(evmTx.value),
    gas: rpcHex(evmTx.gas || evmTx.gasLimit),
    gasPrice: rpcHex(evmTx.gasPrice || evmTx.maxFeePerGas)
  };
  Object.keys(tx).forEach(k => {
    if (tx[k] === undefined || tx[k] === null || tx[k] === "") delete tx[k];
  });
  if (!tx.to && !tx.data) throw new Error("SIMULATION_TX_TARGET_REQUIRED");
  if (tx.from && !/^0x[a-fA-F0-9]{40}$/.test(tx.from)) throw new Error("INVALID_SIMULATION_FROM");
  if (tx.to && !/^0x[a-fA-F0-9]{40}$/.test(tx.to)) throw new Error("INVALID_SIMULATION_TO");
  rpc = await fetch(rpcUrl, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:Date.now(),method:"eth_call",params:[tx,"latest"]}),
    signal: AbortSignal.timeout(Number(process.env.BSC_RPC_TIMEOUT_MS) || 8000)
  });
  const contentType = String(rpc.headers?.get?.("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) throw new Error("BSC_RPC_NON_JSON");
  const body = await rpc.json();
  if (!rpc.ok || body.error) {
    const e = new Error(body.error?.message || "BSC eth_call simulation failed");
    e.rpcCode = body.error?.code ?? null;
    throw e;
  }
  return {
    status:"PASSED",
    method:"eth_call",
    chainId:56,
    block:"latest",
    result:body.result,
    broadcast:false
  };
}

module.exports = async function handler(req,res) {
  if (!guardRequest(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  try {
    const url=new URL(req.url,"http://localhost");
    const action=url.searchParams.get("action")||"scan";
    if (!requireAgentGet(req, res)) return;
    if (["quote", "quoteBuild", "build", "simulateTx", "pancakeQuote"].includes(action) && !requireAgentOrigin(req, res)) return;
    const ticker=(url.searchParams.get("ticker")||"NVDA").trim().toUpperCase();
    if(!/^[A-Z0-9.-]{1,20}$/.test(ticker)) return res.status(400).json({error:"Invalid ticker"});

    if(action==="authcheck") {
      const algorithm = String(process.env.BINANCE_WEB3_SIGN_ALGO || "HMAC_SHA256").trim().toUpperCase();
      const fingerprint = algorithm === "ED25519" && process.env.BINANCE_WEB3_API_SECRET
        ? publicKeyFingerprint(normalizeCredential(process.env.BINANCE_WEB3_API_SECRET))
        : null;
      const data = await binanceGet("/api/v1/dex/balance/supported/chain",{binanceChainId:"56"});
      return res.status(200).json({
        mode:"live-auth-ok",
        network:"BSC",
        algorithm,
        publicKeyFingerprint:fingerprint,
        supported:data.data||[],
        timestamp:data.timestamp
      });
    }

    if(action==="assets" || action==="radar") {
      if(LIVE_ENABLED) {
        try {
          const assets=await liveAssets();
          if(assets.length) {
            const summary={
              total:assets.length,
              ondo:assets.filter(x=>x.platformId==="ondo").length,
              bstock:assets.filter(x=>x.platformId==="bstock").length,
              xstocks:assets.filter(x=>x.platformId==="xstocks").length,
              actionable:assets.filter(x=>x.actionable).length,
              unreliable:assets.filter(x=>x.dataQuality==="unreliable").length,
              missingRatio:assets.filter(x=>x.dataQuality==="missing_ratio").length
            };
            const rows=action==="radar"
              ? assets.filter(x=>x.actionable).sort((a,b)=>Math.abs(b.adjustedSpreadPct||0)-Math.abs(a.adjustedSpreadPct||0)).slice(0,20)
              : assets;
            return res.status(200).json({mode:"live-data",network:"BSC",updatedAt:Date.now(),spotOnly:true,summary,assets:rows});
          }
        } catch (e) {
          return res.status(e.status||502).json({mode:"live-error",network:"BSC",error:e.message||"Live RWA data unavailable",details:undefined,authDebug:undefined});
        }
      }
      return res.status(200).json({mode:"demo",network:"BSC",updatedAt:Date.now(),assets:demoAssets.map(x=>demoAsset(x[0]))});
    }

    const asset=LIVE_ENABLED?await findLiveAsset(ticker):demoAsset(ticker);
    if(action==="pancakeQuote") {
      const input={
        fromTokenAddress:String(url.searchParams.get("fromTokenAddress")||"").trim(),
        toTokenAddress:String(url.searchParams.get("toTokenAddress")||"").trim(),
        amount:String(url.searchParams.get("amount")||"").trim(),
        maxSpend:String(url.searchParams.get("maxSpend")||"").trim()
      };
      if(!isAmount(input.amount) || !isAmount(input.maxSpend))
        return res.status(400).json({error:"INVALID_AMOUNT_OR_MAX_SPEND",broadcast:false});
      const spend=validateSpendCap(input.amount,input.maxSpend);
      if(!spend.ok) return res.status(400).json({error:spend.error,broadcast:false});
      if(!isAddress(input.fromTokenAddress))
        return res.status(400).json({error:"INVALID_FROM_TOKEN_ADDRESS",broadcast:false});
      if(!isAddress(input.toTokenAddress))
        return res.status(400).json({error:"INVALID_TO_TOKEN_ADDRESS",broadcast:false});
      if(!LIVE_ENABLED) return res.status(200).json({
        mode:"demo",network:"BSC",status:"PANCAKESWAP_QUOTE_REQUIRES_LIVE_API",
        ticker,broadcast:false,calldataAvailable:false
      });
      if(!asset.tokenContractAddress)
        return res.status(409).json({error:"SUPPORTED_RWA_TOKEN_ADDRESS_REQUIRED",broadcast:false});
      try {
        const quote=await getPancakeQuote({
          assetAddress:asset.tokenContractAddress,
          tokenInAddress:input.fromTokenAddress,
          tokenOutAddress:input.toTokenAddress,
          amount:input.amount
        });
        return res.status(200).json({
          mode:"live-pancakeswap-quote",network:"BSC",ticker,
          asset:{ticker:asset.ticker,platformId:asset.platformId,tokenSymbol:asset.tokenSymbol,
            tokenContractAddress:asset.tokenContractAddress},
          quote,broadcast:false,
          next:"Quote preview only. PancakeSwap calldata, signing and execution are not enabled."
        });
      } catch(e) {
        return res.status(e.status||502).json({
          mode:"pancakeswap-quote-error",error:e.code||"PANCAKESWAP_QUOTE_FAILED",
          broadcast:false,calldataAvailable:false
        });
      }
    }
    if(action==="quote") {
      const input={fromTokenAddress:url.searchParams.get("fromTokenAddress"),toTokenAddress:url.searchParams.get("toTokenAddress")||asset.tokenContractAddress,amount:url.searchParams.get("amount"),userWalletAddress:url.searchParams.get("userWalletAddress")};
      const built=buildQuoteParams(input);
      if(!built.ok) return res.status(400).json({error:built.error||"Invalid quote intent",missing:built.missing});
      if(!LIVE_ENABLED) return res.status(200).json({mode:"demo",status:"QUOTE_REQUIRES_LIVE_API",ticker,asset,intent:built.params});
      const quote=await binanceGet("/api/v1/dex/aggregator/quote",built.params);
      return res.status(200).json({mode:"live-quote",network:"BSC",ticker,asset,quote,broadcast:false});
    }

    if(action==="quoteBuild") {
      const input={
        fromTokenAddress:url.searchParams.get("fromTokenAddress"),
        toTokenAddress:url.searchParams.get("toTokenAddress")||asset.tokenContractAddress,
        amount:url.searchParams.get("amount"),
        userWalletAddress:url.searchParams.get("userWalletAddress")
      };
      const maxSpend=url.searchParams.get("maxSpend");
      if(!isAmount(input.amount) || !isAmount(maxSpend)) return res.status(400).json({error:"Invalid amount or maxSpend"});
      const spend=validateSpendCap(input.amount, maxSpend);
      if(!spend.ok) return res.status(400).json({error:spend.error});

      const preflight=buildPreflight(asset,{
        amount:input.amount,
        maxSpend
      });
      if(preflight.status!=="READY_FOR_SIMULATION"){
        return res.status(409).json({
          error:"PRE_FLIGHT_BLOCKED",
          preflight
        });
      }

      if(input.fromTokenAddress && !isAddress(input.fromTokenAddress)) return res.status(400).json({error:"Invalid fromTokenAddress"});
      if(input.toTokenAddress && !isAddress(input.toTokenAddress)) return res.status(400).json({error:"Invalid toTokenAddress"});
      if(input.userWalletAddress && !isAddress(input.userWalletAddress)) return res.status(400).json({error:"Invalid userWalletAddress"});
      const built=buildQuoteParams(input);
      if(!built.ok) return res.status(400).json({error:built.error||"Invalid quote intent",missing:built.missing});
      const vendor=String(url.searchParams.get("vendor")||"LiquidMesh").trim();
      const flashParams={
        ...built.params,
        userWalletAddress:String(input.userWalletAddress||"").trim(),
        maxSpend:String(maxSpend).trim(),
        vendor,
        slippagePercent:String(url.searchParams.get("slippagePercent")||"0.5"),
        approveTransaction:String(url.searchParams.get("approveTransaction")||"false")
      };
      if(!flashParams.userWalletAddress) return res.status(400).json({error:"Invalid quote/build intent",missing:["userWalletAddress"]});
      if(!LIVE_ENABLED) return res.status(200).json({mode:"demo",status:"QUOTE_BUILD_REQUIRES_LIVE_API",ticker,asset,intent:flashParams,broadcast:false});
      const swap=await binanceGet("/api/v1/dex/aggregator/quote-and-swap",flashParams);
      return res.status(200).json({
        mode:"live-quote-build",
        network:"BSC",
        ticker,
        asset,
        built:swap,
        broadcast:false,
        next:"Simulation and user wallet confirmation required before broadcast."
      });
    }

    if(action==="build") {
      const input={fromTokenAddress:url.searchParams.get("fromTokenAddress"),toTokenAddress:url.searchParams.get("toTokenAddress"),amount:url.searchParams.get("amount"),userWalletAddress:url.searchParams.get("userWalletAddress"),quoteId:url.searchParams.get("quoteId"),slippagePercent:url.searchParams.get("slippagePercent"),approveTransaction:url.searchParams.get("approveTransaction")};
      if(!isAmount(input.amount)) return res.status(400).json({error:"Invalid amount"});
      if(input.fromTokenAddress && !isAddress(input.fromTokenAddress)) return res.status(400).json({error:"Invalid fromTokenAddress"});
      if(input.toTokenAddress && !isAddress(input.toTokenAddress)) return res.status(400).json({error:"Invalid toTokenAddress"});
      if(input.userWalletAddress && !isAddress(input.userWalletAddress)) return res.status(400).json({error:"Invalid userWalletAddress"});
      const built=buildSwapParams(input);
      if(!built.ok) return res.status(400).json({error:"Invalid swap intent",missing:built.missing});
      if(!LIVE_ENABLED) return res.status(200).json({mode:"demo",status:"BUILD_REQUIRES_LIVE_API",ticker,asset,intent:built.params,broadcast:false});
      const swap=await binanceGet("/api/v1/dex/aggregator/swap",built.params);
      return res.status(200).json({mode:"live-build",network:"BSC",ticker,asset,built:swap,broadcast:false,next:"Client wallet signature required before broadcast."});
    }

    if(action==="simulateTx") {
      const raw=url.searchParams.get("evmTx");
      const userWalletAddress=String(url.searchParams.get("userWalletAddress")||"").trim();
      if(!isAddress(userWalletAddress)) return res.status(400).json({error:"userWalletAddress is required for simulation"});
      if(!raw) return res.status(400).json({error:"evmTx JSON query parameter is required"});
      let evmTx;
      try { evmTx=JSON.parse(raw); } catch (_) { return res.status(400).json({error:"Invalid evmTx JSON"}); }
      if(!evmTx || typeof evmTx!=="object" || Array.isArray(evmTx))
        return res.status(400).json({error:"Invalid simulation transaction"});
      if(evmTx.from && !isAddress(evmTx.from))
        return res.status(400).json({error:"Simulation transaction has an invalid from address"});
      if(evmTx.from && evmTx.from.toLowerCase()!==userWalletAddress.toLowerCase())
        return res.status(403).json({error:"Simulation wallet mismatch"});
      const simulationTx={...evmTx,from:userWalletAddress};

      try {
        const simulation=await simulateEvmTransaction(simulationTx);
        return res.status(200).json({network:"BSC",chainId:56,ticker,evmTx,simulation});
      } catch(e) {
        return res.status(422).json({network:"BSC",chainId:56,ticker,broadcast:false,status:"FAILED",reason:e.message,code:e.rpcCode||null});
      }
    }

    if(action==="scan") {
      const spread=Number(asset.adjustedSpreadPct ?? asset.spreadPct ?? 0);
      const signal = asset.dataQuality==="missing_ratio"
        ? "MISSING_RATIO"
        : asset.dataQuality!=="ok"
          ? "UNRELIABLE"
          : Math.abs(spread)>=1
            ? (spread>0 ? "PREMIUM" : "DISCOUNT")
            : "OBSERVE";
      const risk = asset.dataQuality==="missing_ratio"
        ? "MISSING_SHARE_RATIO"
        : asset.dataQuality!=="ok"
          ? "HIGH_DATA_QUALITY_RISK"
          : Math.abs(spread)>=1
            ? "SPREAD_REQUIRES_REVIEW"
            : "NORMAL_OBSERVATION";
      const execution = {
        broadcast:false,
        simulationRequired:true,
        confirmationRequired:true,
        spotOnly:true,
        network:"BSC"
      };
      return res.status(200).json({
        agent:"PRONOUS",
        action:"scan",
        mode:asset.demo?"demo":"live-data",
        network:"BSC",
        ticker,
        scannedAt:new Date().toISOString(),
        asset,
        market:{
          tokenPrice:asset.tokenPrice,
          referencePrice:asset.referencePrice,
          spreadPct:asset.adjustedSpreadPct ?? null,
          rawSpreadPct:asset.rawSpreadPct ?? null,
          adjustedSpreadPct:asset.adjustedSpreadPct ?? null,
          shareRatio:asset.shareRatio ?? asset.tokenToShareRatio ?? null,
          dataQuality:asset.dataQuality||"demo",
          actionable:asset.actionable??false,
          marketStatus:asset.marketStatus??null,
          openState:asset.openState??null,
          nextOpenTime:asset.nextOpenTime??null,
          nextCloseTime:asset.nextCloseTime??null
        },
        signal:{
          type:signal,
          spreadPct:asset.adjustedSpreadPct ?? null,
          actionable:asset.dataQuality==="ok"&&(signal==="PREMIUM"||signal==="DISCOUNT")
        },
        risk:{
          status:risk,
          dataQuality:asset.dataQuality||"demo"
        },
        plan:makePlan(asset),
        execution,
        next:"Run simulation before any wallet execution."
      });
    }

    if(action==="preflight") {
      const amount=url.searchParams.get("amount")||"0";
      const maxSpend=url.searchParams.get("maxSpend")||"100";
      if(!isAmount(amount) || !isAmount(maxSpend)) return res.status(400).json({error:"Invalid amount or maxSpend"});
      const spend=validateSpendCap(amount,maxSpend);
      if(!spend.ok) return res.status(400).json({error:spend.error});
      return res.status(200).json({agent:"PRONOUS",mode:asset.demo?"demo":"live-data",ticker,asset,preflight:buildPreflight(asset,{amount,maxSpend}),broadcast:false});
    }
    if(action==="loop") {
      const simulated=url.searchParams.get("simulated")==="true";
      const confirmed=url.searchParams.get("confirmed")==="true";
      return res.status(200).json({agent:"PRONOUS",mode:asset.demo?"demo":"live-data",ticker,asset,plan:makePlan(asset),loop:evaluateLoop(asset,{simulated,confirmed}),broadcast:false});
    }
    if(action==="simulate") return res.status(200).json({mode:asset.demo?"demo":"live-dry-run",simulationMode:"DRY_RUN",ticker,asset,plan:makePlan(asset),simulated:true,broadcast:false,next:"No blockchain transaction was sent. Build a transaction and run a chain-level simulation before live execution."});
    return res.status(200).json({agent:"PRONOUS",mode:asset.demo?"demo":"live-data",asset,plan:makePlan(asset),next:"Run simulation before any wallet execution."});
  } catch(e) {
    return safeError(res, Number(e.status) >= 400 ? Number(e.status) : 500, "AGENT_REQUEST_FAILED");
  }
};
