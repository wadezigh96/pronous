import test from "node:test";
import assert from "node:assert/strict";
import {
  extractTicker,
  fetchPronousSnapshot,
  formatResearchFacts,
} from "./pronousResearch.js";

test("extractTicker finds stock tickers and ignores common chain acronyms", () => {
  assert.equal(extractTicker("Please scan ticker: NVDA"), "NVDA");
  assert.equal(extractTicker("Compare AAPL against MSFT"), "AAPL");
  assert.equal(extractTicker("Explain BSC and USDT market hours"), null);
});

test("unavailable HTTP and demo responses are never promoted to live data", async () => {
  const httpError = await fetchPronousSnapshot("NVDA", {
    fetchImpl: async () => new Response("no", { status: 503 }),
  });
  assert.equal(httpError.status, "UNAVAILABLE");
  assert.equal(httpError.reason, "PRONOUS_HTTP_503");

  const demo = await fetchPronousSnapshot("NVDA", {
    fetchImpl: async () => Response.json({ mode: "demo", asset: {} }),
  });
  assert.equal(demo.status, "UNAVAILABLE");
  assert.equal(demo.reason, "LIVE_RWA_DATA_NOT_VERIFIED");
});

test("live snapshot requires supported platform, address, quality and positive prices/ratio", async () => {
  const body = {
    mode: "live-data",
    asset: {
      ticker: "NVDA", companyName: "NVIDIA", platformId: "ondo",
      tokenSymbol: "NVDA",
      tokenContractAddress: "0x1234567890123456789012345678901234567890",
      tokenPrice: "1.23", referencePrice: "123", shareRatio: "0.01",
      adjustedSpreadPct: 0, marketStatus: "open", dataQuality: "ok",
      nextOpenTime: null,
    },
  };
  const snapshot = await fetchPronousSnapshot("NVDA", {
    fetchImpl: async () => Response.json(body),
  });
  assert.equal(snapshot.status, "VERIFIED_LIVE");
  assert.equal(snapshot.asset?.actionable, false);
  assert.equal(snapshot.asset?.shareRatio, 0.01);
  assert.equal(JSON.parse(formatResearchFacts(snapshot)).execution.broadcast, false);

  const unsupported = await fetchPronousSnapshot("NVDA", {
    fetchImpl: async () => Response.json({
      mode: "live-data",
      asset: { ...body.asset, platformId: "unknown" },
    }),
  });
  assert.equal(unsupported.status, "UNAVAILABLE");
  assert.equal(unsupported.reason, "UNSUPPORTED_RWA_PLATFORM");
});

test("off-hours data remains explicitly non-actionable", async () => {
  const snapshot = await fetchPronousSnapshot("NVDA", {
    fetchImpl: async () => Response.json({
      mode: "live-data",
      asset: {
        ticker: "NVDA", platformId: "bstock",
        tokenContractAddress: "0x1234567890123456789012345678901234567890",
        tokenPrice: "1", referencePrice: "100", shareRatio: "0.01",
        marketStatus: "offhours", dataQuality: "ok",
      },
    }),
  });
  assert.equal(snapshot.asset?.marketClosed, true);
  assert.equal(snapshot.asset?.actionable, false);
  assert.match(snapshot.asset?.referenceWarning ?? "", /non-actionable/);
});
