import test from "node:test";
import assert from "node:assert/strict";
import { cmcCryptoPrice, cmcGlobalContext, cmcUnavailable } from "../mcp/cmc.mjs";

test("CMC adapter refuses requests without an API key", async () => {
  const previous = process.env.CMC_API_KEY;
  delete process.env.CMC_API_KEY;
  await assert.rejects(() => cmcGlobalContext(), /CMC_API_KEY_NOT_CONFIGURED/);
  if (previous !== undefined) process.env.CMC_API_KEY = previous;
});

test("CMC symbol validation rejects malformed symbols", async () => {
  process.env.CMC_API_KEY = "test-only-not-a-real-key";
  await assert.rejects(() => cmcCryptoPrice("bad symbol with spaces"), /INVALID_CMC_SYMBOL/);
});

test("CMC unavailable response never exposes the API key", () => {
  const result = cmcUnavailable(Object.assign(new Error("request failed"), { code: "CMC_TEST" }));
  assert.equal(result.available, false);
  assert.equal(result.error, "CMC_TEST");
  assert.equal(JSON.stringify(result).includes("test-only-not-a-real-key"), false);
});
