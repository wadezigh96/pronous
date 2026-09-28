import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("HTTP policy requires an explicit production origin", () => {
  const s = read("lib/http-policy.js");
  assert.match(s, /ALLOWED_ORIGIN/);
  assert.match(s, /origin === ALLOWED_ORIGIN/);
  assert.match(s, /requireSameOrigin/);
  assert.doesNotMatch(s, /host \? `https:\/\/\$\{host\}/);
});

test("protected market APIs are GET-only and same-origin", () => {
  for (const file of ["api/agent.js", "api/onchain.js", "api/candles.js"]) {
    const s = read(file);
    assert.match(s, /METHOD_NOT_ALLOWED/);
    assert.match(s, /requireSameOrigin/);
    assert.match(s, /AbortSignal\.timeout\(8000\)/);
  }
});

test("POA creation uses POST body and rejects method downgrade", () => {
  const api = read("api/poa.js");
  const desk = read("desk-onchain.js");
  assert.match(api, /action === "create"/);
  assert.match(api, /req\.method !== "POST"/);
  assert.match(api, /req\.on\("data"/);
  assert.match(desk, /method: "POST"/);
  assert.doesNotMatch(desk, /\/api\/poa\?action=create&proof=/);
});

test("execution client keeps final simulation before wallet broadcast", () => {
  const s = read("desk-onchain.js");
  const sim = s.indexOf('"/api/agent?action=simulateTx');
  const send = s.indexOf('api.request("eth_sendTransaction"');
  assert.ok(sim >= 0 && send >= 0 && sim < send);
  assert.match(s, /window\.__pronousConfirmed/);
});
