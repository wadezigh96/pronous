import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const onchainPath = 'desk-onchain.js';
const cssPath = 'desk.css';
const testPath = 'scripts/ui-regression.test.mjs';

const insert = String.raw`  function unwrapOnchain(value, depth) {
    if (depth > 5 || value == null) return value;
    if (Array.isArray(value)) return value;
    if (typeof value !== "object") return value;
    if (value.data !== undefined && value.data !== value) return unwrapOnchain(value.data, depth + 1);
    return value;
  }

  function onchainList(value) {
    let v = unwrapOnchain(value, 0);
    if (Array.isArray(v)) return v;
    if (!v || typeof v !== "object") return [];
    const keys = ["list", "items", "records", "rows", "holders", "trades", "pools", "topHolders", "liquidityPools", "tradeList", "data"];
    for (const key of keys) {
      if (v[key] !== undefined) {
        const out = onchainList(v[key]);
        if (out.length) return out;
      }
    }
    return [];
  }

  function onchainField(root, keys, fallback) {
    const queue = [unwrapOnchain(root, 0)];
    const seen = new Set();
    while (queue.length) {
      const cur = queue.shift();
      if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
      seen.add(cur);
      for (const key of keys) {
        if (cur[key] !== undefined && cur[key] !== null && cur[key] !== "") return cur[key];
      }
      for (const value of Object.values(cur)) {
        if (value && typeof value === "object" && !seen.has(value)) queue.push(value);
      }
    }
    return fallback;
  }

  function onchainMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value ?? "—");
    if (Math.abs(n) >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (Math.abs(n) >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (Math.abs(n) >= 1e3) return "$" + (n / 1e3).toFixed(2) + "K";
    if (Math.abs(n) >= 1) return "$" + n.toFixed(2);
    return "$" + n.toPrecision(4);
  }

  function onchainNum(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value ?? "—");
    return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toPrecision(4);
  }

  function onchainAddress(value) {
    const s = String(value || "");
    return /^0x[a-fA-F0-9]{40}$/.test(s) ? short(s) : (s || "—");
  }

  function onchainTime(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "—";
    const ms = n < 1e12 ? n * 1000 : n;
    return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function onchainRow(label, value, extra) {
    return '<div class="onchain-row"><span>' + esc(label) + '</span><b>' + esc(value) + '</b>' + (extra ? '<em>' + esc(extra) + '</em>' : '') + '</div>';
  }

  function onchainRows(title, rows, empty) {
    return '<div class="onchain-list"><div class="onchain-list-title">' + esc(title) + '</div>' +
      (rows.length ? rows.join("") : '<div class="onchain-empty">' + esc(empty || "No live rows returned") + '</div>') +
      '</div>';
  }

  function renderOnchain(asset, payload) {
    const box = document.getElementById("chain");
    if (!box) return;
    const infoRoot = unwrapOnchain(payload && payload.info, 0) || {};
    const holders = onchainList(payload && payload.holders).slice(0, 5);
    const trades = onchainList(payload && payload.trades).slice(0, 5);
    const pools = onchainList(payload && payload.pools).slice(0, 4);
    const symbol = onchainField(infoRoot, ["symbol", "tokenSymbol"], asset.tokenSymbol || asset.ticker || "—");
    const price = onchainField(infoRoot, ["price", "tokenPrice", "currentPrice"], asset.tokenPrice || "—");
    const holdersCount = onchainField(infoRoot, ["holders", "totalHolders", "holderCount"], holders.length ? String(holders.length) : "—");
    const liquidity = onchainField(infoRoot, ["liquidity", "liquidityUsd", "totalLiquidity"], "—");
    const volume = onchainField(infoRoot, ["volume24h", "volume24H", "volumeUsd24h"], asset.volume24H || "—");
    const marketCap = onchainField(infoRoot, ["marketCap", "marketCapUsd", "fdv"], asset.marketCap || "—");
    const holderRows = holders.map((h, i) => onchainRow(String(i + 1).padStart(2, "0") + " · " + onchainAddress(h.address || h.owner || h.holder || h.wallet), onchainNum(h.balance || h.amount || h.quantity || "—"), h.percentage ?? h.percent ?? h.share ? String(h.percentage ?? h.percent ?? h.share) + "%" : ""));
    const tradeRows = trades.map((t) => onchainRow(String(t.side || t.type || t.action || "TRADE").toUpperCase(), onchainMoney(t.price || t.tokenPrice || "—"), (t.amount || t.qty || t.quantity || "—") + " · " + onchainTime(t.time || t.timestamp || t.txTime)));
    const poolRows = pools.map((p) => onchainRow(p.pair || p.symbol || p.name || p.dexName || "POOL", onchainMoney(p.liquidity || p.liquidityUsd || p.tvl || "—"), p.volume24h || p.volume24H ? "24h " + onchainMoney(p.volume24h || p.volume24H) : ""));
    box.className = "result onchain-live";
    box.innerHTML = '<div class="onchain-head"><div><div class="eyebrow">LIVE ON-CHAIN INTELLIGENCE</div><div class="onchain-title">' + esc(asset.ticker || symbol) + ' <span>' + esc(symbol) + '</span></div><div class="muted small">BSC · ' + esc(short(asset.tokenContractAddress)) + '</div></div><a class="tag onchain-link" href="' + esc(payload.explorer || ("https://bscscan.com/token/" + asset.tokenContractAddress)) + '" target="_blank" rel="noopener">BscScan ↗</a></div>' +
      '<div class="onchain-kpis">' + onchainRow("PRICE", onchainMoney(price)) + onchainRow("HOLDERS", onchainNum(holdersCount)) + onchainRow("LIQUIDITY", onchainMoney(liquidity)) + onchainRow("24H VOLUME", onchainMoney(volume)) + onchainRow("MARKET CAP", onchainMoney(marketCap)) + '</div>' +
      '<div class="onchain-columns">' + onchainRows("TOP HOLDERS", holderRows, "Holder ranking unavailable") + onchainRows("RECENT TRADES", tradeRows, "Trade feed unavailable") + onchainRows("LIQUIDITY", poolRows, "Liquidity pool data unavailable") + '</div>' +
      '<div class="onchain-foot"><span class="tag ' + (payload.mode === "live-data" ? "live" : "demo") + '">' + esc(String(payload.mode || "unknown").toUpperCase()) + '</span><span class="muted small">Read-only market intelligence · no transaction broadcast</span></div>';
  }

  async function loadOnchain(asset) {
    const box = document.getElementById("chain");
    if (!box || !asset || !asset.tokenContractAddress) return;
    box.className = "result onchain-live";
    box.innerHTML = '<div class="onchain-loading"><span class="onchain-pulse"></span> Loading BSC contract, holders, trades and liquidity…</div>';
    try {
      const r = await fetch("/api/onchain?chain=56&token=" + encodeURIComponent(asset.tokenContractAddress), { cache: "no-store" });
      const payload = await r.json();
      if (!r.ok || payload.error) throw new Error(payload.error || "On-chain request failed");
      window.__pronousOnchainAsset = asset;
      window.__pronousOnchainPayload = payload;
      renderOnchain(asset, payload);
    } catch (e) {
      box.innerHTML = '<div class="onchain-error"><b>On-chain read unavailable</b><span>' + esc(e.message || e) + '</span><a href="https://bscscan.com/token/' + esc(asset.tokenContractAddress) + '" target="_blank" rel="noopener">Open contract on BscScan ↗</a></div>';
    }
  }

`;

