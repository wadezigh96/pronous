#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { cmcGlobalContext, cmcCryptoPrice, cmcUnavailable } from "./cmc.mjs";
import { readAgenticWalletStatus, quoteWithAgenticWallet } from "./agentic-wallet.mjs";

const API = process.env.PRONOUS_API_URL || "https://pronous.vercel.app";

const SUPPORTED_PLATFORMS = new Set(["ondo", "bstock", "xstocks"]);

const ASSET_LABELS = {
  NVDA: { ticker: "NVDA", companyName: "NVIDIA" },
  AAPL: { ticker: "AAPL", companyName: "Apple" },
  TSLA: { ticker: "TSLA", companyName: "Tesla" },
  MSFT: { ticker: "MSFT", companyName: "Microsoft" },
  AMZN: { ticker: "AMZN", companyName: "Amazon" },
  GOOGL: { ticker: "GOOGL", companyName: "Alphabet" }
};

function isEvmAddress(value = "") {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value).trim());
}

function isBscNetwork(asset = {}) {
  const network = String(asset.network || "").trim().toUpperCase();
  const chainId = Number(asset.chainId ?? asset.binanceChainId);
  if (Number.isFinite(chainId) && chainId === 56) return true;
  if (network === "BSC" || network === "BNB" || network === "BNB SMART CHAIN") return true;
  if (!network && !Number.isFinite(chainId)) return true;
  return false;
}

/** Local mirror of lib/policy.js buildGuardChecks — keep in sync. */
function buildLocalGuardChecks(asset = {}, params = {}) {
  const amount = Number(params.amount || 0);
  const maxSpend = Number(params.maxSpend || 0);
  const platform = String(asset.platformId || "").toLowerCase();
  const dataQuality = String(asset.dataQuality || "").toLowerCase();
  const shareRatio = Number(asset.shareRatio ?? asset.tokenToShareRatio);
  const demo = params.demo === true || asset.demo === true;
  const venue = String(params.venue || asset.venue || "spot").toLowerCase();

  return [
    { id: "network", label: "BSC mainnet", pass: isBscNetwork(asset) },
    {
      id: "asset",
      label: demo ? "Demo tokenized-stock asset" : "Supported tokenized-stock asset",
      pass: demo
        ? Boolean(asset.ticker && Number(asset.tokenPrice) > 0 && Number(asset.referencePrice) > 0)
        : Boolean(
            asset.ticker &&
              SUPPORTED_PLATFORMS.has(platform) &&
              isEvmAddress(asset.tokenContractAddress)
          )
    },
    {
      id: "spot",
      label: "Spot only",
      pass: venue === "spot" || venue === "" || venue === "market"
    },
    {
      id: "price",
      label: "Token/reference prices available",
      pass: Number(asset.tokenPrice) > 0 && Number(asset.referencePrice) > 0
    },
    {
      id: "share_ratio",
      label: "Token-to-share ratio valid",
      pass: Number.isFinite(shareRatio) && shareRatio > 0
    },
    {
      id: "data_quality",
      label: "Ratio-adjusted market data quality acceptable",
      pass: dataQuality === "ok"
    },
    {
      id: "spend_cap",
      label: "Spend cap",
      pass: amount > 0 && maxSpend > 0 && amount <= maxSpend
    },
    { id: "simulation", label: "Simulation required", pass: false, gate: "simulation" }
  ];
}

function localPreflightStatus(checks = []) {
  const blocking = checks.filter((c) => !c.gate);
  return blocking.every((c) => c.pass) ? "READY_FOR_SIMULATION" : "BLOCKED";
}

function localAsset(ticker) {
  const key = String(ticker || "").trim().toUpperCase();
  const label = ASSET_LABELS[key] || { ticker: key, companyName: "Unknown asset" };
  return {
    demo: true,
    network: "BSC",
    chainId: 56,
    platformId: "unavailable",
    venue: "spot",
    ...label,
    tokenPrice: null,
    referencePrice: null,
    rawSpreadPct: null,
    adjustedSpreadPct: null,
    spreadPct: null,
    shareRatio: null,
    tokenToShareRatio: null,
    dataQuality: "unavailable",
    actionable: false,
    marketStatus: "STALE DEMO REMOVED — NO PRICE FIELDS"
  };
}

function localScan(ticker) {
  const asset = localAsset(ticker);
  return {
    agent: "PRONOUS",
    mode: "unavailable",
    network: "BSC",
    scan: {
      ticker: asset.ticker,
      companyName: asset.companyName,
      tokenPrice: null,
      referencePrice: null,
      rawSpreadPct: null,
      adjustedSpreadPct: null,
      spreadPct: null,
      shareRatio: null,
      dataQuality: "unavailable",
      direction: "DATA_UNAVAILABLE",
      marketStatus: asset.marketStatus,
      assessment: "The live market API failed. No price or divergence is inferred from stale demo values."
    },
    execution: { broadcast: false },
    fallbackReason: "PRONOUS live API unavailable; no price-bearing demo fallback was substituted."
  };
}

