import test from "node:test";
import assert from "node:assert/strict";

const { validateCandleParams, normalizeCandles } = await import("../lib/candles.js");

const TOKEN = "0x02fca66c1d1afb4e2a7884261eb00f63598a7436";

test("valid candle parameters are accepted", () => {
  assert.equal(validateCandleParams({ token: TOKEN, bar: "1h", limit: "10" }), null);
});

test("missing or invalid token is rejected", () => {
  assert.equal(validateCandleParams({ token: "", bar: "1h", limit: "10" }), "Invalid token address");
  assert.equal(validateCandleParams({ token: "NVDA", bar: "1h", limit: "10" }), "Invalid token address");
});

test("unsupported bar is rejected", () => {
  assert.equal(validateCandleParams({ token: TOKEN, bar: "1x", limit: "10" }), "Invalid bar");
});

test("limit is constrained to 1..500", () => {
  assert.equal(validateCandleParams({ token: TOKEN, bar: "1h", limit: "0" }), "Invalid limit");
  assert.equal(validateCandleParams({ token: TOKEN, bar: "1h", limit: "501" }), "Invalid limit");
  assert.equal(validateCandleParams({ token: TOKEN, bar: "1h", limit: "10.5" }), "Invalid limit");
});

test("upstream array candles are normalized to OHLC records", () => {
  const candles = normalizeCandles({
    code: 0,
    data: [[228.8, 232.8, 228.2, 229.3, 123.4, 1790647200000, 107]]
  });
  assert.deepEqual(candles, [{
    open: 228.8,
    high: 232.8,
    low: 228.2,
    close: 229.3,
    volume: 123.4,
    time: 1790647200000,
    trades: 107
  }]);
});

test("null upstream response is safely treated as failure", () => {
  assert.equal(normalizeCandles(null), null);
});

test("upstream non-zero code is safely treated as failure", () => {
  assert.equal(normalizeCandles({ code: -1000, data: [] }), null);
});

test("missing candle data returns an empty array instead of throwing", () => {
  assert.deepEqual(normalizeCandles({ code: 0 }), []);
});
