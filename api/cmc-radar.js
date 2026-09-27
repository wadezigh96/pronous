const CMC_BASE="https://pro-api.coinmarketcap.com";
const PUBLIC_BASE="https://pro-api.coinmarketcap.com/public-api";

async function fetchCMC(path,params){
  const qs=new URLSearchParams(params);
  const key=process.env.CMC_API_KEY||process.env.COINMARKETCAP_API_KEY||"";
  const base=key?CMC_BASE:PUBLIC_BASE;
  const headers={Accept:"application/json"};
  if(key) headers["X-CMC_PRO_API_KEY"]=key;
  const r=await fetch(`${base}${path}?${qs.toString()}`,{headers});
  const body=await r.json().catch(()=>({}));
  if(!r.ok||body?.status?.error_code){
    const e=new Error(body?.status?.error_message||`CoinMarketCap HTTP ${r.status}`);
    e.status=r.status;
    throw e;
  }
  return body;
}

function normalize(rows,direction){
  return (rows||[]).map(x=>{
    const q=Array.isArray(x.quote)?x.quote[0]:x.quote?.USD;
    return {
      id:x.id,name:x.name,symbol:x.symbol,rank:x.cmc_rank,
      price:Number(q?.price),change1h:Number(q?.percent_change_1h),
      change24h:Number(q?.percent_change_24h),volume24h:Number(q?.volume_24h),
      marketCap:Number(q?.market_cap),lastUpdated:q?.last_updated||x.last_updated,
      direction
    };
  }).filter(x=>Number.isFinite(x.price));
}

module.exports=async function handler(req,res){
  try{
    const limit=Math.min(Math.max(Number(new URL(req.url,"http://localhost").searchParams.get("limit"))||10,5),25);
    const common={start:"1",limit:String(limit),convert:"USD",sort:"percent_change_1h"};
    const [up,down]=await Promise.all([
      fetchCMC("/v3/cryptocurrency/listings/latest",{...common,sort_dir:"desc"}),
      fetchCMC("/v3/cryptocurrency/listings/latest",{...common,sort_dir:"asc"})
    ]);
    const gainers=normalize(up.data,"UP");
    const losers=normalize(down.data,"DOWN");
    const seen=new Set();
    const radar=[...gainers,...losers].filter(x=>{if(seen.has(x.id))return false;seen.add(x.id);return true}).slice(0,limit*2);
    const ts=up.status?.timestamp||new Date().toISOString();
    res.setHeader("Cache-Control","s-maxage=60, stale-while-revalidate=30");
    return res.status(200).json({
      source:"CoinMarketCap",
      sourceMode:process.env.CMC_API_KEY||process.env.COINMARKETCAP_API_KEY?"authenticated":"public-api",
      freshness:"CMC listings latest updates every 60 seconds",
      timestamp:ts,
      gainers,losers,radar
    });
  }catch(e){
    return res.status(502).json({error:"CMC_RADAR_UNAVAILABLE",message:e.message,source:"CoinMarketCap"});
  }
};