const src = readFileSync(onchainPath, 'utf8');
if (!src.includes('async function loadOnchain(asset)')) {
  writeFileSync(onchainPath, src.replace('  async function autoLoadOnchain() {', insert + '  async function autoLoadOnchain() {'));
}

const css = readFileSync(cssPath, 'utf8');
if (!css.includes('PRONOUS ON-CHAIN DENSITY REPAIR')) {
  writeFileSync(cssPath, css + String.raw`

/* PRONOUS ON-CHAIN DENSITY REPAIR */
#onchain-section{align-self:start!important;min-height:0!important}
#onchain-section .result{margin-top:8px!important;max-height:none!important;overflow:visible!important}
.onchain-live{display:block!important;white-space:normal!important;font-family:Inter,ui-sans-serif,system-ui,sans-serif!important;color:var(--text)!important}
.onchain-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:10px;border-bottom:1px solid rgba(245,197,66,.12)}
.onchain-title{font-size:20px;font-weight:900;letter-spacing:-.03em;margin-top:4px}.onchain-title span{font:10px "IBM Plex Mono",monospace;color:var(--muted);margin-left:6px}
.onchain-link{white-space:nowrap;text-decoration:none}.onchain-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin-top:9px}.onchain-kpis .onchain-row{border:1px solid var(--line);background:rgba(8,10,14,.55);border-radius:9px;padding:9px}.onchain-row{display:grid;grid-template-columns:1fr auto;gap:5px;align-items:center}.onchain-row span{color:var(--muted);font:9px "IBM Plex Mono",monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.onchain-row b{font:700 11px "IBM Plex Mono",monospace;color:var(--text);text-align:right}.onchain-row em{grid-column:1/-1;color:var(--muted);font:9px "IBM Plex Mono",monospace;font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.onchain-columns{display:grid;grid-template-columns:1.05fr 1fr 1fr;gap:8px;margin-top:9px}.onchain-list{border:1px solid var(--line);border-radius:10px;background:rgba(5,8,12,.48);overflow:hidden}.onchain-list-title{padding:8px 9px;color:var(--dim);font:800 9px "IBM Plex Mono",monospace;letter-spacing:.08em;border-bottom:1px solid var(--line);background:rgba(245,197,66,.025)}.onchain-list .onchain-row{padding:7px 9px;border-bottom:1px solid var(--line)}.onchain-list .onchain-row:last-child{border-bottom:0}.onchain-empty,.onchain-loading,.onchain-error{padding:14px;color:var(--muted);font:10px "IBM Plex Mono",monospace}.onchain-loading{display:flex;align-items:center;gap:8px}.onchain-pulse{width:7px;height:7px;border-radius:50%;background:#f5c542;box-shadow:0 0 12px rgba(245,197,66,.7);animation:pulse 1.4s infinite}.onchain-error{display:flex;flex-direction:column;gap:7px}.onchain-error b{color:var(--text);font:800 11px Inter,sans-serif}.onchain-error a{color:#f5c542}.onchain-foot{display:flex;align-items:center;gap:8px;margin-top:8px}.onchain-foot .tag{margin:0}
@media(max-width:1100px){.onchain-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.onchain-columns{grid-template-columns:1fr 1fr}.onchain-columns .onchain-list:last-child{grid-column:1/-1}}
@media(max-width:760px){#onchain-section{margin-bottom:12px!important}.onchain-head{align-items:center}.onchain-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.onchain-columns{grid-template-columns:1fr}.onchain-columns .onchain-list:last-child{grid-column:auto}.onchain-foot{flex-wrap:wrap}.onchain-title{font-size:18px}}
`);
}

