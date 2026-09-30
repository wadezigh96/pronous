let cmcRadarTimer = null;
let cmcTab = "rwa";
let cmcCache = null;

function cmcEsc(s) {
  return String(s ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
}
function cmcFmtPrice(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return "$" + n.toFixed(2);
  return "$" + n.toPrecision(4);
}
function cmcFmtPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return (n > 0 ? "+" : "") + n.toFixed(2) + "%";
}
function cmcFmtCap(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return "$" + n.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });
}

function ensureCMCRadarPanel() {
  if (document.getElementById("cmcRadarCard")) return document.getElementById("cmcRadar");
  const section = document.getElementById("radar-section");
  if (!section) return null;
  const card = document.createElement("section");
  card.id = "cmcRadarCard";
  card.className = "card terminal-card";
  card.innerHTML =
    '<div class="terminal-head"><div><h2>CMC RWA + Tokenisation</h2><small>TOP RANKED · COINMARKETCAP</small></div><span id="cmcRadarMeta" class="muted small">LOADING</span></div>' +
    '<div class="row" style="margin:8px 0 0;gap:6px">' +
    '<button class="secondary" type="button" id="cmcTabRwa" onclick="setCmcTab(\'rwa\')">RWA assets</button>' +
    '<button class="secondary" type="button" id="cmcTabTok" onclick="setCmcTab(\'tokenisation\')">Tokenisation</button>' +
    '<button class="secondary" type="button" id="cmcTabAll" onclick="setCmcTab(\'all\')">Combined</button>' +
    "</div>" +
    '<div id="cmcRadar" class="result" style="padding:0;overflow:auto;white-space:normal"></div>';
  section.appendChild(card);
  const style = document.createElement("style");
  style.textContent =
    "#cmcRadarCard{grid-column:1/-1}" +
    ".cmc-radar-row{display:grid;grid-template-columns:36px 1.4fr .9fr .8fr .8fr .8fr;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(245,197,66,.1);align-items:center}" +
    ".cmc-radar-row.head{color:#817b6d;font:9px IBM Plex Mono,monospace;text-transform:uppercase;letter-spacing:.08em}" +
    ".cmc-radar-row:last-child{border-bottom:0}" +
    "@media(max-width:800px){.cmc-radar-row{grid-template-columns:28px 1fr .8fr .7fr}.cmc-radar-row>:nth-child(5),.cmc-radar-row>:nth-child(6){display:none}}";
  document.head.appendChild(style);
  return document.getElementById("cmcRadar");
}

function setCmcTab(tab) {
  cmcTab = tab;
  ["rwa", "tokenisation", "all"].forEach((id) => {
    const map = { rwa: "cmcTabRwa", tokenisation: "cmcTabTok", all: "cmcTabAll" };
    const btn = document.getElementById(map[id]);
    if (btn) btn.style.borderColor = id === tab ? "rgba(245,197,66,.7)" : "";
  });
  renderCMCRadar();
}
window.setCmcTab = setCmcTab;

function cmcRowsForTab() {
  if (!cmcCache) return [];
  if (cmcTab === "tokenisation") return cmcCache.rwaTokens || [];
  if (cmcTab === "all") return cmcCache.radar || [];
  return (cmcCache.rwaAssets && cmcCache.rwaAssets.length ? cmcCache.rwaAssets : cmcCache.rwaTokens) || [];
}

function cmcRow(x, i) {
  const c = Number(x.change24h);
  const type = x.assetType || x.kind || "rwa";
  return (
    '<div class="cmc-radar-row">' +
    '<div class="muted small">' + (x.rank || i + 1) + "</div>" +
    "<div><b>" + cmcEsc(x.symbol) + "</b><span class=\"muted small\"> " + cmcEsc(x.name) + "</span></div>" +
    "<div>" + cmcFmtPrice(x.price) + "</div>" +
    '<div class="' + (c >= 0 ? "pos" : "neg") + '">' + cmcFmtPct(c) + "</div>" +
    '<div class="muted small">' + cmcFmtCap(x.marketCap) + "</div>" +
    '<div class="muted small">' + cmcEsc(String(type).replace(/_/g, " ")) + "</div>" +
    "</div>"
  );
}

function renderCMCRadar() {
  const el = document.getElementById("cmcRadar");
  if (!el) return;
  const rows = cmcRowsForTab();
  if (!rows.length) {
    el.innerHTML = '<div class="muted small" style="padding:12px">No ranked RWA / Tokenisation tokens returned.</div>';
    return;
  }
  el.innerHTML =
    '<div class="cmc-radar-row head"><div>#</div><div>Token</div><div>Price</div><div>24h</div><div>Mcap</div><div>Type</div></div>' +
    rows.slice(0, 20).map(cmcRow).join("");
}

async function loadCMCRadar() {
  const el = ensureCMCRadarPanel();
  const meta = document.getElementById("cmcRadarMeta");
  if (!el) return;
  try {
    const r = await fetch("/api/cmc-radar?limit=15", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || j.error || "CMC unavailable");
    cmcCache = j;
    renderCMCRadar();
    setCmcTab(cmcTab);
    if (meta) {
      meta.textContent =
        "CMC · RWA/TOKENISATION · " +
        new Date(j.timestamp || Date.now()).toLocaleTimeString();
    }
  } catch (e) {
    el.innerHTML = '<div class="muted small" style="padding:12px">CMC RWA list unavailable: ' + cmcEsc(e.message || e) + "</div>";
    if (meta) meta.textContent = "CMC OFFLINE";
  }
}

function startCMCRadar() {
  if (cmcRadarTimer) return;
  loadCMCRadar();
  cmcRadarTimer = setInterval(() => {
    if (!document.hidden) loadCMCRadar();
  }, 45000);
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadCMCRadar();
});
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startCMCRadar, { once: true });
else startCMCRadar();
