const crypto = require("crypto");
const { calculateSpreadPct, normalizeAsset, assessQuote, isSupportedPlatform } = require("../lib/market");
const { buildGuardChecks, preflightStatus } = require("../lib/policy");
const { buildQuoteParams, buildSwapParams } = require("../lib/execution");

const BASE = "https://web3.binance.com/build";
const RECV_WINDOW = process.env.BINANCE_WEB3_RECV_WINDOW || "60000";
const LIVE_ENABLED = Boolean((process.env.BINANCE_WEB3_API_KEY || "").trim() && (process.env.BINANCE_WEB3_API_SECRET || "").trim());

function normalizeCredential(value) {
  return String(value || "")
    .replace(/^["']|["']$/g, "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .trim();
}

function isoTimestamp() {
  return new Date().toISOString();
}

function wirePath(requestPath) {
  if (!requestPath) return "/build";
  return requestPath.startsWith("/build") ? requestPath : "/build" + requestPath;
}

function signHmac(secret, payload) {
  const normalizedSecret = normalizeCredential(secret);
  return crypto.createHmac("sha256", normalizedSecret).update(payload, "utf8").digest("base64");
}

function parseEd25519PrivateKey(secret) {
  const raw = String(secret || "").trim();
  const normalized = raw
    .replace(/^["']|["']$/g, "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .trim();

  if (/-----BEGIN PRIVATE KEY-----/.test(normalized) &&
      /-----END PRIVATE KEY-----/.test(normalized)) {
    return crypto.createPrivateKey({ key: normalized, format: "pem", type: "pkcs8" });
  }

  const compact = normalized.replace(/\s+/g, "");
  if (/^[A-Za-z0-9+/=_-]+$/.test(compact)) {
    const base64 = compact.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const der = Buffer.from(padded, "base64");
    if (der.length > 0) {
      try {
        return crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
      } catch (_) {
        if (der.length === 32) {
          const pkcs8 = Buffer.concat([
            Buffer.from("302e020100300506032b657004220420", "hex"),
            der
          ]);
          return crypto.createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
        }
      }
    }
  }

  throw new Error("INVALID_ED25519_PRIVATE_KEY_FORMAT");
}
function credentialShape(secret) {
  const raw = String(secret || "").trim().replace(/^["']|["']$/g, "");
  if (!raw) return {kind:"EMPTY",length:0};
  const normalized = raw.replace(/\\r\\n/g,"\n").replace(/\\n/g,"\n").replace(/\\r/g,"\r").trim();
  if (/-----BEGIN [^-]+ PRIVATE KEY-----/.test(normalized)) return {kind:"PEM_PRIVATE_VARIANT",header:normalized.match(/-----BEGIN [^-]+ PRIVATE KEY-----/)?.[0]||"UNKNOWN",length:normalized.length};
  if (normalized.includes("BEGIN PUBLIC KEY")) return {kind:"PEM_PUBLIC",length:normalized.length};
  const compact = normalized.replace(/\s+/g,"");
  if (/^[A-Za-z0-9+/=_-]+$/.test(compact)) {
    const b64 = compact.replace(/-/g,"+").replace(/_/g,"/");
    const der = Buffer.from(b64 + "=".repeat((4-(b64.length%4))%4),"base64");
    return {kind:"BASE64",length:compact.length,decodedLength:der.length};
  }
  return {kind:"OTHER",length:normalized.length};
}

function signEd25519(privateKey, payload) {
  const keyObject = parseEd25519PrivateKey(privateKey);
  const message = Buffer.from(payload, "utf8");
  const signature = crypto.sign(null, message, keyObject);
  const publicKey = crypto.createPublicKey(keyObject);
  const selfVerified = crypto.verify(null, message, publicKey, signature);
  if (!selfVerified) throw new Error("ED25519_SELF_VERIFY_FAILED");
  return { signature: signature.toString("base64"), selfVerified };
}

function privateKeyFingerprint(privateKey) {
  const keyObject = parseEd25519PrivateKey(privateKey);
  const publicDer = crypto.createPublicKey(keyObject).export({format:"der",type:"spki"});
  return crypto.createHash("sha256").update(publicDer).digest("hex");
}

function signedHeaders(method, requestPath, body = "") {
  const apiKey = normalizeCredential(process.env.BINANCE_WEB3_API_KEY);
  const secret = normalizeCredential(process.env.BINANCE_WEB3_API_SECRET);
  const algorithm = String(process.env.BINANCE_WEB3_SIGN_ALGO || "HMAC_SHA256").trim().toUpperCase();
  if (!apiKey || !secret) return null;

  const timestamp = isoTimestamp();
  const normalizedMethod = method.toUpperCase();
  const signedPath = wirePath(requestPath);
  const prehash = timestamp + normalizedMethod + signedPath + body;
  let signature;
  let publicKeySha256;
  let signatureSelfVerified;
  if (algorithm === "ED25519") {
    const signed = signEd25519(secret, prehash);
    signature = signed.signature;
    publicKeySha256 = privateKeyFingerprint(secret);
    signatureSelfVerified = signed.selfVerified;
  } else if (algorithm === "HMAC_SHA256" || algorithm === "HMAC-SHA256") {
    signature = signHmac(secret, prehash);
  } else {
    throw new Error("UNSUPPORTED_SIGN_ALGO");
  }

  return {
    "X-OC-APIKEY": apiKey,
    "X-OC-TIMESTAMP": timestamp,
    "X-OC-SIGN": signature,
    "X-OC-RECV-WINDOW": RECV_WINDOW,
    "X-OC-NONCE": crypto.randomBytes(16).toString("hex"),
    _debug:process.env.DEBUG_AUTH==="1"?{algorithm,method:normalizedMethod,requestPath:signedPath,requestPathLength:signedPath.length,bodyLength:body.length,timestamp,prehashSha256:crypto.createHash("sha256").update(prehash,"utf8").digest("hex"),publicKeySha256,signatureSelfVerified}:undefined
  };
}

function buildRequestPath(path, params = {}) {
  const entries = Object.entries(params || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!entries.length) return path;
  const query = entries.map(([key, value]) =>
    encodeURIComponent(key) + "=" + encodeURIComponent(String(value))
  ).join("&");
  return path + "?" + query;
}

async function binanceGet(path, params = {}) {
  const requestPath = buildRequestPath(path, params);
  const headers = signedHeaders("GET", requestPath, "");
  if (!headers) throw new Error("LIVE_API_NOT_CONFIGURED");
  const debug = headers._debug; delete headers._debug;
  const r = await fetch(BASE + requestPath, {headers});
  const data = await r.json();
  if (!r.ok || (data.code !== undefined && data.code !== 0)) {
    const e = new Error(data.msg || "Binance Web3 API error");
    e.status = r.status || 502;
    e.data = data; if (process.env.DEBUG_AUTH === "1") e.authDebug = debug;
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
    {name:"data_quality",pass:asset.dataQuality!=="unreliable",reason:"unreliable token/reference gap is not a trade signal"},
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
  if (asset.dataQuality === "unreliable") action = "IGNORE UNRELIABLE FEED";
  else if (spread > 1) action = "WATCH PREMIUM";
  else if (spread < -1) action = "WATCH DISCOUNT";
  return {action,rationale:"Plan is based on token-vs-reference spread and data quality.",spreadPct:spread,
    guardrails:["spot only","BSC mainnet only","simulate before broadcast","spend cap required","ondo/bstock/xstocks only"]};
}

async function liveAssets() {
  const data = await binanceGet("/api/v1/dex/market/rwa/tokens",{binanceChainId:"56"});
  return (data.data || [])
    .filter(x => x.underlyingTicker && x.tokenContractAddress && isSupportedPlatform(x.platformId))
    .map(x => {
      const quality = assessQuote(x.tokenPrice, x.referencePrice);
      return {
        ticker:x.underlyingTicker,
        companyName:x.underlyingName || x.tokenName || "",
        platformId:x.platformId || "unknown",
        tokenSymbol:x.tokenSymbol || "",
        tokenContractAddress:x.tokenContractAddress,
        tokenPrice:x.tokenPrice ?? null,
        referencePrice:x.referencePrice ?? null,
        spreadPct:quality.spreadPct,
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
  const quality=assessQuote(tokenPrice, referencePrice);
  return {demo:false,ticker:asset.ticker||ticker,companyName:asset.companyName||asset.underlyingName,
    platformId:asset.platformId,tokenSymbol:asset.tokenSymbol,tokenContractAddress:asset.tokenContractAddress,
    tokenPrice:String(tokenPrice),referencePrice:String(referencePrice),
    spreadPct:quality.spreadPct,dataQuality:quality.dataQuality,actionable:quality.actionable,
    marketStatus:market.statusInfo?.marketStatus||null,openState:market.statusInfo?.openState??null,
    nextOpenTime:market.statusInfo?.nextOpenTime??null,nextCloseTime:market.statusInfo?.nextCloseTime??null};
}

module.exports = async function handler(req,res) {
  try {
    const url=new URL(req.url,"http://localhost");
    const action=url.searchParams.get("action")||"scan";
    const ticker=(url.searchParams.get("ticker")||"NVDA").trim().toUpperCase();
    if(!/^[A-Z0-9.-]{1,20}$/.test(ticker)) return res.status(400).json({error:"Invalid ticker"});

    if(action==="authcheck") {
      const algorithm = String(process.env.BINANCE_WEB3_SIGN_ALGO || "HMAC_SHA256").trim().toUpperCase();
      const fingerprint = algorithm === "ED25519" && process.env.BINANCE_WEB3_API_SECRET
        ? privateKeyFingerprint(normalizeCredential(process.env.BINANCE_WEB3_API_SECRET))
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
              unreliable:assets.filter(x=>x.dataQuality==="unreliable").length
            };
            const rows=action==="radar"
              ? assets.filter(x=>x.actionable).sort((a,b)=>Math.abs(b.spreadPct||0)-Math.abs(a.spreadPct||0)).slice(0,20)
              : assets;
            return res.status(200).json({mode:"live-data",network:"BSC",updatedAt:Date.now(),spotOnly:true,summary,assets:rows});
          }
        } catch (e) {
          return res.status(e.status||502).json({mode:"live-error",network:"BSC",error:e.message||"Live RWA data unavailable",details:process.env.DEBUG_AUTH==="1"?e.data:undefined,authDebug:e.authDebug||undefined});
        }
      }
      return res.status(200).json({mode:"demo",network:"BSC",updatedAt:Date.now(),assets:demoAssets.map(x=>demoAsset(x[0]))});
    }

    const asset=LIVE_ENABLED?await findLiveAsset(ticker):demoAsset(ticker);
    if(action==="quote") {
      const input={fromTokenAddress:url.searchParams.get("fromTokenAddress"),toTokenAddress:url.searchParams.get("toTokenAddress")||asset.tokenContractAddress,amount:url.searchParams.get("amount"),userWalletAddress:url.searchParams.get("userWalletAddress")};
      const built=buildQuoteParams(input);
      if(!built.ok) return res.status(400).json({error:"Invalid quote intent",missing:built.missing});
      if(!LIVE_ENABLED) return res.status(200).json({mode:"demo",status:"QUOTE_REQUIRES_LIVE_API",ticker,asset,intent:built.params});
      const quote=await binanceGet("/api/v1/dex/aggregator/quote",built.params);
      return res.status(200).json({mode:"live-quote",network:"BSC",ticker,asset,quote,broadcast:false});
    }

    if(action==="build") {
      const input={fromTokenAddress:url.searchParams.get("fromTokenAddress"),toTokenAddress:url.searchParams.get("toTokenAddress"),amount:url.searchParams.get("amount"),userWalletAddress:url.searchParams.get("userWalletAddress"),quoteId:url.searchParams.get("quoteId"),slippagePercent:url.searchParams.get("slippagePercent"),approveTransaction:url.searchParams.get("approveTransaction")};
      const built=buildSwapParams(input);
      if(!built.ok) return res.status(400).json({error:"Invalid swap intent",missing:built.missing});
      if(!LIVE_ENABLED) return res.status(200).json({mode:"demo",status:"BUILD_REQUIRES_LIVE_API",ticker,asset,intent:built.params,broadcast:false});
      const swap=await binanceGet("/api/v1/dex/aggregator/swap",built.params);
      return res.status(200).json({mode:"live-build",network:"BSC",ticker,asset,built:swap,broadcast:false,next:"Client wallet signature required before broadcast."});
    }

    if(action==="simulateTx") {
      if(!LIVE_ENABLED) return res.status(200).json({mode:"demo",status:"SIMULATION_REQUIRES_LIVE_API",broadcast:false});
      const raw=url.searchParams.get("evmTx");
      if(!raw) return res.status(400).json({error:"evmTx JSON query parameter is required"});
      let evmTx;
      try { evmTx=JSON.parse(raw); } catch (_) { return res.status(400).json({error:"Invalid evmTx JSON"}); }
      return res.status(200).json({mode:"simulation-adapter",network:"BSC",ticker,evmTx,broadcast:false,status:"SCHEMA_GATED",next:"Verify official Binance simulation schema before calling live simulation."});
    }

    if(action==="scan") {
      const spread=Number(asset.spreadPct||0);
      const signal = asset.dataQuality==="unreliable"
        ? "UNRELIABLE"
        : Math.abs(spread)>=1
          ? (spread>0 ? "PREMIUM" : "DISCOUNT")
          : "OBSERVE";
      const risk = asset.dataQuality==="unreliable"
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
          spreadPct:spread,
          dataQuality:asset.dataQuality||"demo",
          actionable:asset.actionable??false,
          marketStatus:asset.marketStatus??null,
          openState:asset.openState??null,
          nextOpenTime:asset.nextOpenTime??null,
          nextCloseTime:asset.nextCloseTime??null
        },
        signal:{
          type:signal,
          spreadPct:spread,
          actionable:signal==="PREMIUM"||signal==="DISCOUNT"
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
    const out={error:e.message||"Agent error",details:e.data||undefined};
    if(process.env.DEBUG_AUTH==="1" && e.authDebug) out.authDebug=e.authDebug;
    if(process.env.DEBUG_AUTH==="1" && e.message==="INVALID_ED25519_PRIVATE_KEY_FORMAT") out.credentialDebug=credentialShape(process.env.BINANCE_WEB3_API_SECRET);
    return res.status(e.status||500).json(out);
  }
};
