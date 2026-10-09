import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const agentHandler = require("../api/agent.js");
const { buildPreflight, evaluateLoop } = agentHandler.__testables;

const closedNvda = {
  ticker: "NVDA",
  platformId: "ondo",
  tokenContractAddress: "0x1111111111111111111111111111111111111111",
  network: "BSC",
  tokenPrice: 101,
  referencePrice: 100,
  shareRatio: 1,
  tokenToShareRatio: 1,
  adjustedSpreadPct: 1,
  dataQuality: "ok",
  actionable: false,
  marketStatus: "postmarket",
  openState: true
};

test("API preflight keeps off-hours as a non-blocking ACK_REQUIRED warning until acknowledged", () => {
  const noAck = buildPreflight(closedNvda, { amount: 1, maxSpend: 2, ackOffHours: false });
  assert.equal(noAck.status, "READY_FOR_SIMULATION");
  assert.equal(noAck.warning, "ACK_REQUIRED");
  assert.equal(noAck.signal, "OFF_HOURS_DRIFT");
  assert.equal(noAck.actionable, false);
  assert.match(noAck.referenceWarning, /reference price may be stale/i);
  assert.equal(noAck.checks.some((check) => check.id === "market_session" && !check.pass), false);

  const acked = buildPreflight(closedNvda, { amount: 1, maxSpend: 2, ackOffHours: true });
  assert.equal(acked.status, "READY_FOR_SIMULATION");
  assert.equal(acked.warning, null);
  assert.equal(acked.ackOffHours, true);
  assert.equal(acked.signal, "OFF_HOURS_DRIFT");
  assert.equal(acked.actionable, false);
  assert.match(acked.referenceWarning, /reference price may be stale/i);
});

test("automatic loop remains blocked off-hours even if user preflight can acknowledge the warning", () => {
  const result = evaluateLoop(closedNvda, { fresh: true, simulated: true, confirmed: true });
  assert.equal(result.status, "BLOCK");
  assert.equal(result.checks.find((check) => check.name === "market_session").pass, false);
  assert.equal(result.signal, "OFF_HOURS_DRIFT");
  assert.equal(result.actionable, false);
});

test("API routes pass the acknowledgement flag and block quote-build when it is missing", () => {
  const source = readFileSync("api/agent.js", "utf8");
  assert.match(source, /ackOffHours=url\.searchParams\.get\("ackOffHours"\)==="true"/);
  assert.match(source, /if\(preflight\.warning==="ACK_REQUIRED"\) return res\.status\(409\)\.json\(\{error:"OFF_HOURS_ACK_REQUIRED"/);
  assert.match(source, /if\(marketIsClosed\(asset\)&&!ackOffHours\) return res\.status\(409\)\.json\(\{error:"OFF_HOURS_ACK_REQUIRED"/);
  assert.match(source, /preflight:buildPreflight/);
});
