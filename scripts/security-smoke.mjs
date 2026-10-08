import assert from "node:assert/strict";
import fs from "node:fs";

const policy = fs.readFileSync("lib/http-policy.js", "utf8");
const portfolio = fs.readFileSync("api/portfolio.js", "utf8");
const trade = fs.readFileSync("api/trade.js", "utf8");
const agent = fs.readFileSync("api/agent.js", "utf8");
const utilities = fs.readFileSync("utilities.html", "utf8");

assert.match(policy, /X-Content-Type-Options/);
assert.match(policy, /Cache-Control/);
assert.match(policy, /RATE_LIMIT/);
assert.match(portfolio, /FORBIDDEN_ORIGIN/);
assert.match(portfolio, /BSC_RPC_HOST_NOT_ALLOWED/);
assert.match(portfolio, /BSC_RPC_NON_JSON/);
assert.match(portfolio, /PORTFOLIO_LOOKUP_FAILED/);
assert.doesNotMatch(portfolio, /privateKey|private_key|WALLET_PASSWORD/i);
assert.match(trade, /QUERY_CREDENTIALS_NOT_ALLOWED/);
assert.match(trade, /FORBIDDEN_ORIGIN/);
assert.match(agent, /BSC_RPC_HOST_NOT_ALLOWED/);
assert.doesNotMatch(agent, /console\.log\([^)]*API_(KEY|SECRET)/i);

console.log("security-smoke: PASS");
