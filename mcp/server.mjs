import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

const API = process.env.PRONOUS_API_URL || "https://pronous.vercel.app";

function createServer() {
  const server = new McpServer({ name: "pronous", version: "1.0.0" });

  async function getJSON(path) {
    const response = await fetch(API + path);
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw:text }; }
    if (!response.ok) throw new Error("PRONOUS API " + response.status);
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
  }, async ({ticker,amount,maxSpend}) => ({
    content:[{type:"text",text:JSON.stringify(await getJSON("/api/agent?action=preflight&ticker="+encodeURIComponent(ticker.toUpperCase())+"&amount="+amount+"&maxSpend="+maxSpend),null,2)}]
  }));

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
