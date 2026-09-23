import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

const API = process.env.PRONOUS_API_URL || "https://pronous.vercel.app";

const DEMO_ASSETS = {
  NVDA:{ticker:"NVDA",companyName:"NVIDIA",tokenPrice:"182.6496",referencePrice:"181.20"},
  AAPL:{ticker:"AAPL",companyName:"Apple",tokenPrice:"254.4192",referencePrice:"252.40"},
  TSLA:{ticker:"TSLA",companyName:"Tesla",tokenPrice:"435.1536",referencePrice:"431.70"},
  MSFT:{ticker:"MSFT",companyName:"Microsoft",tokenPrice:"516.3984",referencePrice:"512.30"},
  AMZN:{ticker:"AMZN",companyName:"Amazon",tokenPrice:"228.7152",referencePrice:"226.90"},
  GOOGL:{ticker:"GOOGL",companyName:"Alphabet",tokenPrice:"253.8144",referencePrice:"251.80"}
};

function localAsset(ticker) {
  const key = ticker.toUpperCase();
  const base = DEMO_ASSETS[key] || {ticker:key,companyName:"Demo Tokenized Asset",tokenPrice:"100.80",referencePrice:"100.00"};
  const tokenPrice = Number(base.tokenPrice);
  const referencePrice = Number(base.referencePrice);
  return {
    demo:true,
    network:"BSC",
    ...base,
    tokenPrice:String(tokenPrice),
    referencePrice:String(referencePrice),
    spreadPct:Number(((tokenPrice / referencePrice - 1) * 100).toFixed(3)),
    marketStatus:"demo"
  };
}

function localPreflight(ticker, amount, maxSpend) {
  const asset = localAsset(ticker);
  const checks = [
    {id:"network",label:"BSC mainnet",pass:true},
    {id:"asset",label:"Tokenized-stock asset resolved",pass:true},
    {id:"spot",label:"Spot only",pass:true},
    {id:"price",label:"Token/reference prices available",pass:true},
    {id:"spend_cap",label:"Spend cap",pass:amount > 0 && maxSpend > 0 && amount <= maxSpend},
    {id:"simulation",label:"Simulation required",pass:false}
  ];
  return {
    agent:"PRONOUS",
    mode:"mcp-local-demo",
    network:"BSC",
    ticker:asset.ticker,
    asset,
    preflight:{
      status:checks.every(x=>x.pass) ? "READY_FOR_SIMULATION" : "BLOCKED",
      amount,
      maxSpend,
      spreadPct:asset.spreadPct,
      checks,
      next:checks.find(x=>!x.pass)?.id || "simulation"
    },
    broadcast:false,
    fallbackReason:"PRONOUS live API was unavailable; deterministic preflight was evaluated locally. No transaction was executed."
  };
}

function createServer() {
  const server = new McpServer({ name: "pronous", version: "1.0.0" });

  async function getJSON(path) {
    const response = await fetch(API + path);
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw:text }; }
    if (!response.ok) {
      const error = new Error("PRONOUS API " + response.status);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  server.registerTool("market_assets", {
    description:"Get tokenized-stock market assets monitored by PRONOUS.",
    inputSchema:z.object({ ticker:z.string().optional() })
  }, async ({ticker}) => ({
    content:[{type:"text",text:JSON.stringify(await getJSON("/api/agent?action=assets"+(ticker?"&ticker="+encodeURIComponent(ticker.toUpperCase()):"")),null,2)}]
  }));

  server.registerTool("scan_asset", {
    description:"Scan one tokenized stock and return its PRONOUS market-gap assessment.",
    inputSchema:z.object({ticker:z.string().min(1)})
  }, async ({ticker}) => ({
    content:[{type:"text",text:JSON.stringify(await getJSON("/api/agent?action=scan&ticker="+encodeURIComponent(ticker.toUpperCase())),null,2)}]
  }));

  server.registerTool("preflight", {
    description:"Run deterministic PRONOUS checks for a proposed spot-only spend. Does not execute a transaction.",
    inputSchema:z.object({ticker:z.string().min(1),amount:z.number().positive(),maxSpend:z.number().positive()})
  }, async ({ticker,amount,maxSpend}) => {
    const path="/api/agent?action=preflight&ticker="+encodeURIComponent(ticker.toUpperCase())+"&amount="+amount+"&maxSpend="+maxSpend;
    try {
      return {content:[{type:"text",text:JSON.stringify(await getJSON(path),null,2)}]};
    } catch (error) {
      return {content:[{type:"text",text:JSON.stringify(localPreflight(ticker,amount,maxSpend),null,2)}]};
    }
  });

  server.registerTool("ask_pronous", {
    description:"Ask PRONOUS about tokenized stocks, gaps, market hours, BSC, wallet safety or execution flow.",
    inputSchema:z.object({question:z.string().min(1),ticker:z.string().optional()})
  }, async ({question,ticker}) => {
    const query="/api/ask?q="+encodeURIComponent(question)+(ticker?"&ticker="+encodeURIComponent(ticker.toUpperCase()):"");
    const data=await getJSON(query);
    return {content:[{type:"text",text:data.answer||JSON.stringify(data,null,2)}]};
  });

  server.registerResource("pronous-overview","pronous://overview",
    {description:"PRONOUS capabilities and safety model",mimeType:"text/plain"},
    async () => ({contents:[{uri:"pronous://overview",text:"PRONOUS watches tokenized stocks, compares token/reference prices, explains gaps, applies deterministic guardrails, and prepares execution. MCP tools are read-only or preflight-only; live transaction broadcast is not exposed."}]})
  );

  return server;
}

serveStdio(createServer);
