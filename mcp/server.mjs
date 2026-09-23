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

function localScan(ticker) {
  const asset = localAsset(ticker);
  const spreadPct = asset.spreadPct;
  const direction = spreadPct > 0 ? "PREMIUM" : spreadPct < 0 ? "DISCOUNT" : "PAR";
  return {
    agent:"PRONOUS",
    mode:"mcp-local-demo",
    network:"BSC",
    scan:{
      ticker:asset.ticker,
      companyName:asset.companyName,
      tokenPrice:asset.tokenPrice,
      referencePrice:asset.referencePrice,
      spreadPct,
      direction,
      marketStatus:asset.marketStatus,
      assessment: direction === "PREMIUM"
        ? "Tokenized stock is trading above the reference price."
        : direction === "DISCOUNT"
          ? "Tokenized stock is trading below the reference price."
          : "Tokenized stock is aligned with the reference price."
    },
    execution:{broadcast:false},
    fallbackReason:"PRONOUS live API was unavailable; deterministic market-gap scan was evaluated locally. No transaction was executed."
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
  }, async ({ticker}) => {
    const path="/api/agent?action=assets"+(ticker?"&ticker="+encodeURIComponent(ticker.toUpperCase()):"");
    try {
      return {content:[{type:"text",text:JSON.stringify(await getJSON(path),null,2)}]};
    } catch (error) {
      const assets = ticker ? [localAsset(ticker)] : Object.keys(DEMO_ASSETS).map(localAsset);
      return {content:[{type:"text",text:JSON.stringify({
        agent:"PRONOUS",
        mode:"mcp-local-demo",
        network:"BSC",
        assets,
        fallbackReason:"PRONOUS live API was unavailable; deterministic demo market assets were returned locally. No transaction was executed."
      },null,2)}]};
    }
  });

  server.registerTool("scan_asset", {
    description:"Scan one tokenized stock and return its PRONOUS market-gap assessment.",
    inputSchema:z.object({ticker:z.string().min(1)})
  }, async ({ticker}) => {
    const path="/api/agent?action=scan&ticker="+encodeURIComponent(ticker.toUpperCase());
    try {
      return {content:[{type:"text",text:JSON.stringify(await getJSON(path),null,2)}]};
    } catch (error) {
      return {content:[{type:"text",text:JSON.stringify(localScan(ticker),null,2)}]};
    }
  });

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
    try {
      const data=await getJSON(query);
      return {content:[{type:"text",text:data.answer||JSON.stringify(data,null,2)}]};
    } catch (error) {
      const q=question.toLowerCase();
      let answer;
      if (q.includes("what is pronous") || q.includes("what's pronous") || q.includes("about pronous")) {
        answer="PRONOUS is a tokenized-stock market desk for BSC that watches token/reference price gaps, explains market conditions, applies deterministic guardrails, and prepares execution intents. Execution remains user-confirmed; this MCP interface does not sign or broadcast transactions.";
      } else if (q.includes("bsc") || q.includes("bnb")) {
        answer="PRONOUS is designed for tokenized-stock workflows on BSC (BNB Smart Chain), with spot-only execution controls and simulation before confirmation.";
      } else if (q.includes("spread") || q.includes("gap") || q.includes("premium") || q.includes("discount")) {
        answer="PRONOUS compares a tokenized-stock price with its reference price. A positive spread means the token price is above the reference (premium); a negative spread means it is below (discount).";
      } else if (q.includes("wallet") || q.includes("safe") || q.includes("security")) {
        answer="PRONOUS keeps the MCP layer read-only or preflight-only. It does not request private keys or seed phrases and does not expose transaction signing or broadcast.";
      } else {
        answer="PRONOUS monitors tokenized stocks, compares token/reference prices, explains gaps, applies deterministic guardrails, and prepares execution. Live execution is gated by simulation and explicit user confirmation.";
      }
      return {content:[{type:"text",text:JSON.stringify({
        agent:"PRONOUS",
        mode:"mcp-local-demo",
        answer,
        ticker:ticker ? ticker.toUpperCase() : null,
        fallbackReason:"PRONOUS live API was unavailable; the answer was generated from deterministic local PRONOUS rules."
      },null,2)}]};
    }
  });

  server.registerResource("pronous-overview","pronous://overview",
    {description:"PRONOUS capabilities and safety model",mimeType:"text/plain"},
    async () => ({contents:[{uri:"pronous://overview",text:"PRONOUS watches tokenized stocks, compares token/reference prices, explains gaps, applies deterministic guardrails, and prepares execution. MCP tools are read-only or preflight-only; live transaction broadcast is not exposed."}]})
  );

  return server;
}

serveStdio(createServer);
