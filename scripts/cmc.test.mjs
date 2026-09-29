import test from "node:test";
import assert from "node:assert/strict";
import { cmcCryptoPrice, cmcGlobalContext, cmcUnavailable } from "../mcp/cmc.mjs";

function mockFetch(responseBody, status = 200) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: status >= 200 && status < 300,
      status,
      async text() { return JSON.stringify(responseBody); }
    };
  };
  return { calls, restore: () => { globalThis.fetch = previous; } };
}

function mockSequence(responses) {
  const previous = globalThis.fetch;
  const calls = [];
  let index = 0;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const current = responses[Math.min(index++, responses.length - 1)];
    return {
      ok: current.status >= 200 && current.status < 300,
      status: current.status,
      headers: { get(name) { return name.toLowerCase() === "retry-after" ? current.retryAfter || null : null; } },
      async text() { return JSON.stringify(current.body); }
    };
  };
  return { calls, restore: () => { globalThis.fetch = previous; } };
}

test("CMC keyless mode uses public-api without an API key", async () => {
  const previous = process.env.CMC_API_KEY;
  delete process.env.CMC_API_KEY;
  const mock = mockFetch({
    status: { timestamp: "2026-09-29T00:00:00Z" },
    data: { quote: { USD: { total_market_cap: 123, total_volume_24h: 45 } }, btc_dominance: 50, eth_dominance: 10 }
  });
  try {
    const result = await cmcGlobalContext();
    assert.equal(result.keyless, true);
    assert.equal(result.authenticated, false);
    assert.match(mock.calls[0].url, /pro-api\.coinmarketcap\.com\/public-api\/v1\/global-metrics\/quotes\/latest/);
    assert.equal(mock.calls[0].options.headers["X-CMC_PRO_API_KEY"], undefined);
  } finally {
    mock.restore();
    if (previous !== undefined) process.env.CMC_API_KEY = previous;
  }
});

test("CMC authenticated mode sends the API key only as a header", async () => {
  const previous = process.env.CMC_API_KEY;
  process.env.CMC_API_KEY = "test-only-not-a-real-key";
  const mock = mockFetch({
    data: [{ symbol: "BTC", name: "Bitcoin", quotes: [{ price: 100, market_cap: 200, volume_24h: 3, percent_change_24h: 1, last_updated: "2026-09-29T00:00:00Z" }] }]
  });
  try {
    const result = await cmcCryptoPrice("btc");
    assert.equal(result.authenticated, true);
    assert.equal(result.keyless, false);
    assert.equal(mock.calls[0].options.headers["X-CMC_PRO_API_KEY"], "test-only-not-a-real-key");
    assert.equal(mock.calls[0].url.includes("test-only-not-a-real-key"), false);
  } finally {
    mock.restore();
    if (previous !== undefined) process.env.CMC_API_KEY = previous;
    else delete process.env.CMC_API_KEY;
  }
});

test("CMC retries transient rate limits and succeeds", async () => {
  const previous = process.env.CMC_API_KEY;
  delete process.env.CMC_API_KEY;
  const mock = mockSequence([
    { status: 429, body: { status: { error_code: 1008, error_message: "rate limited" } } },
    { status: 200, body: { data: { quote: { USD: { total_market_cap: 123 } } }, status: { error_code: 0 } } }
  ]);
  try {
    const result = await cmcGlobalContext();
    assert.equal(result.totalMarketCapUsd, 123);
    assert.equal(mock.calls.length, 2);
  } finally {
    mock.restore();
    if (previous !== undefined) process.env.CMC_API_KEY = previous;
  }
});

test("CMC symbol validation rejects malformed symbols", async () => {
  const previous = process.env.CMC_API_KEY;
  process.env.CMC_API_KEY = "test-only-not-a-real-key";
  try {
    await assert.rejects(() => cmcCryptoPrice("bad symbol with spaces"), /INVALID_CMC_SYMBOL/);
  } finally {
    if (previous !== undefined) process.env.CMC_API_KEY = previous;
    else delete process.env.CMC_API_KEY;
  }
});

test("CMC unavailable response never exposes the API key", () => {
  const result = cmcUnavailable(Object.assign(new Error("request failed"), { code: "CMC_TEST" }));
  assert.equal(result.available, false);
  assert.equal(result.error, "CMC_TEST");
  assert.equal(JSON.stringify(result).includes("test-only-not-a-real-key"), false);
});
