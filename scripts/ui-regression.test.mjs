import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const onchain = readFileSync("desk-onchain.js", "utf8");
const css = readFileSync("desk.css", "utf8");
const api = readFileSync("api/onchain.js", "utf8");
const agent = readFileSync("api/agent.js", "utf8");
const cmcRadarApi = readFileSync("api/cmc-radar.js", "utf8");
const cmcRadar = readFileSync("cmc-radar.js", "utf8");
const app = readFileSync("desk-app.js", "utf8");
const walletState = readFileSync("lib/wallet-state.js", "utf8");
const walletConnect = readFileSync("wallet-connect.js", "utf8");
const bridge = readFileSync("desk-bridge.js", "utf8");
const live = readFileSync("desk-live.js", "utf8");
const gates = readFileSync("lib/execution-gates.js", "utf8");
const txPolicy = readFileSync("lib/tx-policy.js", "utf8");
const market = readFileSync("lib/market.js", "utf8");

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
test("CMC RWA radar exposes live underlying tokens", () => {
  assert.match(cmcRadarApi, /\/v5\/real-world-assets\/assets\/list/);
  assert.match(cmcRadarApi, /\/v5\/real-world-assets\/quotes\/latest/);
  assert.match(cmcRadarApi, /function flattenRwaTokens\(rows\)/);
  assert.match(cmcRadarApi, /issuerId: token\.issuerId/);
  assert.match(cmcRadarApi, /issuerName: token\.issuerName/);
  assert.match(cmcRadarApi, /rwaTokens/);
  assert.match(cmcRadar, /cmcCache\.rwaTokens \|\| \[\]/);
  assert.match(cmcRadar, /Tokenisation/);
});

