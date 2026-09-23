const crypto = require("crypto");
const { calculateSpreadPct, normalizeAsset } = require("../lib/market");
const { buildGuardChecks, preflightStatus } = require("../lib/policy");
const { buildQuoteParams, buildSwapParams } = require("../lib/execution");

const BASE = "https://web3.binance.com/build";
const RECV_WINDOW = process.env.BINANCE_WEB3_RECV_WINDOW || "5000";

function signHmac(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("base64");
}

function signedHeaders(method, requestPath, body = "") {
  const apiKey = (process.env.BINANCE_WEB3_API_KEY || "").trim();
  const secret = process.env.BINANCE_WEB3_API_SECRET || "";
  if (!apiKey || !secret) return null;

  // PRONOUS is configured for a Binance Web3 HMAC-SHA256 credential.
  // Binance requires: timestamp + METHOD + requestPath + body.
  const timestamp = new Date().toISOString();
  const normalizedMethod = method.toUpperCase();
  const prehash = timestamp + normalizedMethod + requestPath + body;
  const signature = signHmac(secret, prehash);

  return {
    "X-OC-APIKEY": apiKey,
    "X-OC-TIMESTAMP": timestamp,
    "X-OC-SIGN": signature,
    "X-OC-RECV-WINDOW": RECV_WINDOW
  };
}

async function binanceGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const requestPath = path + (qs ? "?" + qs : "");
  const headers = signedHeaders("GET", requestPath, "");
  if (!headers) throw new Error("LIVE_API_NOT_CONFIGURED");
  const r = await fetch(BASE + requestPath, {headers});
  const data = await r.json();
  if (!r.ok || (data.code !== undefined && data.code !== 0)) {
    const e = new Error(data.msg || "Binance Web3 API error");
    e.status = r.status || 502;
    e.data = data;
    throw e;
  }
  return data;
}

async function binancePost(path, body = {}) {
  const requestBody = JSON.stringify(body);
  const headers = signedHeaders("POST", path, requestBody);
  if (!headers) throw new Error("LIVE_API_NOT_CONFIGURED");
  headers["Content-Type"] = "application/json";
  const r = await fetch(BASE + path, {method:"POST",headers,body:requestBody});
  const data = await r.json();
  if (!r.ok || (data.code !== undefined && data.code !== 0)) {
    const e = new Error(data.msg || "Binance Web3 API error");
    e.status = r.status || 502;
    e.data = data;
    throw e;
  }
  return data;
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
    spreadPct:Number(((tokenPrice/referencePrice-1)*100).toFixed(3)),
    marketStatus:"demo",openState:null
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
    spreadPct:calculateSpreadPct(asset.tokenPrice,asset.referencePrice) ?? Number(asset.spreadPct||0),
    checks,
    next:checks.find(x=>!x.pass)?.id||"simulation"
  };
}

function evaluateLoop(asset, opts={}) {
  const spread=Number(asset.spreadPct||0);
  const minSpread=Number(opts.minSpread||1);
  const fresh=opts.fresh!==false;
  const checks=[
    {name:"asset_data",pass:Boolean(asset.ticker&&asset.tokenPrice&&asset.referencePrice),reason:"token and reference price required"},
    {name:"spot_only",pass:true,reason:"perpetuals/leverage are excluded"},
    {name:"bsc_mainnet",pass:true,reason:"execution target is BSC mainnet"},
    {name:"fresh_data",pass:fresh,reason:"stale market data blocks execution"},
    {name:"spread_threshold",pass:Math.abs(spread)>=minSpread,reason:"gap below configured threshold"},
    {name:"simulation_required",pass:Boolean(opts.simulated),reason:"simulation must pass before broadcast"},
    {name:"confirmation_required",pass:Boolean(opts.confirmed),reason:"user confirmation is required for live execution"}
  ];
  const blocked=checks.filter(x=>!x.pass);
  return {status:blocked.length?"BLOCK":"READY",checks,blocked,signal:Math.abs(spread)>=minSpread?(spread>0?"PREMIUM":"DISCOUNT"):"OBSERVE",next:blocked.length?blocked[0].name:"EXECUTE"};
}

function makePlan(asset) {
  const spread = Number(asset.spreadPct || 0);
  let action = "HOLD / OBSERVE";
  if (spread > 1) action = "WATCH PREMIUM";
  if (spread < -1) action = "WATCH DISCOUNT";
  return {action,rationale:"Plan is based on token-vs-reference spread.",spreadPct:spread,
    guardrails:["spot only","BSC mainnet only","simulate before broadcast","spend cap required","allowlist required"]};
}

