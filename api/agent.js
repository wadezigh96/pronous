const { assessQuote, isSupportedPlatform, resolveShareRatio, MIN_ACTIONABLE_GAP_PCT } = require("../lib/market");
const { getPancakeQuote, USDT } = require("../lib/pancakeswap-quote");
const { buildGuardChecks, preflightStatus, validateSpendCap } = require("../lib/policy");
const { guardRequest, isAddress, isAmount, safeError } = require("../lib/http-policy");
const { buildQuoteParams, buildSwapParams } = require("../lib/execution");
const { signedGet, normalizeCredential, publicKeyFingerprint } = require("../lib/binance-web3");

const LIVE_ENABLED = Boolean((process.env.BINANCE_WEB3_API_KEY || "").trim() && (process.env.BINANCE_WEB3_API_SECRET || "").trim());
const configuredCacheTtl = Number(process.env.PRONOUS_CACHE_TTL_MS);
const CACHE_TTL_MS = Number.isFinite(configuredCacheTtl) ? Math.max(15000, Math.min(30000, configuredCacheTtl)) : 20000;
const configuredMaxActionableImpact = Number(process.env.PRONOUS_MAX_ACTIONABLE_PRICE_IMPACT_PCT);
const MAX_ACTIONABLE_PRICE_IMPACT_PCT = Number.isFinite(configuredMaxActionableImpact) && configuredMaxActionableImpact > 0
  ? configuredMaxActionableImpact
  : 1;