test("agent execution API rejects non-GET and foreign origins", () => {
  assert.match(agent, /function requireAgentOrigin\(req, res\)/);
  assert.match(agent, /if \(origin === AGENT_ALLOWED_ORIGIN\) return true/);
  assert.match(agent, /function requireAgentGet\(req, res\)/);
  assert.match(agent, /\["quote", "quoteBuild", "build", "simulateTx", "pancakeQuote"\]/);
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

test("legacy simulation requests are bound to the active BSC wallet", () => {
  assert.match(walletState, /__pronousWalletFetchGuard/);
  assert.match(walletState, /action=simulateTx/);
  assert.match(walletState, /getAddress/);
  assert.match(walletState, /userWalletAddress=/);
  assert.match(walletState, /normalizeChainId\(chainId\) === 56/);
  assert.match(agent, /userWalletAddress is required for simulation/);
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

test("POA anchor gate uses the resolved wallet chain", () => {
  assert.match(app, /const\s*\{\s*api\s*,\s*address\s*,\s*chainId\s*\}\s*=\s*await resolveWalletForAnchor\(\)/);
  assert.match(app, /Number\(chainId \|\| walletChainId \|\| 0\)!==56/);
});

test("wallet integration restores and synchronizes the active BSC wallet", () => {
  assert.match(walletConnect, /restoreInjectedWallet\(\)/);
  assert.match(walletConnect, /eth_accounts/);
  assert.match(walletConnect, /setActiveWallet\('injected'/);
  assert.match(walletConnect, /getChainId:/);
  assert.match(walletConnect, /getSource:/);
  assert.match(walletConnect, /pronous:wallet-replay-request/);
  assert.match(app, /await api\.sync\(\)/);
  assert.match(app, /syncDeskWallet/);
  assert.match(onchain, /async function readWallet\(\)/);
  assert.match(onchain, /await readWallet\(\)/);
  assert.match(onchain, /!current\.address \|\| !current\.api/);
});

test("desk charts do not preload execution scripts ahead of the wallet module", () => {
  const charts = readFileSync("desk-charts.js", "utf8");
  assert.doesNotMatch(charts, /desk-onchain\.js\?v=/);
  assert.doesNotMatch(charts, /createElement\('script'\)/);
  assert.ok(html.indexOf("/wallet-connect.js") < html.indexOf("/desk-onchain.js"));
});

test("market signal is sourced from live assets and tabs are functional", () => {
  assert.match(bridge, /function renderSignalList\(\)/);
  assert.match(bridge, /function bindSignalTabs\(\)/);
  assert.match(bridge, /window\.__pronousSignalTab/);
  assert.match(bridge, /dataQuality !== 'unreliable'/);
  assert.match(html, /Ratio-adjusted token\/reference divergence/);
  assert.doesNotMatch(html, /AI scanning 1,248 assets/);
});

test("single-ticker scan recovers missing ratio from the live RWA list", () => {
  assert.match(agent, /resolveAssetShareRatio/);
  assert.match(agent, /if\(resolution\.shareRatio===null\)/);
  assert.match(agent, /shareRatioSource/);
  assert.match(market, /rwa-tokens-list/);
  assert.match(market, /feedAsset\?\.tokenToShareRatio/);
  assert.match(market, /feedAsset\?\.shareRatio/);
  const resolverAt = agent.indexOf("const asset=LIVE_ENABLED?await findLiveAsset(ticker):demoAsset(ticker)");
  assert.ok(resolverAt >= 0, "all single-ticker actions share the same ratio resolver");
  for (const action of ["scan","preflight","loop","simulate"]) assert.ok(agent.indexOf('if(action==="' + action + '")',resolverAt)>resolverAt,action+" resolves the asset before handling");
});

test("divergence radar uses PancakeSwap on-chain quotes and preserves no-route as null", () => {
  assert.match(agent, /monitor:"onchain-vs-reference"/);
  assert.match(agent, /onchainGapPct/);
  assert.match(agent, /routeStatus:noRoute\?"NO ROUTE"/);
  assert.match(agent, /quoteSource:"PancakeSwap Unified Swap API"/);
  assert.match(agent, /asset\.dataQuality==="ok"&&validReference&&normalizedMidGap!==null&&/);
  assert.match(agent, /Math\.abs\(normalizedMidGap\)>=MIN_ACTIONABLE_GAP_PCT/);
  assert.match(agent, /midGapMethod:"SMALLEST_SIZE_BUY_QUOTE_PROXY"/);
  assert.match(agent, /gapBasis:"REQUESTED_SIZE_BUY_QUOTE_INCLUDES_PRICE_IMPACT"/);
  assert.match(agent, /midGapFormula:"midGapPct uses the smallest-size buy quote/);
  assert.match(live, /x\.midGapPct/);
  assert.match(live, /Requested-size quote gap \(impact included; not an actual fill\)/);
  assert.match(live, /OFF_HOURS_DRIFT · STALE REF/);
  assert.match(market, /function classifyAssetSignal\(asset = \{\}\)/);
  assert.match(live, /SMALL-QUOTE GAP vs REFERENCE/);
  assert.match(agent, /marketHoursContext\(asset\)==="MARKET_STATUS_REPORTED"/);
  assert.match(market, /const status = \[asset\.marketStatus, asset\.openState\]/);
  assert.doesNotMatch(agent, /asset\.openState === true/);
  assert.match(agent, /MAX_ACTIONABLE_PRICE_IMPACT_PCT/);
  assert.match(agent, /Number\(q\.priceImpact\)\*100<=MAX_ACTIONABLE_PRICE_IMPACT_PCT/);
  assert.match(agent, /quoteSide:"BUY"/);
  assert.match(agent, /MARKET_CLOSED_REFERENCE_MAY_BE_STALE/);
  assert.match(agent, /priceImpactPct/);
  assert.match(agent, /\(quotePriceUSDTPerToken \/ \(referencePrice \* shareRatio\) - 1\) \* 100/);
  assert.match(live, /window\.__pronousRadarAssets/);
  assert.match(live, /NO SMALL-QUOTE REFERENCE/);
  assert.match(live, /x\.routeStatus/);
  assert.match(live, /PancakeSwap quote-only/);
  assert.match(live, /SMALL-QUOTE GAP vs REFERENCE/);
  assert.match(live, /const threshold = Number\(window\.__pronousRadarSummary\?\.minActionableGapPct \|\| 1\)/);
  assert.match(live, /HIGH IMPACT · REVIEW/);
  assert.match(live, /IMPACT UNKNOWN · REVIEW/);
  assert.match(live, /@media\(max-width:560px\)/);
  assert.match(live, /upstream feed has no measured 24h volume/);
});

test("public quote preview remains available without wallet and shows API/chain errors", () => {
  assert.match(app, /await syncDeskWallet\(\);\s*const walletReady=!!walletAddress&&Number\(walletChainId\)===56/);
  assert.match(app, /PancakeSwap read-only preview is still available/);
  assert.match(app, /Wrong wallet chain \(not BSC Mainnet, chain ID 56\)/);
  assert.match(app, /chain ID 56\) before simulation/);
  assert.match(app, /chain ID 56\) before confirmation/);
  assert.match(app, /Rate limited\. Wait 60 seconds before retrying\./);
  assert.match(app, /Market API unavailable/);
  assert.match(app, /WALLET CONNECTED · WRONG CHAIN/);
  assert.match(app, /status:r\.status,data:j/);
});

test("market alias and unavailable server feed never turn into demo prices", () => {
  assert.match(agent, /action==="assets" \|\| action==="market" \|\| action==="radar"/);
  assert.match(agent, /!LIVE_ENABLED && \["scan","preflight","loop","simulate","pancakeQuote","quote","quoteBuild","build"\]/);
  assert.match(agent, /LIVE_RWA_FEED_NOT_CONFIGURED/);
  assert.match(agent, /No demo price is substituted/);
  assert.match(agent, /asset\.actionable===true/);
  assert.match(agent, /minActionableGapPct:MIN_ACTIONABLE_GAP_PCT/);
});

test("public read-only market endpoint is cached, paginated and bounded", () => {
  assert.match(agent, /s-maxage=20, stale-while-revalidate=10/);
  assert.match(agent, /pancake-preview:/);
  assert.match(agent, /s-maxage=20, stale-while-revalidate=10/);
  assert.match(agent, /Math\.max\(15000, Math\.min\(30000/);
  assert.match(agent, /pagination:\{total:assets\.length,limit,offset,nextOffset,hasMore/);
  assert.match(agent, /slice\(offset,offset\+limit\)/);
  assert.match(agent, /\.slice\(0,limit\)/);
  assert.match(agent, /Number\(b\.volume24H\)-Number\(a\.volume24H\)/);
  assert.match(agent, /UPSTREAM_24H_VOLUME_UNAVAILABLE/);
  assert.match(live, /action=assets&limit=100&offset=/);
  assert.match(live, /action=radar&limit=5&sizeUSDT=100/);
});

test("chart initial UI does not claim fabricated market values", () => {
  assert.doesNotMatch(html, /id="chartLast">181\\.24</);
  assert.doesNotMatch(html, /id="chartChange">\\+2\\.34% \\(\\+4\\.16\\)/);
  assert.match(html, /Waiting for live asset data/);
});

test("POA initial UI does not claim fabricated confirmation", () => {
  assert.match(html, /AWAITING EVIDENCE/);
  assert.match(html, /No session proof/);
  assert.doesNotMatch(html, /Signature Verified/);
  assert.doesNotMatch(html, /On-chain Confirmed/);
});
