import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const onchain = readFileSync("desk-onchain.js", "utf8");
const css = readFileSync("desk.css", "utf8");
const api = readFileSync("api/onchain.js", "utf8");
const agent = readFileSync("api/agent.js", "utf8");
const app = readFileSync("desk-app.js", "utf8");
const walletState = readFileSync("lib/wallet-state.js", "utf8");
const walletConnect = readFileSync("wallet-connect.js", "utf8");
const bridge = readFileSync("desk-bridge.js", "utf8");
const gates = readFileSync("lib/execution-gates.js", "utf8");
const txPolicy = readFileSync("lib/tx-policy.js", "utf8");

test("on-chain script loads after desk app", () => assert.ok(html.indexOf('/desk-app.js') < html.indexOf('/desk-onchain.js')));
test("on-chain auto renderer exists", () => { assert.match(onchain, /async function loadOnchain\(asset\)/); assert.match(onchain, /autoLoadOnchain\(\)/); assert.match(onchain, /window\.loadOnchain\s*=\s*loadOnchain/); assert.match(onchain, /\/api\/onchain\?chain=56&token=/); });
test("on-chain density styles exist", () => { assert.match(css, /PRONOUS ON-CHAIN DENSITY REPAIR/); assert.match(css, /\.onchain-kpis/); assert.match(css, /\.onchain-columns/); });
test("on-chain API remains BSC-only", () => { assert.match(api, /Only BSC mainnet is supported/); assert.match(api, /isAddress\(token\)/); });
test("CMC supplies live BSC on-chain intelligence", () => {
  assert.match(api, /CoinMarketCap DEX/);
  assert.match(api, /CMC_BASE/);
  assert.match(api, /\/v1\/dex\/token/);
  assert.match(api, /\/v1\/dex\/token\/price/);
  assert.match(api, /\/v1\/dex\/token\/pools/);
  assert.match(api, /\/v1\/dex\/tokens\/transactions/);
  assert.match(api, /\/v1\/dex\/token-liquidity\/query/);
  assert.match(api, /network_slug: "bsc"/);
  assert.match(api, /CMC_ONCHAIN_UNAVAILABLE/);
});

test("agent execution API rejects non-GET and foreign origins", () => {
  assert.match(agent, /function requireAgentOrigin\(req, res\)/);
  assert.match(agent, /if \(origin === AGENT_ALLOWED_ORIGIN\) return true/);
  assert.match(agent, /function requireAgentGet\(req, res\)/);
  assert.match(agent, /\["quote", "quoteBuild", "build", "simulateTx"\]/);
  assert.match(agent, /METHOD_NOT_ALLOWED/);
  assert.match(agent, /FORBIDDEN_ORIGIN/);
});

test("execution flow requires simulation and confirmation", () => {
  assert.match(app, /if\(!window\.__pronousSimulated\)/);
  assert.match(app, /window\.__pronousConfirmed=true/);
  assert.match(app, /window\.__pronousParamsHash=await hashExecutionValue/);
  assert.match(app, /window\.__pronousSimTxHash=window\.__pronousParamsHash/);
  assert.match(onchain, /if \(!window\.__pronousConfirmed\)/);
  assert.match(onchain, /currentBinding !== window\.__pronousSimTxHash/);
  assert.match(onchain, /gates\.canExecute/);
});

test("wallet source state prevents cross-source overwrite", () => {
  assert.match(walletState, /current\.source && current\.source !== state\.source/);
  assert.match(walletState, /SOURCE_CHANGED/);
  assert.match(walletState, /current\.source !== source/);
  assert.match(walletState, /SOURCE_NOT_ACTIVE/);
});

test("broadcast transaction policy remains BSC router and selector restricted", () => {
  assert.match(txPolicy, /Number\(chainId\) !== 56/);
  assert.match(txPolicy, /TX_TARGET_NOT_ALLOWLISTED/);
  assert.match(txPolicy, /TX_SELECTOR_NOT_ALLOWLISTED/);
  assert.match(txPolicy, /NONZERO_NATIVE_VALUE_BLOCKED/);
});

test("POA reader receives the current proof object", () => {
  assert.match(app, /currentPOA=j\.proof;window\.currentPOA=j\.proof/);
});

test("wallet integration restores and synchronizes the active BSC wallet", () => {
  assert.match(walletConnect, /restoreInjectedWallet\(\)/);
  assert.match(walletConnect, /eth_accounts/);
  assert.match(walletConnect, /setActiveWallet\('injected'/);
  assert.match(walletConnect, /getChainId:/);
  assert.match(walletConnect, /getSource:/);
  assert.match(app, /await api\.sync\(\)/);
});

test("market signal is sourced from live assets and tabs are functional", () => {
  assert.match(bridge, /function renderSignalList\(\)/);
  assert.match(bridge, /function bindSignalTabs\(\)/);
  assert.match(bridge, /window\.__pronousSignalTab/);
  assert.match(bridge, /dataQuality !== 'unreliable'/);
  assert.match(html, /Live token\/reference divergence/);
  assert.doesNotMatch(html, /AI scanning 1,248 assets/);
});

test("POA initial UI does not claim fabricated confirmation", () => {
  assert.match(html, /AWAITING EVIDENCE/);
  assert.match(html, /No session proof/);
  assert.doesNotMatch(html, /Signature Verified/);
  assert.doesNotMatch(html, /On-chain Confirmed/);
});
