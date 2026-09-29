import test from "node:test";
import assert from "node:assert/strict";

process.env.BINANCE_WEB3_API_KEY = "fixture-key";
process.env.BINANCE_WEB3_API_SECRET = "fixture-value";
process.env.BINANCE_WEB3_SIGN_ALGO = "HMAC_SHA256";

const transport = await import("../lib/binance-web3.js");

test("buildRequestPath encodes query parameters", () => {
  assert.equal(transport.buildRequestPath("/api/test", { token: "0xabc", bar: "1h", limit: 72 }), "/api/test?token=0xabc&bar=1h&limit=72");
});

test("signedGet sends authenticated headers and timeout", async () => {
  const previous = global.fetch;
  let seen;
  global.fetch = async (url, options) => {
    seen = { url: String(url), options };
    return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ code: 0, data: [{ ok: true }] }) };
  };
  try {
    const result = await transport.signedGet("/api/test", { token: "0xabc" });
    assert.equal(result.data[0].ok, true);
    assert.match(seen.url, /web3\.binance\.com\/build\/api\/test\?token=0xabc/);
    assert.equal(seen.options.headers["X-OC-APIKEY"], "fixture-key");
    assert.ok(seen.options.headers["X-OC-SIGN"]);
    assert.ok(seen.options.signal);
  } finally {
    global.fetch = previous;
  }
});

test("non JSON upstream is normalized", async () => {
  const previous = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, headers: { get: () => "text/plain" }, json: async () => ({}) });
  try {
    await assert.rejects(() => transport.signedGet("/api/test"), (error) => error.status === 502 && error.message === "UPSTREAM_NON_JSON");
  } finally {
    global.fetch = previous;
  }
});

test("unsupported signing algorithm is rejected", async () => {
  const previous = process.env.BINANCE_WEB3_SIGN_ALGO;
  process.env.BINANCE_WEB3_SIGN_ALGO = "NOPE";
  try {
    await assert.rejects(() => transport.signedGet("/api/test"), /UNSUPPORTED_SIGN_ALGO/);
  } finally {
    process.env.BINANCE_WEB3_SIGN_ALGO = previous;
  }
});
