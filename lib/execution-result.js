function broadcastPoaFailureMessage(txHash) {
  return "Transaksi terkirim (hash " + String(txHash) + "), pencatatan POA gagal; JANGAN kirim ulang";
}

(function () {
  if (typeof window === "undefined") return;

  const RPC = "https://bsc-dataseed.binance.org";
  const POA_ANCHOR = "0xD729eFf0E050195D464cC9597d7A5Cc7194911B5";

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }
  function short(value) {
    const s = String(value || "");
    return /^0x[a-fA-F0-9]{40,64}$/.test(s) ? s.slice(0, 8) + "…" + s.slice(-6) : (s || "—");
  }
  function link(value, type) {
    const s = String(value || "");
    if (!/^0x[a-fA-F0-9]{40,64}$/.test(s)) return esc(s || "—");
    const base = type === "tx" ? "https://bscscan.com/tx/" : "https://bscscan.com/address/";
    return '<a href="' + base + esc(s) + '" target="_blank" rel="noopener">' + esc(short(s)) + "</a>";
  }
  function list(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "object") return [];
    for (const key of ["data", "rows", "list", "items", "result", "holders", "trades", "pools"]) {
      if (Array.isArray(value[key])) return value[key];
    }
    return [];
  }
  function first(obj, keys) {
    if (!obj || typeof obj !== "object") return "";
    for (const key of keys) {
      if (obj[key] != null && obj[key] !== "") return obj[key];
    }
    return "";
  }
  async function rpc(method, params) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
        signal: controller.signal,
        cache: "no-store"
      });
      const json = await response.json();
      if (json.error) throw new Error(json.error.message || "RPC error");
      return json.result;
    } finally {
      clearTimeout(timer);
    }
  }
  function statusStrip(state) {
    const mode = state.mode === "live-data" ? "LIVE" : state.mode === "demo" ? "DEMO" : "UNAVAILABLE";
    return '<div class="oc-live-grid">' +
      '<div><span>NETWORK</span><b>BSC MAINNET · 56</b></div>' +
      '<div><span>BLOCK</span><b>' + esc(state.block || "—") + "</b></div>" +
      '<div><span>GAS</span><b>' + esc(state.gasGwei || "—") + "</b></div>" +
      '<div><span>FEED</span><b>' + esc(mode) + "</b></div>" +
      '<div><span>ASSET</span><b>' + esc(state.tokenSymbol || "—") + "</b></div>" +
      "</div>";
  }
  function emptyRow(message) {
    return '<tr><td colspan="7" class="oc-empty">' + esc(message) + "</td></tr>";
  }
  function renderTransactions(state) {
    const rows = list(state.trades).slice(0, 8);
    if (!rows.length) return emptyRow(state.mode === "demo" ? "Live trade stream unavailable in demo mode." : "No live trade records returned for this asset.");
    return rows.map((row, i) => {
      const hash = first(row, ["txHash", "transactionHash", "hash", "tx", "tradeHash"]);
      const from = first(row, ["from", "fromAddress", "maker", "makerAddress"]);
      const to = first(row, ["to", "toAddress", "taker", "takerAddress"]);
      const token = first(row, ["symbol", "tokenSymbol", "token", "asset", "pair"]);
      const value = first(row, ["value", "amount", "usdValue", "quoteAmount", "volume"]);
      const time = first(row, ["time", "timestamp", "createdAt", "blockTime"]);
      const when = Number(time) > 1e12 ? new Date(Number(time)).toLocaleTimeString() :
        Number(time) > 1e9 ? new Date(Number(time) * 1000).toLocaleTimeString() : (time || "—");
      return "<tr><td>" + (i + 1) + "</td><td>" + link(hash, "tx") + "</td><td>" +
        link(from, "address") + "</td><td>" + link(to, "address") + "</td><td>" +
        esc(token || state.tokenSymbol || "—") + "</td><td>" + esc(value || "—") + "</td><td>" + esc(when) + "</td></tr>";
    }).join("");
  }
  function renderHolders(state) {
    const rows = list(state.holders).slice(0, 8);
    if (!rows.length) return '<div class="oc-empty-block">' + esc(state.mode === "demo" ? "Holder data is not available in demo mode." : "No holder records returned for this asset.") + "</div>";
    return '<div class="oc-holder-list">' + rows.map((row, i) => {
      const address = first(row, ["address", "holderAddress", "walletAddress", "owner"]);
      const balance = first(row, ["balance", "tokenBalance", "amount", "quantity"]);
      const pct = first(row, ["percentage", "percent", "share", "holdingPercent"]);
      return '<div class="oc-holder"><b>#' + (i + 1) + '</b><span>' + link(address, "address") +
        '</span><strong>' + esc(balance || "—") + '</strong><em>' + esc(pct ? String(pct) + "%" : "—") + "</em></div>";
    }).join("") + "</div>";
  }
  function renderContracts(state) {
    const token = state.token || "";
    return '<div class="oc-contract-grid">' +
      '<div><span>Selected token</span><a href="https://bscscan.com/token/' + esc(token) + '" target="_blank" rel="noopener">' + esc(short(token)) + "</a></div>" +
      '<div><span>POA anchor</span><a href="https://bscscan.com/address/' + POA_ANCHOR + '" target="_blank" rel="noopener">' + esc(short(POA_ANCHOR)) + "</a></div>" +
      '<div><span>Chain</span><b>BSC Mainnet · 56</b></div>' +
      '<div><span>Broadcast</span><b>Wallet confirmation only</b></div>' +
      "</div>";
  }
  function injectStyle() {
    if (document.getElementById("pronous-onchain-audit-style")) return;
    const style = document.createElement("style");
    style.id = "pronous-onchain-audit-style";
    style.textContent =
      "#onchain-section{min-height:0!important}" +
      "#onchain-section .onchain-result{margin-top:10px;white-space:normal}" +
      ".oc-live-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin:10px 0 12px}" +
      ".oc-live-grid>div{padding:9px 10px;border:1px solid rgba(245,190,55,.13);border-radius:10px;background:rgba(10,12,16,.5)}" +
      ".oc-live-grid span,.oc-contract-grid span{display:block;color:var(--muted);font:8px 'IBM Plex Mono',monospace;letter-spacing:.08em;text-transform:uppercase}" +
      ".oc-live-grid b{display:block;margin-top:4px;font:600 10px 'IBM Plex Mono',monospace;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".oc-table{font-size:10px!important}" +
      ".oc-empty,.oc-empty-block{padding:14px!important;color:var(--muted);text-align:center}" +
      ".oc-holder-list{display:grid;gap:6px;margin-top:10px}" +
      ".oc-holder{display:grid;grid-template-columns:30px 1fr auto auto;gap:8px;align-items:center;padding:8px;border-bottom:1px solid rgba(245,190,55,.08);font:10px 'IBM Plex Mono',monospace}" +
      ".oc-holder em{font-style:normal;color:var(--muted)}" +
      ".oc-contract-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}" +
      ".oc-contract-grid>div{padding:11px;border:1px solid rgba(245,190,55,.12);border-radius:10px;background:rgba(10,12,16,.5)}" +
      ".oc-contract-grid a,.oc-table a{color:var(--text);text-decoration:none}" +
      "@media(max-width:900px){.oc-live-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.oc-contract-grid{grid-template-columns:1fr}.oc-table{display:block;overflow:auto}.oc-table th,.oc-table td{padding:5px 6px!important}}";
    document.head.appendChild(style);
  }
  function installPoaTruth() {
    const card = document.getElementById("poa-section");
    if (!card) return;
    const detail = card.querySelector(".poa-detail");
    if (detail && !detail.dataset.auditTruth) {
      detail.dataset.auditTruth = "1";
      detail.innerHTML =
        '<div class="poa-hash-row"><code id="poaLiveHash">No POA generated for this session.</code></div>' +
        '<div class="poa-meta"><div><span class="muted small">Network</span><b>BSC Mainnet</b></div>' +
        '<div><span class="muted small">Anchor</span><b>' + esc(short(POA_ANCHOR)) + "</b></div></div>" +
        '<div class="poa-checks"><div class="check">Awaiting POA</div><div class="check">Awaiting Anchor</div><div class="check">No broadcast</div></div>' +
        '<a class="view-bscscan muted small" href="https://bscscan.com/address/' + POA_ANCHOR + '" target="_blank" rel="noopener">View Anchor on BscScan →</a>';
      const tag = card.querySelector(".verified-tag");
      if (tag) { tag.textContent = "Pending"; tag.classList.remove("verified-tag"); tag.classList.add("tag"); }
    }
  }
  function render(state) {
    const card = document.getElementById("onchain-section");
    const chain = document.getElementById("chain");
    if (!card || !chain) return;
    chain.innerHTML = statusStrip(state) +
      '<div class="oc-view" data-view="tx"><table class="oc-table"><thead><tr><th>#</th><th>Hash</th><th>From</th><th>To</th><th>Token</th><th>Value</th><th>Time</th></tr></thead><tbody>' +
      renderTransactions(state) + "</tbody></table></div>";
    const tabs = card.querySelectorAll(".oc-tab");
    tabs.forEach((tab) => {
      tab.onclick = function () {
        tabs.forEach((b) => b.classList.remove("active"));
        tab.classList.add("active");
        const view = tab.textContent.toLowerCase();
        if (view.includes("holder")) chain.innerHTML = statusStrip(state) + '<div class="oc-view" data-view="holders">' + renderHolders(state) + "</div>";
        else if (view.includes("contract")) chain.innerHTML = statusStrip(state) + '<div class="oc-view" data-view="contracts">' + renderContracts(state) + "</div>";
        else chain.innerHTML = statusStrip(state) + '<div class="oc-view" data-view="tx"><table class="oc-table"><thead><tr><th>#</th><th>Hash</th><th>From</th><th>To</th><th>Token</th><th>Value</th><th>Time</th></tr></thead><tbody>' + renderTransactions(state) + "</tbody></table></div>";
      };
    });
  }
  async function loadOnchain(asset) {
    const token = String(asset?.tokenContractAddress || "").trim();
    const chain = document.getElementById("chain");
    if (!chain || !token) return;
    injectStyle();
    installPoaTruth();
    chain.innerHTML = '<div class="oc-empty-block">Reading BSC on-chain activity…</div>';
    try {
      const response = await fetch("/api/onchain?token=" + encodeURIComponent(token) + "&chain=56", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "On-chain feed unavailable");
      let block = "—", gasGwei = "—";
      try {
        const [blockHex, gasHex] = await Promise.all([rpc("eth_blockNumber", []), rpc("eth_gasPrice", [])]);
        block = String(parseInt(blockHex, 16)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        gasGwei = (Number(BigInt(gasHex)) / 1e9).toFixed(2) + " Gwei";
      } catch (_) {}
      render({ ...data, token, tokenSymbol: asset.tokenSymbol || asset.ticker || "—", block, gasGwei });
    } catch (_) {
      render({ mode: "unavailable", token, tokenSymbol: asset.tokenSymbol || asset.ticker || "—", block: "—", gasGwei: "—", trades: [], holders: [] });
      const chainBox = document.getElementById("chain");
      if (chainBox) {
        const note = document.createElement("div");
        note.className = "muted small";
        note.style.marginTop = "8px";
        note.textContent = "Live on-chain feed unavailable right now; no synthetic transactions are shown.";
        chainBox.appendChild(note);
      }
    }
  }

  window.loadOnchain = loadOnchain;
  window.PRONOUS_EXECUTION_RESULT = { broadcastPoaFailureMessage };
  injectStyle();
  installPoaTruth();
  if (typeof window.setTimeout === "function") setTimeout(installPoaTruth, 0);
})();

if (typeof module !== "undefined") module.exports = { broadcastPoaFailureMessage };
