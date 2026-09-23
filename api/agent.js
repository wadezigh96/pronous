const crypto = require("crypto");

const BASE = "https://web3.binance.com/build";
const RECV_WINDOW = process.env.BINANCE_WEB3_RECV_WINDOW || "5000";

function signHmac(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64");
}

function signEd25519(privateKey, payload) {
  return crypto.sign(null, Buffer.from(payload), privateKey).toString("base64");
}

function signedHeaders(method, requestPath, body = "") {
  const apiKey = process.env.BINANCE_WEB3_API_KEY;
  const secret = process.env.BINANCE_WEB3_API_SECRET;
  if (!apiKey || !secret) return null;
  const timestamp = new Date().toISOString();
  const prehash = timestamp + method.toUpperCase() + requestPath + body;
  const algo = (process.env.BINANCE_WEB3_SIGN_ALGO || "HMAC_SHA256").toUpperCase();
  const signature = algo === "ED25519"
    ? signEd25519(secret, prehash)
    : signHmac(secret, prehash);
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

function makePlan(asset) {
  const spread = Number(asset.spreadPct || 0);
  let action = "HOLD / OBSERVE";
  if (spread > 1) action = "WATCH PREMIUM";
  if (spread < -1) action = "WATCH DISCOUNT";
  return {action,rationale:"Plan is based on token-vs-reference spread.",spreadPct:spread,
    guardrails:["spot only","BSC mainnet only","simulate before broadcast","spend cap required","allowlist required"]};
}

async function liveAssets() {
  const platforms = ["ondo","bstock","xstocks"];
  const out = [];
  for (const platformId of platforms) {
    try {
      const data = await binanceGet("/api/v1/dex/market/rwa/tokens",{binanceChainId:"56",platformId});
      for (const x of (data.data || [])) {
        out.push({
          ticker:x.ticker || x.symbol || x.tokenSymbol || "UNKNOWN",
          companyName:x.companyName || x.underlyingName || "",
          platformId,
          tokenSymbol:x.tokenSymbol || x.symbol || "",
          tokenContractAddress:x.tokenContractAddress || "",
          tokenPrice:x.tokenPrice ?? null,
          referencePrice:x.referencePrice ?? null,
          marketStatus:x.statusInfo?.marketStatus || null,
          openState:x.statusInfo?.openState ?? null
        });
      }
    } catch (_) {}
  }
  return out;
}

async function findLiveAsset(ticker) {
  const data = await binanceGet("/api/v1/dex/market/rwa/search",{keyword:ticker});
  const candidates=(data.data||[]).flatMap(x=>(x.assets||[]).map(a=>({...x,...a})));
  const asset=candidates.find(x=>["ondo","bstock","xstocks"].includes(x.platformId))||candidates[0];
  if(!asset) throw Object.assign(new Error("TOKEN_NOT_FOUND"),{status:404});
  const price=asset.tokenPrice&&asset.referencePrice
    ? {data:[{tokenPrice:asset.tokenPrice,referencePrice:asset.referencePrice}]}
    : await binanceGet("/api/v1/dex/market/rwa/tokens",{binanceChainId:"56",platformId:asset.platformId});
  const row=price.data?.find(x=>x.tokenContractAddress===asset.tokenContractAddress)||price.data?.[0]||{};
  const tokenPrice=Number(row.tokenPrice||0), referencePrice=Number(row.referencePrice||0);
  return {demo:false,ticker:asset.ticker||ticker,companyName:asset.companyName||asset.underlyingName,
    platformId:asset.platformId,tokenSymbol:asset.tokenSymbol,tokenContractAddress:asset.tokenContractAddress,
    tokenPrice:String(tokenPrice),referencePrice:String(referencePrice),
    spreadPct:referencePrice?Number(((tokenPrice/referencePrice-1)*100).toFixed(3)):null,
    marketStatus:row.statusInfo?.marketStatus||null,openState:row.statusInfo?.openState??null};
}

module.exports = async function handler(req,res) {
  try {
    const url=new URL(req.url,"http://localhost");
    const action=url.searchParams.get("action")||"scan";
    const ticker=(url.searchParams.get("ticker")||"NVDA").trim().toUpperCase();
    if(!/^[A-Z0-9.-]{1,20}$/.test(ticker)) return res.status(400).json({error:"Invalid ticker"});

    if(action==="assets") {
      if(process.env.BINANCE_WEB3_API_KEY) {
        const assets=await liveAssets();
        if(assets.length) return res.status(200).json({mode:"live-data",network:"BSC",assets});
      }
      return res.status(200).json({mode:"demo",network:"BSC",assets:demoAssets.map(x=>demoAsset(x[0]))});
    }

    const asset=process.env.BINANCE_WEB3_API_KEY?await findLiveAsset(ticker):demoAsset(ticker);
    if(action==="simulate") return res.status(200).json({mode:asset.demo?"demo":"live-simulation",ticker,asset,plan:makePlan(asset),simulated:true,broadcast:false});
    return res.status(200).json({agent:"PRONOUS",mode:asset.demo?"demo":"live-data",asset,plan:makePlan(asset),next:"Run simulation before any wallet execution."});
  } catch(e) {
    return res.status(e.status||500).json({error:e.message||"Agent error",details:e.data||undefined});
  }
};