async function liveAssets() {
  const data = await binanceGet("/api/v1/dex/market/rwa/tokens",{binanceChainId:"56"});
  return (data.data || [])
    .filter(x => x.underlyingTicker && x.tokenContractAddress)
    .map(x => {
      const tokenPrice = Number(x.tokenPrice || 0);
      const referencePrice = Number(x.referencePrice || 0);
      return {
        ticker:x.underlyingTicker,
        companyName:x.underlyingName || x.tokenName || "",
        platformId:x.platformId || "unknown",
        tokenSymbol:x.tokenSymbol || "",
        tokenContractAddress:x.tokenContractAddress,
        tokenPrice:x.tokenPrice ?? null,
        referencePrice:x.referencePrice ?? null,
        spreadPct:referencePrice ? Number(((tokenPrice / referencePrice - 1) * 100).toFixed(3)) : null,
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
  const asset=candidates.find(x=>["ondo","bstock","xstocks"].includes(x.platformId))||candidates[0];
  if(!asset) throw Object.assign(new Error("TOKEN_NOT_FOUND"),{status:404});
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
  return {demo:false,ticker:asset.ticker||ticker,companyName:asset.companyName||asset.underlyingName,
    platformId:asset.platformId,tokenSymbol:asset.tokenSymbol,tokenContractAddress:asset.tokenContractAddress,
    tokenPrice:String(tokenPrice),referencePrice:String(referencePrice),
    spreadPct:referencePrice?Number(((tokenPrice/referencePrice-1)*100).toFixed(3)):null,
    marketStatus:market.statusInfo?.marketStatus||null,openState:market.statusInfo?.openState??null,
    nextOpenTime:market.statusInfo?.nextOpenTime??null,nextCloseTime:market.statusInfo?.nextCloseTime??null};
}

module.exports = async function handler(req,res) {
  try {
    const url=new URL(req.url,"http://localhost");
    const action=url.searchParams.get("action")||"scan";
    const ticker=(url.searchParams.get("ticker")||"NVDA").trim().toUpperCase();
    if(!/^[A-Z0-9.-]{1,20}$/.test(ticker)) return res.status(400).json({error:"Invalid ticker"});

    if(action==="assets") {
      if(process.env.BINANCE_WEB3_API_KEY) {
        try {
          const assets=await liveAssets();
          if(assets.length) return res.status(200).json({mode:"live-data",network:"BSC",updatedAt:Date.now(),assets});
        } catch (e) {
          return res.status(e.status||502).json({mode:"live-error",network:"BSC",error:e.message||"Live RWA data unavailable",details:e.data||undefined});
        }
      }
      return res.status(200).json({mode:"demo",network:"BSC",updatedAt:Date.now(),assets:demoAssets.map(x=>demoAsset(x[0]))});
    }

    const asset=process.env.BINANCE_WEB3_API_KEY?await findLiveAsset(ticker):demoAsset(ticker);
    if(action==="quote") {
      const input={fromTokenAddress:url.searchParams.get("fromTokenAddress"),toTokenAddress:url.searchParams.get("toTokenAddress")||asset.tokenContractAddress,amount:url.searchParams.get("amount"),userWalletAddress:url.searchParams.get("userWalletAddress")};
      const built=buildQuoteParams(input);
      if(!built.ok) return res.status(400).json({error:"Invalid quote intent",missing:built.missing});
      if(!process.env.BINANCE_WEB3_API_KEY) return res.status(200).json({mode:"demo",status:"QUOTE_REQUIRES_LIVE_API",ticker,asset,intent:built.params});
      const quote=await binanceGet("/api/v1/dex/aggregator/quote",built.params);
      return res.status(200).json({mode:"live-quote",network:"BSC",ticker,asset,quote,broadcast:false});
    }

    if(action==="build") {
      const input={fromTokenAddress:url.searchParams.get("fromTokenAddress"),toTokenAddress:url.searchParams.get("toTokenAddress"),amount:url.searchParams.get("amount"),userWalletAddress:url.searchParams.get("userWalletAddress"),quoteId:url.searchParams.get("quoteId"),slippagePercent:url.searchParams.get("slippagePercent"),approveTransaction:url.searchParams.get("approveTransaction")};
      const built=buildSwapParams(input);
      if(!built.ok) return res.status(400).json({error:"Invalid swap intent",missing:built.missing});
      if(!process.env.BINANCE_WEB3_API_KEY) return res.status(200).json({mode:"demo",status:"BUILD_REQUIRES_LIVE_API",ticker,asset,intent:built.params,broadcast:false});
      const swap=await binanceGet("/api/v1/dex/aggregator/swap",built.params);
      return res.status(200).json({mode:"live-build",network:"BSC",ticker,asset,built:swap,broadcast:false,next:"Client wallet signature required before broadcast."});
    }

    if(action==="simulateTx") {
      if(!process.env.BINANCE_WEB3_API_KEY) return res.status(200).json({mode:"demo",status:"SIMULATION_REQUIRES_LIVE_API",broadcast:false});
      const raw=url.searchParams.get("evmTx");
      if(!raw) return res.status(400).json({error:"evmTx JSON query parameter is required"});
      let evmTx;
      try { evmTx=JSON.parse(raw); } catch (_) { return res.status(400).json({error:"Invalid evmTx JSON"}); }
      return res.status(200).json({mode:"simulation-adapter",network:"BSC",ticker,evmTx,broadcast:false,status:"SCHEMA_GATED",next:"Verify official Binance simulation schema before calling live simulation."});
    }

    if(action==="preflight") {
      const amount=url.searchParams.get("amount")||"0";
      const maxSpend=url.searchParams.get("maxSpend")||"100";
      return res.status(200).json({agent:"PRONOUS",mode:asset.demo?"demo":"live-data",ticker,asset,preflight:buildPreflight(asset,{amount,maxSpend}),broadcast:false});
    }
    if(action==="loop") {
      const simulated=url.searchParams.get("simulated")==="true";
      const confirmed=url.searchParams.get("confirmed")==="true";
      return res.status(200).json({agent:"PRONOUS",mode:asset.demo?"demo":"live-data",ticker,asset,plan:makePlan(asset),loop:evaluateLoop(asset,{simulated,confirmed}),broadcast:false});
    }
    if(action==="simulate") return res.status(200).json({mode:asset.demo?"demo":"live-simulation",ticker,asset,plan:makePlan(asset),simulated:true,broadcast:false});
    return res.status(200).json({agent:"PRONOUS",mode:asset.demo?"demo":"live-data",asset,plan:makePlan(asset),next:"Run simulation before any wallet execution."});
  } catch(e) {
    return res.status(e.status||500).json({error:e.message||"Agent error",details:e.data||undefined});
  }
};