function localPreflight(ticker, amount, maxSpend) {
  const asset = localAsset(ticker);
  const checks = buildLocalGuardChecks(asset, { amount, maxSpend, demo: true, venue: "spot" });
  const status = localPreflightStatus(checks);
  return {
    agent: "PRONOUS",
    mode: "unavailable",
    network: "BSC",
    ticker: asset.ticker,
    asset,
    preflight: {
      status,
      amount,
      maxSpend,
      spreadPct: asset.adjustedSpreadPct ?? null,
      rawSpreadPct: asset.rawSpreadPct ?? null,
      adjustedSpreadPct: asset.adjustedSpreadPct ?? null,
      shareRatio: asset.shareRatio ?? null,
      checks,
      next: checks.find((x) => !x.pass)?.id || "simulation"
    },
    broadcast: false,
    fallbackReason:
      "PRONOUS live API unavailable; preflight is blocked because live price data is missing. No transaction was executed."
  };
}

function createServer() {
  const server = new McpServer({ name: "pronous", version: "1.0.0" });
  async function getJSON(path) {
    const response = await fetch(API + path);
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!response.ok) {
      const error = new Error("PRONOUS API " + response.status);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  server.registerTool(
    "market_assets",
    {
      description: "Get live tokenized-stock market assets monitored by PRONOUS. If live API data is unavailable, no price-bearing demo values are substituted.",
      inputSchema: z.object({ ticker: z.string().optional() })
    },
    async ({ ticker }) => {
      try {
        const allAssets = [];
        let offset = 0;
        let pages = 0;
        let meta = null;
        do {
          const page = await getJSON("/api/agent?action=assets&limit=100&offset=" + offset);
          if (page.mode !== "live-data" || !Array.isArray(page.assets)) {
            throw new Error(page.error || "LIVE_ASSET_DATA_UNAVAILABLE");
          }
          if (!meta) meta = page;
          allAssets.push(...page.assets);
          offset = page.pagination?.nextOffset;
          pages += 1;
        } while (offset !== null && offset !== undefined && pages < 10);
        const selected = ticker
          ? allAssets.filter((asset) => String(asset.ticker || "").toUpperCase() === ticker.toUpperCase())
          : allAssets;
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ...(meta || {}),
              assets: selected,
              pagination: { total: selected.length, complete: offset == null && pages <= 10 },
              source: "live PRONOUS RWA feed",
              broadcast: false
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              agent: "PRONOUS",
              mode: "unavailable",
              network: "BSC",
              assets: [],
              error: "LIVE_ASSET_DATA_UNAVAILABLE",
              fallbackReason: "Live API failed or was rate-limited. Stale demo prices were removed; retry later.",
              details: String(error?.message || error),
              broadcast: false
            }, null, 2)
          }]
        };
      }
    }
  );

  server.registerTool(
    "scan_asset",
    {
      description: "Scan one tokenized stock and return its PRONOUS market-gap assessment.",
      inputSchema: z.object({ ticker: z.string().min(1) })
    },
    async ({ ticker }) => {
      const path = "/api/agent?action=scan&ticker=" + encodeURIComponent(ticker.toUpperCase());
      try {
        return { content: [{ type: "text", text: JSON.stringify(await getJSON(path), null, 2) }] };
      } catch {
        return { content: [{ type: "text", text: JSON.stringify(localScan(ticker), null, 2) }] };
      }
    }
  );

  server.registerTool(
    "preflight",
    {
      description:
        "Run deterministic PRONOUS checks for a proposed spot-only spend. Does not execute a transaction.",
      inputSchema: z.object({
        ticker: z.string().min(1),
        amount: z.number().positive(),
        maxSpend: z.number().positive()
      })
    },
    async ({ ticker, amount, maxSpend }) => {
      const path =
        "/api/agent?action=preflight&ticker=" +
        encodeURIComponent(ticker.toUpperCase()) +
        "&amount=" +
        amount +
        "&maxSpend=" +
        maxSpend;
      try {
        return { content: [{ type: "text", text: JSON.stringify(await getJSON(path), null, 2) }] };
      } catch {
        return {
          content: [{ type: "text", text: JSON.stringify(localPreflight(ticker, amount, maxSpend), null, 2) }]
        };
      }
    }
  );

  server.registerTool(
    "cmc_market_context",
    {
      description: "Get official CoinMarketCap market context. Requires CMC_API_KEY. Read-only; no trading.",
      inputSchema: z.object({
        symbol: z
          .string()
          .regex(/^[A-Za-z0-9._-]{1,20}$/)
          .optional()
      })
    },
    async ({ symbol }) => {
      try {
        const global = await cmcGlobalContext();
        const crypto = symbol ? await cmcCryptoPrice(symbol) : null;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  agent: "PRONOUS",
                  source: "CoinMarketCap",
                  mode: "authenticated-read-only",
                  global,
                  crypto,
                  execution: { broadcast: false }
                },
                null,
                2
              )
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  agent: "PRONOUS",
                  source: "CoinMarketCap",
                  ...cmcUnavailable(error),
                  execution: { broadcast: false }
                },
                null,
                2
              )
            }
          ]
        };
      }
    }
  );

  server.registerTool(
    "ask_pronous",
    {
      description:
        "Ask PRONOUS about tokenized stocks, gaps, market hours, BSC, wallet safety or execution flow.",
      inputSchema: z.object({ question: z.string().min(1), ticker: z.string().optional() })
    },
    async ({ question, ticker }) => {
      const query =
        "/api/ask?q=" +
        encodeURIComponent(question) +
        (ticker ? "&ticker=" + encodeURIComponent(ticker.toUpperCase()) : "");
      try {
        const data = await getJSON(query);
        return { content: [{ type: "text", text: data.answer || JSON.stringify(data, null, 2) }] };
      } catch {
        const q = question.toLowerCase();
        let answer;
        if (q.includes("what is pronous") || q.includes("what's pronous") || q.includes("about pronous"))
          answer =
            "PRONOUS is a tokenized-stock market desk for BSC that watches token/reference price gaps, explains market conditions, applies deterministic guardrails, and prepares execution intents. Execution remains user-confirmed; this MCP interface does not sign or broadcast transactions.";
        else if (q.includes("bsc") || q.includes("bnb"))
          answer =
            "PRONOUS is designed for tokenized-stock workflows on BSC (BNB Smart Chain), with spot-only execution controls and simulation before confirmation.";
        else if (q.includes("spread") || q.includes("gap") || q.includes("premium") || q.includes("discount"))
          answer =
            "PRONOUS compares a tokenized-stock price with its reference price. A positive spread means the token price is above the reference (premium); a negative spread means it is below (discount).";
        else if (q.includes("wallet") || q.includes("safe") || q.includes("security"))
          answer =
            "PRONOUS keeps the MCP layer read-only or preflight-only. It does not request private keys or seed phrases and does not expose transaction signing or broadcast.";
        else
          answer =
            "PRONOUS monitors tokenized stocks, compares token/reference prices, explains gaps, applies deterministic guardrails, and prepares execution. Live execution is gated by simulation and explicit user confirmation.";
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  agent: "PRONOUS",
                  mode: "mcp-local-demo",
                  answer,
                  ticker: ticker ? ticker.toUpperCase() : null,
                  fallbackReason:
                    "PRONOUS live API was unavailable; the answer was generated from deterministic local PRONOUS rules."
                },
                null,
                2
              )
            }
          ]
        };
      }
    }
  );

  server.registerTool(
    "agentic_wallet_status",
    {
      description: "Read-only Binance Agentic Wallet status, supported chains, address and balances through the official baw CLI.",
      inputSchema: z.object({})
    },
    async () => {
      try {
        return { content: [{ type: "text", text: JSON.stringify(await readAgenticWalletStatus(), null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: JSON.stringify({
          agent: "PRONOUS",
          mode: "unavailable",
          error: String(error?.message || "AGENTIC_WALLET_UNAVAILABLE"),
          execution: { broadcast: false, tradeExecuted: false }
        }, null, 2) }] };
      }
    }
  );

  server.registerTool(
    "agentic_wallet_quote",
    {
      description: "Get a BSC mainnet quote preview using Binance Agentic Wallet after PRONOUS live-data, market-state and spend-cap checks. Quote only; not a trade.",
      inputSchema: z.object({
        ticker: z.string().min(1).max(20),
        amount: z.number().positive(),
        maxSpend: z.number().positive()
      })
    },
    async ({ ticker, amount, maxSpend }) => {
      try {
        return { content: [{ type: "text", text: JSON.stringify(
          await quoteWithAgenticWallet({ ticker, amount, maxSpend }), null, 2
        ) }] };
      } catch (error) {
        return { content: [{ type: "text", text: JSON.stringify({
          agent: "PRONOUS",
          mode: "blocked-or-unavailable",
          ticker: String(ticker || "").toUpperCase(),
          error: String(error?.message || "AGENTIC_WALLET_QUOTE_UNAVAILABLE"),
          execution: { broadcast: false, tradeExecuted: false }
        }, null, 2) }] };
      }
    }
  );

  server.registerResource(
    "pronous-overview",
    "pronous://overview",
    { description: "PRONOUS capabilities and safety model", mimeType: "text/plain" },
    async () => ({
      contents: [
        {
          uri: "pronous://overview",
          text: "PRONOUS watches tokenized stocks, compares token/reference prices, explains gaps, applies deterministic guardrails, and prepares execution. MCP tools are read-only or preflight-only; live transaction broadcast is not exposed."
        }
      ]
    })
  );
  return server;
}

serveStdio(createServer);