const responseCache = new Map();
let liveAssetsFetchedAt = null;
async function cachedValue(key, factory, ttlMs = CACHE_TTL_MS) {
  const now = Date.now(), hit = responseCache.get(key);
  if (hit && hit.expiresAt > now) return hit.promise;
  for (const [cacheKey, entry] of responseCache) if (entry.expiresAt <= now) responseCache.delete(cacheKey);
  const promise = Promise.resolve().then(factory);
  responseCache.set(key, { expiresAt: now + ttlMs, promise });
  while (responseCache.size > 256) responseCache.delete(responseCache.keys().next().value);
  try { return await promise; } catch (error) {
    const current = responseCache.get(key);
    if (current?.promise === promise) responseCache.delete(key);
    throw error;
  }
}
function boundedInt(value, fallback, min, max) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
function marketIsClosed(asset) {
  const status = [asset.marketStatus, asset.openState].map((x) => String(x ?? "")).join(" ").toLowerCase();
  const openState = asset.openState;
  return /closed|post.?market|pre.?market|after.?hours|overnight|extended.?hours/i.test(status) ||
    openState === false || openState === 0 || ["false","0","closed"].includes(String(openState).toLowerCase());
}
function marketHoursContext(asset) {
  if (marketIsClosed(asset)) return "MARKET_CLOSED_REFERENCE_MAY_BE_STALE";
  // openState can describe token/contract availability (the snapshot shows
  // openState=true while marketStatus=postmarket); only marketStatus confirms
  // the underlying exchange session.
  const status = String(asset.marketStatus ?? "").trim().toLowerCase();
  if (/^(open|trading|market[_ ]open|regular[_ ]session)$/.test(status)) {
    return "MARKET_STATUS_REPORTED";
  }
  return "MARKET_HOURS_UNCONFIRMED";
}
async function mapWithConcurrency(items, concurrency, worker) {
  const out = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{
    while (true) { const index=cursor++; if(index>=items.length)return; out[index]=await worker(items[index],index); }
  }));
  return out;
}
async function quoteRadarAsset(asset, sizeUSDT) {
  const address=String(asset.tokenContractAddress||"").trim();
  const expected=Number(asset.referencePrice)*Number(asset.shareRatio??asset.tokenToShareRatio);
  const validReference=Number.isFinite(expected)&&expected>0;
  const base={...asset,quoteSource:"PancakeSwap Unified Swap API",quoteSide:"BUY",quoteSizeUSDT:sizeUSDT,marketContext:marketHoursContext(asset),broadcast:false};
  if(!/^0x[a-fA-F0-9]{40}$/.test(address)) return {...base,routeStatus:"NO TOKEN ADDRESS",quotePriceUSDTPerToken:null,onchainGapPct:null,priceImpactPct:null,actionable:false};
  try {
    const q=await cachedValue("pancake-radar:"+address.toLowerCase()+":"+sizeUSDT,
      ()=>getPancakeQuote({assetAddress:address,tokenInAddress:USDT,tokenOutAddress:address,amount:String(sizeUSDT)}));
    const input=Number(q.amountIn), output=Number(q.amountOut);
    const price=input>0&&output>0&&Number.isFinite(input)&&Number.isFinite(output)?input/output:null;
    const gap=validReference&&price!==null?(price/expected-1)*100:null;
    return {...base,routeStatus:"ROUTE",quotePriceUSDTPerToken:price,onchainGapPct:gap===null?null:Number(gap.toFixed(6)),
      priceImpactPct:q.priceImpact==null?null:Number((Number(q.priceImpact)*100).toFixed(6)),routeTypes:q.routeTypes||[],
      actionable:asset.dataQuality==="ok"&&validReference&&gap!==null&&Math.abs(gap)>=MIN_ACTIONABLE_GAP_PCT&&q.priceImpact!==null&&q.priceImpact!==undefined&&Number.isFinite(Number(q.priceImpact))&&Number(q.priceImpact)*100<=MAX_ACTIONABLE_PRICE_IMPACT_PCT&&marketHoursContext(asset)==="MARKET_STATUS_REPORTED"&&!marketIsClosed(asset)};
  } catch(error) {
    const code=String(error?.code||error?.message||"QUOTE_ERROR"), noRoute=/NO_ROUTE/i.test(code);
    return {...base,routeStatus:noRoute?"NO ROUTE":"QUOTE ERROR",quotePriceUSDTPerToken:null,onchainGapPct:null,
      priceImpactPct:null,quoteError:noRoute?null:code,actionable:false};
  }
}
async function liveRadar(sizeUSDT, limit) {
  return cachedValue("onchain-radar:"+sizeUSDT+":"+limit,async()=>{
    const assets=await liveAssets();
    const volumeCandidates=assets.filter(a=>{
      const volume=Number(a.volume24H);
      return /^0x[a-fA-F0-9]{40}$/.test(String(a.tokenContractAddress||"")) &&
        a.volume24H!==null && a.volume24H!==undefined && a.volume24H!=="" &&
        Number.isFinite(volume) && volume>=0;
    }).sort((a,b)=>Number(b.volume24H)-Number(a.volume24H));
    // Do not substitute ticker order or market cap for missing volume. That would
    // not satisfy the top-by-volume promise and would invent a ranking.
    if(!volumeCandidates.length) return {assets:[],summary:{
      candidatesQuoted:0,volumeAvailable:false,noVolumeData:assets.length,
      reason:"UPSTREAM_24H_VOLUME_UNAVAILABLE",
      routeAvailable:0,noRoute:0,quoteErrors:0,actionable:0,quoteSizeUSDT:sizeUSDT,
      quoteSource:"PancakeSwap Unified Swap API",quoteSide:"BUY",volumeBasis:"upstream reported 24h volume; units unverified unless volume24HUnit is supplied",minActionableGapPct:MIN_ACTIONABLE_GAP_PCT,maxActionablePriceImpactPct:MAX_ACTIONABLE_PRICE_IMPACT_PCT,broadcast:false
    }};
    const selected=volumeCandidates.slice(0,limit);
    const rows=await mapWithConcurrency(selected,2,a=>quoteRadarAsset(a,sizeUSDT));
    return {assets:rows,summary:{
      candidatesQuoted:rows.length,volumeAvailable:true,volumeCandidates:volumeCandidates.length,
      routeAvailable:rows.filter(x=>x.routeStatus==="ROUTE").length,
      noRoute:rows.filter(x=>x.routeStatus==="NO ROUTE").length,
      quoteErrors:rows.filter(x=>x.routeStatus==="QUOTE ERROR").length,
      actionable:rows.filter(x=>x.actionable).length,quoteSizeUSDT:sizeUSDT,
      quoteSource:"PancakeSwap Unified Swap API",minActionableGapPct:MIN_ACTIONABLE_GAP_PCT,broadcast:false
    }};
  });
}

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
  else if (asset.actionable === true && spread > 0) action = "WATCH PREMIUM";
  else if (asset.actionable === true && spread < 0) action = "WATCH DISCOUNT";
  return {action,rationale:"Feed spread is ratio-adjusted but may be derived from the reference price; it is not independent market evidence. Use the quote-based radar and inspect impact/session before interpreting a gap.",spreadPct:asset.adjustedSpreadPct??null,adjustedSpreadPct:asset.adjustedSpreadPct??null,rawSpreadPct:asset.rawSpreadPct??null,shareRatio:asset.shareRatio??asset.tokenToShareRatio??null,minActionableGapPct:MIN_ACTIONABLE_GAP_PCT,actionable:asset.actionable===true,
    guardrails:["spot only","BSC mainnet only","simulate before broadcast","spend cap required","ondo/bstock/xstocks only"]};
}