writeFileSync(testPath, `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\n\nconst html = readFileSync("index.html", "utf8");\nconst onchain = readFileSync("desk-onchain.js", "utf8");\nconst css = readFileSync("desk.css", "utf8");\nconst api = readFileSync("api/onchain.js", "utf8");\n\ntest("on-chain script loads after desk app", () => assert.ok(html.indexOf('/desk-app.js') < html.indexOf('/desk-onchain.js')));\ntest("on-chain auto renderer exists", () => { assert.match(onchain, /async function loadOnchain\\(asset\\)/); assert.match(onchain, /autoLoadOnchain\\(\\)/); assert.match(onchain, /\\/api\\/onchain\\?chain=56&token=/); });\ntest("on-chain density styles exist", () => { assert.match(css, /PRONOUS ON-CHAIN DENSITY REPAIR/); assert.match(css, /\\.onchain-kpis/); assert.match(css, /\\.onchain-columns/); });\ntest("on-chain API remains BSC-only", () => { assert.match(api, /Only BSC mainnet is supported/); assert.match(api, /isAddress\\(token\\)/); });\n`);

execFileSync(process.execPath, ['--check', onchainPath], { stdio: 'inherit' });
execFileSync(process.execPath, ['--test', testPath], { stdio: 'inherit' });
try { unlinkSync('.github/workflows/one-shot-ui-fix.yml'); } catch {}
try { unlinkSync('scripts/one-shot-ui-repair.mjs'); } catch {}
