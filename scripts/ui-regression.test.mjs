import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const html = read("index.html");
const wallet = read("wallet-connect.js");
const app = read("desk-app.js");
const bridge = read("desk-bridge.js");
const live = read("desk-live.js");
const onchain = read("desk-onchain.js");
const agentApi = read("api/agent.js");

test("desk loads transaction gate and policy modules before execution UI", () => {
  const gates = html.indexOf('src="/lib/execution-gates.js"');
  const policy = html.indexOf('src="/lib/tx-policy.js"');
  const appIndex = html.indexOf('src="/desk-app.js"');
  assert.ok(gates >= 0 && policy >= 0 && appIndex >= 0);
  assert.ok(gates < appIndex);
  assert.ok(policy < appIndex);
  for (const script of [
    "/desk-exec.js",
    "/desk-parity.js",
    "/cmc-radar.js",
    "/wallet-connect.js"
  ]) {
    assert.ok(html.includes('src="' + script + '"'), "missing desk module: " + script);
  }
  assert.ok(existsSync("lib/execution-gates.js"));
  assert.ok(existsSync("lib/tx-policy.js"));
});

test("wallet chooser renders real Browser and Privy choices", () => {
  assert.ok(html.includes("Browser wallet"));
  assert.ok(html.includes("Email / Google (Privy)"));
  assert.match(wallet, /function renderWalletChooser\s*\(/);
  assert.match(wallet, /window\.connectBrowserWallet\(wallet\.provider\)/);
  assert.match(wallet, /window\.connectPrivyWallet\(\)/);
  assert.match(wallet, /setAttribute\('aria-hidden', 'false'\)/);
  assert.match(wallet, /normalizeChainId\(activeWallet\.chainId\) !== 56/);
  assert.match(wallet, /WALLET CHAIN SWITCH FAILED/);
});

test("simulation cannot pass without live build, allowlisted tx and successful BSC eth_call", () => {
  assert.match(app, /built\.mode!=='live-quote-build'/);
  assert.match(app, /const policy=window\.PRONOUS_TX_POLICY/);
  assert.match(app, /policy\.validateBroadcastTx\(tx,56\)/);
  assert.match(app, /action:'simulateTx'/);
  assert.match(app, /simResult\.status!=='PASSED'/);
  assert.match(app, /simResult\.simulation\.status!=='PASSED'/);
  assert.match(app, /window\.__pronousSimulated=true/);
  assert.ok(app.indexOf("simResult.simulation.status!=='PASSED'") < app.indexOf("window.__pronousSimulated=true"));
  assert.match(agentApi, /status:simulation\.status,network:"BSC",chainId:56[^}]*broadcast:false/);
  assert.match(agentApi, /status:"FAILED",reason:e\.message/);
});

test("simulation blocks demo and off-hours or unverified assets", () => {
  assert.match(app, /built\.mode!=='live-quote-build'/);
  assert.match(app, /asset\.demo===true/);
  assert.match(app, /asset\.dataQuality!=='ok'\|\|asset\.actionable!==true/);
  assert.match(app, /explicitlyOpen/);
  assert.match(app, /explicitlyClosed/);
  assert.match(app, /ackOffHours:String\(Boolean\(document\.getElementById\('ackOffHours'\)\?\.checked\)\)/);
  assert.match(html, /id="ackOffHours"/);
  assert.match(app, /Simulation blocked:/);
});

test("dashboard reports live feed health honestly and clears stale assets on error", () => {
  assert.doesNotMatch(html, /class="tag live-tag">System Online/);
  assert.match(html, /id="systemStatus" class="tag">CHECKING RWA FEED/);
  assert.match(html, /id="studioStatus" class="tag">NOT DEPLOYED/);
  assert.match(live, /RWA FEED LIVE/);
  assert.match(live, /RWA FEED UNAVAILABLE/);
  assert.match(live, /PRONOUS_SET_MARKET_ASSETS\(\[\]\)/);
  assert.match(live, /No static\/demo prices are substituted/);
});

test("market filters use ratio-adjusted spreads and measured 24h volume only", () => {
  assert.match(bridge, /const gap = a\.adjustedSpreadPct \?\? a\.spreadPct/);
  assert.match(bridge, /a\.volume24H \?\? a\.volume24h/);
  assert.doesNotMatch(bridge, /Number\(b\.tokenPrice\s*\|\|\s*0\)/);
  assert.match(bridge, /measured 24-hour volume/);
  assert.match(bridge, /No verified live assets match this filter/);
  assert.match(app, /No valid ratio-adjusted spread data available/);
});

test("on-chain tabs and formerly decorative desk actions now invoke real functions", () => {
  assert.match(onchain, /window\.setOnchainTab = setOnchainTab/);
  assert.match(onchain, /window\.refreshSelectedOnchain/);
  assert.match(onchain, /RECENT TRANSACTIONS/);
  assert.match(onchain, /TOP HOLDERS/);
  assert.match(onchain, /BSC TOKEN CONTRACT/);
  assert.match(html, /onclick="if\(window\.loadRwaParity\)loadRwaParity/);
  assert.match(html, /onclick="if\(window\.loadMarket\)loadMarket\(\{silent:false\}\)"/);
  assert.match(html, /onclick="if\(window\.refreshSelectedOnchain\)refreshSelectedOnchain\(\)"/);
  assert.match(html, /Compare RWA platforms/);
  assert.match(html, /Read selected on-chain data/);
});

test("unsupported chart depth/indicators and missing candle history are not faked", () => {
  assert.match(html, /<button[^>]*disabled[^>]*>Depth unavailable<\/button>/);
  assert.match(html, /<button[^>]*disabled[^>]*>Indicators unavailable<\/button>/);
  const charts = read("desk-charts.js");
  const start = charts.indexOf("async function loadAssetChart");
  const end = charts.indexOf("function redrawVisibleCharts", start);
  assert.ok(start >= 0 && end > start);
  const loader = charts.slice(start, end);
  assert.match(loader, /LIVE CANDLES UNAVAILABLE/);
  assert.match(loader, /drawChartUnavailable/);
  assert.doesNotMatch(loader, /fallback=Number\.isFinite\(tokenPx\)[\s\S]*drawLineChart\(x,fallback/);
  assert.doesNotMatch(loader, /source='SNAPSHOT'/);
});