async function fetchLiveAssets() {
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
        volume24H:x.volume24H ?? x.volume24h ?? x.volume24HUsd ?? x.volume24hUsd ?? null,
        volume24HUnit:x.volume24HUnit ?? x.volumeUnit ?? null,
        marketCap:x.marketCap ?? null,
        tokenToShareRatio:x.tokenToShareRatio ?? null
      };
    });
}

async function liveAssets() {
  return cachedValue("live-rwa-assets", async () => {
    const assets = await fetchLiveAssets();
    liveAssetsFetchedAt = Date.now();
    return assets;
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
  let feedAsset=null;
  const priceRatio=resolveShareRatio(quote.tokenToShareRatio);
  const searchRatio=resolveShareRatio(asset.tokenToShareRatio,asset.shareRatio);
  let shareRatio=priceRatio??searchRatio;
  let shareRatioSource=priceRatio!==null?"price":searchRatio!==null?"search":null;
  // The search/price endpoints can omit tokenToShareRatio even when the full RWA
  // token list has it. Reuse the 20s cached list as a safe fallback rather than
  // falsely marking a known-ratio asset as missing_ratio.
  if(shareRatio===null){
    try{
      const rows=await liveAssets();
      const address=String(asset.tokenContractAddress||"").toLowerCase();
      const platform=String(asset.platformId||"").toLowerCase();
      feedAsset=rows.find(x=>String(x.tokenContractAddress||"").toLowerCase()===address&&String(x.platformId||"").toLowerCase()===platform)
        ||rows.find(x=>String(x.ticker||"").toUpperCase()===String(asset.ticker||ticker).toUpperCase()&&String(x.platformId||"").toLowerCase()===platform)
        ||null;
      shareRatio=resolveShareRatio(feedAsset?.tokenToShareRatio,feedAsset?.shareRatio);
      if(shareRatio!==null)shareRatioSource="rwa-tokens-list";
    }catch(_){}
  }
  const tokenPrice=Number(quote.tokenPrice||feedAsset?.tokenPrice||0);
  const referencePrice=Number(quote.referencePrice||feedAsset?.referencePrice||0);
  const quality=assessQuote(tokenPrice,referencePrice,shareRatio);
  return {demo:false,ticker:asset.ticker||ticker,companyName:asset.companyName||asset.underlyingName||feedAsset?.companyName||"",
    platformId:asset.platformId||feedAsset?.platformId,tokenSymbol:asset.tokenSymbol||feedAsset?.tokenSymbol,
    tokenContractAddress:asset.tokenContractAddress||feedAsset?.tokenContractAddress,
    tokenPrice:String(tokenPrice),referencePrice:String(referencePrice),
    rawSpreadPct:quality.rawSpreadPct,adjustedSpreadPct:quality.adjustedSpreadPct,
    spreadPct:quality.adjustedSpreadPct,shareRatio:quality.shareRatio,
    tokenToShareRatio:shareRatio,shareRatioSource,dataQuality:quality.dataQuality,actionable:quality.actionable,
    volume24H:feedAsset?.volume24H??asset.volume24H??null,
    marketStatus:market.statusInfo?.marketStatus||feedAsset?.marketStatus||null,
    openState:market.statusInfo?.openState??feedAsset?.openState??null,
    nextOpenTime:market.statusInfo?.nextOpenTime??feedAsset?.nextOpenTime??null,
    nextCloseTime:market.statusInfo?.nextCloseTime??feedAsset?.nextCloseTime??null};
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

    if(action==="assets" || action==="market" || action==="radar") {
      res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=10");
      try {
        if (!LIVE_ENABLED) return res.status(503).json({
          mode:"unavailable",network:"BSC",error:"LIVE_RWA_FEED_NOT_CONFIGURED",
          message:"Server-side read-only Binance feed is not configured. Demo prices are not presented as live.",
          assets:[],summary:{total:0,actionable:0},broadcast:false
        });
        const assets=await liveAssets();
        const summary={
          total:assets.length,ondo:assets.filter(x=>x.platformId==="ondo").length,
          bstock:assets.filter(x=>x.platformId==="bstock").length,xstocks:assets.filter(x=>x.platformId==="xstocks").length,
          actionable:assets.filter(x=>x.actionable).length,unreliable:assets.filter(x=>x.dataQuality==="unreliable").length,
          missingRatio:assets.filter(x=>x.dataQuality==="missing_ratio").length,minActionableGapPct:MIN_ACTIONABLE_GAP_PCT
        };
        if(action==="radar") {
          const sizeUSDT=boundedInt(url.searchParams.get("sizeUSDT"),100,10,1000);
          const limit=boundedInt(url.searchParams.get("limit"),5,1,5);
          const result=await liveRadar(sizeUSDT,limit);
          return res.status(200).json({
            mode:"live-data",network:"BSC",updatedAt:Date.now(),feedUpdatedAt:liveAssetsFetchedAt,spotOnly:true,
            monitor:"onchain-vs-reference",
            formula:"onchainGapPct = (quotePriceUSDTPerToken / (referencePrice * shareRatio) - 1) * 100",
            referenceBasis:"USDT is treated as approximately USD; stablecoin depeg risk is not modeled.",quoteSide:"BUY; quote-only and not a round-trip arbitrage estimate",maxActionablePriceImpactPct:MAX_ACTIONABLE_PRICE_IMPACT_PCT,
            marketHoursNote:"When the underlying exchange is closed, a gap can mean an opportunity or a stale reference. Do not treat it as actionable without checking session status.",
            summary:result.summary,assets:result.assets,broadcast:false
          });
        }
        const limit=boundedInt(url.searchParams.get("limit"),100,1,200);
        const offset=boundedInt(url.searchParams.get("offset"),0,0,Math.max(0,assets.length));
        const rows=assets.slice(offset,offset+limit);
        const nextOffset=offset+rows.length<assets.length?offset+rows.length:null;
        return res.status(200).json({
          mode:"live-data",network:"BSC",updatedAt:Date.now(),feedUpdatedAt:liveAssetsFetchedAt,spotOnly:true,summary,
          pagination:{total:assets.length,limit,offset,nextOffset,hasMore:nextOffset!==null},assets:rows
        });
      } catch(e) {
        return res.status(e.status||502).json({mode:"live-error",network:"BSC",error:e.code||"LIVE_RWA_FEED_FAILED",
          message:"Live RWA data is temporarily unavailable. Retry after a short delay.",broadcast:false});
      }
    }

    if (!LIVE_ENABLED && ["scan","preflight","loop","simulate","pancakeQuote","quote","quoteBuild","build"].includes(action)) {
      return res.status(503).json({
        mode:"unavailable",network:"BSC",ticker,error:"LIVE_RWA_FEED_NOT_CONFIGURED",
        message:"The server-side read-only Binance feed is not configured. No demo price is substituted.",
        asset:{ticker,tokenPrice:null,referencePrice:null,shareRatio:null,dataQuality:"unavailable",actionable:false},
        broadcast:false,calldataAvailable:false
      });
    }
    const asset=LIVE_ENABLED?await findLiveAsset(ticker):demoAsset(ticker);
    if(action==="pancakeQuote") {
      res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=10");
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
        const cacheKey = "pancake-preview:" + [
          asset.tokenContractAddress,
          input.fromTokenAddress.toLowerCase(),
          input.toTokenAddress.toLowerCase(),
          input.amount,
          input.maxSpend
        ].join(":");
        const quote=await cachedValue(cacheKey,()=>getPancakeQuote({
          assetAddress:asset.tokenContractAddress,
          tokenInAddress:input.fromTokenAddress,
          tokenOutAddress:input.toTokenAddress,
          amount:input.amount
        }));
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
          : asset.actionable===true
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
          actionable:asset.dataQuality==="ok"&&asset.actionable===true&&(signal==="PREMIUM"||signal==="DISCOUNT")
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
