/**
 * PRONOUS desk-bridge — wallet + named prices + selected chart + on-chain.
 * Wires existing panels. Does not replace execution gates.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ESC[m]);

  function fmtPrice(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    if (n >= 1000) return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (n >= 1) return "$" + n.toFixed(2);
    return "$" + n.toPrecision(4);
  }
  function fmtPct(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return (n > 0 ? "+" : "") + n.toFixed(2) + "%";
  }
  function assets() {
    return Array.isArray(window.marketAssets) ? window.marketAssets : [];
  }
  function findAsset(ticker) {
    const t = String(ticker || "").toUpperCase();
    const list = assets();
    return (
      list.find((a) => String(a.ticker || "").toUpperCase() === t) ||
      list.find((a) => String(a.tokenSymbol || "").toUpperCase() === t) ||
      list.find((a) => String(a.companyName || "").toUpperCase().includes(t))
    );
  }

  function applyWalletEverywhere(detail) {
    const address = detail?.address || null;
    const source = detail?.source || null;
    const short =
      address && address.length > 12 ? address.slice(0, 6) + "…" + address.slice(-4) : address || "Not connected";
    const status = $("walletStatus");
    const src = $("walletSource");
    const top = $("walletAddressTop");
    const exec = $("walletAddress");
    const btn = $("connectWalletBtn");
    const kpi = $("kpiExec");
    if (status) {
      status.textContent = address
        ? source === "privy"
          ? "PRIVY WALLET · BSC"
          : "BROWSER WALLET · BSC"
        : "WALLET NOT CONNECTED";
    }
    if (src) src.textContent = address ? (source === "privy" ? "PRIVY" : "BROWSER WALLET") : "NO WALLET";
    if (top) top.textContent = short;
    if (exec) exec.textContent = short;
    if (btn) {
      btn.textContent = address ? "Disconnect" : "Connect Wallet";
      btn.disabled = false;
    }
    if (kpi) kpi.textContent = address ? "ARMED" : "LOCKED";
    const confirmBtn = $("confirmActionBtn");
    if (confirmBtn && !address) confirmBtn.disabled = true;
    const gate = $("poaGateStatus");
    if (gate && address) {
      if (!gate.dataset.locked) gate.textContent = "Wallet connected · run preflight before confirm.";
    } else if (gate && !address) {
      gate.textContent = "Connect wallet, then simulate before confirmation.";
    }
  }

  async function syncWalletFromApi() {
    const api = window.PRONOUS_WALLET;
    if (!api) return;
    try {
      if (typeof api.sync === "function") await api.sync();
    } catch (_) {}
    const address = typeof api.getAddress === "function" ? api.getAddress() : null;
    applyWalletEverywhere(
      address
        ? {
            address,
            source: typeof api.getSource === "function" ? api.getSource() : "injected",
            chainId: typeof api.getChainId === "function" ? api.getChainId() : 56
          }
        : null
    );
  }

  window.addEventListener("pronous:privy-wallet-connected", (e) => applyWalletEverywhere(e.detail || {}));
  window.addEventListener("pronous:privy-wallet-disconnected", () => applyWalletEverywhere(null));

  function pickSignals(list) {
    const tab = window.__pronousSignalTab || "all";
    let pool = list.slice();
    if (tab === "crypto") {
      pool = pool.filter((a) => /btc|eth|bnb|sol|crypto/i.test(String(a.ticker) + String(a.platformId) + String(a.category || "")));
    } else if (tab === "stocks" || tab === "rwa") {
      pool = pool.filter((a) => !/btc|eth|bnb|sol/i.test(String(a.ticker || "")));
    }
    const prefer = ["NVDA", "AAPL", "TSLA", "MSFT", "AMZN", "META", "GOOGL", "SPY", "GOLD", "BNB"];
    const byTicker = new Map();
    pool.forEach((a) => {
      const t = String(a.ticker || "").toUpperCase();
      if (!t) return;
      const prev = byTicker.get(t);
      if (!prev || Math.abs(Number(a.spreadPct) || 0) > Math.abs(Number(prev.spreadPct) || 0)) byTicker.set(t, a);
    });
    const out = [];
    prefer.forEach((t) => {
      if (byTicker.has(t)) out.push(byTicker.get(t));
    });
    pool.forEach((a) => {
      if (out.length >= 8) return;
      const t = String(a.ticker).toUpperCase();
      if (!out.some((x) => String(x.ticker).toUpperCase() === t)) out.push(a);
    });
    return out.slice(0, 8);
  }

  function logoClass(ticker) {
    const t = String(ticker || "").toUpperCase();
    if (t === "NVDA") return "nvda";
    if (t === "AAPL") return "aapl";
    if (t === "TSLA") return "tsla";
    if (t === "BTC") return "btc";
    if (t === "ETH") return "eth";
    return "";
  }

  function renderSignalList() {
    const box = $("signalList");
    if (!box) return;
    const rows = pickSignals(assets());
    if (!rows.length) return;
    const selected = String($("ticker")?.value || window.__pronousSelectedAsset?.ticker || "").toUpperCase();
    box.innerHTML = rows
      .map((a) => {
        const t = String(a.ticker || "").toUpperCase();
        const name = esc(a.companyName || a.tokenSymbol || t);
        const px = Number(a.tokenPrice ?? a.referencePrice);
        const gap = Number(a.spreadPct);
        const pos = Number.isFinite(gap) ? gap >= 0 : true;
        const actionable = a.actionable !== false && a.dataQuality !== 'unreliable';
        const badge = !actionable ? "neutral" : !Number.isFinite(gap) ? "neutral" : Math.abs(gap) < 0.15 ? "neutral" : pos ? "bullish" : "discount";
        const badgeLabel = !actionable ? "Guarded" : badge === "bullish" ? "Premium" : badge === "discount" ? "Discount" : "Aligned";
        const spark = pos ? "▂▃▄▅▆▇" : "▇▆▅▄▃▂";
        const on = t === selected ? " is-selected" : "";
        return (
          '<div class="signal-row' +
          on +
          '" role="button" tabindex="0" data-ticker="' +
          esc(t) +
          '">' +
          '<div class="sig-asset"><span class="sig-logo ' +
          logoClass(t) +
          '">' +
          esc(t.slice(0, 1) || "?") +
          "</span><div><b>" +
          esc(t) +
          "</b><span>" +
          name +
          "</span></div></div>" +
          '<div class="sig-price">' +
          fmtPrice(px) +
          ' <span class="' +
          (pos ? "pos" : "neg") +
          '">' +
          fmtPct(gap) +
          "</span></div>" +
          '<div class="sig-spark ' +
          (pos ? "pos" : "neg") +
          '">' +
          spark +
          "</div>" +
          '<span class="sig-badge ' +
          badge +
          '">' +
          badgeLabel +
          "</span></div>"
        );
      })
      .join("");
    const upd = $("signalUpdated");
    if (upd) upd.textContent = new Date().toLocaleTimeString();
    box.querySelectorAll(".signal-row").forEach((row) => {
      row.addEventListener("click", () => selectTicker(row.getAttribute("data-ticker")));
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectTicker(row.getAttribute("data-ticker"));
        }
      });
    });
  }

  function currentBar() {
    const active = document.querySelector(".tf-btn.active");
    const raw = (active?.textContent || window.__pronousChartBar || "1h").trim().toLowerCase();
    if (raw === "1d" || raw === "d") return "1d";
    if (raw === "4h") return "4h";
    if (raw === "1h" || raw === "h") return "1h";
    if (raw === "15m") return "15m";
    if (raw === "5m") return "5m";
    if (raw === "1m") return "1m";
    return "1h";
  }

  function selectTicker(ticker, opts) {
    if (!ticker) return;
    const t = String(ticker).toUpperCase().replace(/\/USDT$/, "");
    const input = $("ticker");
    if (input) input.value = t;
    const pair = $("chartPair");
    if (pair) {
      const want = t + "/USDT";
      let found = false;
      for (const opt of pair.options) {
        if (opt.value === want || opt.text === want) {
          pair.value = opt.value;
          found = true;
          break;
        }
      }
      if (!found) {
        const o = document.createElement("option");
        o.value = want;
        o.textContent = want;
        pair.appendChild(o);
        pair.value = want;
      }
    }
    const asset = findAsset(t);
    if (asset) {
      window.__pronousSelectedAsset = asset;
      const last = $("chartLast");
      const chg = $("chartChange");
      const label = $("tapeLabel");
      const px = Number(asset.tokenPrice ?? asset.referencePrice);
      const gap = Number(asset.spreadPct);
      if (last && Number.isFinite(px)) last.textContent = px >= 1 ? px.toFixed(2) : String(px);
      if (chg && Number.isFinite(gap)) {
        chg.textContent = fmtPct(gap);
        chg.className = gap >= 0 ? "pos" : "neg";
      }
      if (label) label.textContent = t + "/USDT · " + currentBar().toUpperCase();
      const contract = $("contractDisplay");
      if (contract) contract.textContent = asset.tokenContractAddress || "—";
      if (typeof window.renderClock === "function") {
        try { window.renderClock(asset); } catch (_) {}
      }
      if (!opts || opts.onchain !== false) {
        if (typeof window.loadOnchain === "function") {
          try { window.loadOnchain(asset); } catch (_) {}
        }
      }
      if (typeof window.loadAssetChart === "function") {
        window.loadAssetChart(asset, currentBar());
      } else if (typeof window.drawGapChart === "function") {
        try { window.drawGapChart(); } catch (_) {}
      }
    }
    renderSignalList();
    highlightMarketRow(t);
    window.dispatchEvent(new CustomEvent("pronous:asset-selected", { detail: { ticker: t, asset } }));
  }

  function highlightMarketRow(ticker) {
    const box = $("marketTable");
    if (!box) return;
    box.querySelectorAll("tr[data-ticker], tr").forEach((tr) => {
      const cell = tr.querySelector("b, td");
      const t = (tr.getAttribute("data-ticker") || cell?.textContent || "").trim().split(/\s+/)[0].toUpperCase();
      tr.classList.toggle("is-selected", t === ticker);
    });
  }

  function hookScan() {
    const original = window.scan;
    if (typeof original !== "function" || original.__bridged) return;
    window.scan = async function bridgedScan() {
      const t = ($("ticker")?.value || "").trim().toUpperCase();
      await original.apply(this, arguments);
      if (t) selectTicker(t);
    };
    window.scan.__bridged = true;
  }

  function hookLoadMarket() {
    const original = window.loadMarket;
    if (typeof original !== "function" || original.__bridged) return;
    window.loadMarket = async function bridgedLoadMarket() {
      const r = await original.apply(this, arguments);
      try {
        applyMarketTab();
        renderSignalList();
        fillPairSelect();
        const t = ($("ticker")?.value || window.__pronousSelectedAsset?.ticker || "NVDA").toUpperCase();
        selectTicker(t, { onchain: false });
      } catch (e) {
        console.warn("PRONOUS bridge post-market", e);
      }
      return r;
    };
    window.loadMarket.__bridged = true;
  }

  function hookOpenAsset() {
    const original = window.openAsset;
    if (typeof original !== "function" || original.__bridged) return;
    window.openAsset = function bridgedOpenAsset(ticker, platform) {
      original.apply(this, arguments);
      if (ticker) selectTicker(ticker);
    };
    window.openAsset.__bridged = true;
  }

  function hookRenderMarket() {
    const original = window.renderMarket;
    if (typeof original !== "function" || original.__bridgedNames) return;
    window.renderMarket = function bridgedRenderMarket() {
      original.apply(this, arguments);
      const box = $("marketTable");
      if (!box) return;
      box.querySelectorAll("tbody tr").forEach((tr) => {
        const b = tr.querySelector("b");
        if (!b) return;
        const t = b.textContent.trim().toUpperCase();
        tr.setAttribute("data-ticker", t);
        const asset = findAsset(t);
        if (!asset) return;
        const tds = tr.querySelectorAll("td");
        if (tds[0] && asset.companyName) {
          let sub = tds[0].querySelector(".muted");
          if (!sub) {
            tds[0].appendChild(document.createElement("br"));
            sub = document.createElement("span");
            sub.className = "muted small";
            tds[0].appendChild(sub);
          }
          sub.textContent = asset.companyName + (asset.platformId ? " · " + asset.platformId : "");
        }
        if (tds[1] && Number.isFinite(Number(asset.tokenPrice))) {
          tds[1].innerHTML = "<b>" + esc(fmtPrice(asset.tokenPrice)) + "</b>";
        }
      });
    };
    window.renderMarket.__bridgedNames = true;
  }

  function hookMarketClicks() {
    const box = $("marketTable");
    if (!box || box.__bridgedClick) return;
    box.__bridgedClick = true;
    box.addEventListener("click", (e) => {
      const tr = e.target.closest("tr, .market-row, [data-ticker]");
      if (!tr) return;
      let t = tr.getAttribute("data-ticker");
      if (!t) {
        const cell = tr.querySelector("td b, b, td");
        t = (cell?.textContent || "").trim().split(/\s+/)[0];
      }
      if (t && /^[A-Z0-9.]{1,12}$/i.test(t)) selectTicker(t.toUpperCase());
    });
  }

  function fillPairSelect() {
    const pair = $("chartPair");
    if (!pair) return;
    const seen = new Set([...pair.options].map((o) => o.textContent.replace(/\/USDT$/, "")));
    assets()
      .slice(0, 40)
      .forEach((a) => {
        const t = String(a.ticker || "").toUpperCase();
        if (!t || seen.has(t)) return;
        seen.add(t);
        const o = document.createElement("option");
        o.value = t + "/USDT";
        o.textContent = t + "/USDT";
        pair.appendChild(o);
      });
  }

  function applyMarketTab() {
    const tab = window.__pronousMwTab || "gainers";
    if (typeof window.renderMarket !== "function") return;
    const originalAssets = assets();
    if (!originalAssets.length) return;
    let rows = originalAssets.slice();
    if (tab === "gainers") rows = rows.filter((a) => Number(a.spreadPct) >= 0).sort((a, b) => Number(b.spreadPct) - Number(a.spreadPct));
    else if (tab === "losers") rows = rows.filter((a) => Number(a.spreadPct) < 0).sort((a, b) => Number(a.spreadPct) - Number(b.spreadPct));
    else if (tab === "volume") rows = rows.slice().sort((a, b) => Number(b.tokenPrice || 0) - Number(a.tokenPrice || 0));
    const saved = window.marketAssets;
    window.marketAssets = rows;
    try { window.renderMarket(); }
    finally { window.marketAssets = saved; }
  }

  function bindChrome() {
    document.querySelectorAll(".sig-tab").forEach((btn, i) => {
      if (btn.__bridged) return;
      btn.__bridged = true;
      btn.addEventListener("click", () => {
        document.querySelectorAll(".sig-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        window.__pronousSignalTab = ["all", "crypto", "stocks", "rwa"][i] || "all";
        renderSignalList();
      });
    });
    document.querySelectorAll(".mw-tab").forEach((btn, i) => {
      if (btn.__bridged) return;
      btn.__bridged = true;
      btn.addEventListener("click", () => {
        document.querySelectorAll(".mw-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        window.__pronousMwTab = ["gainers", "losers", "volume"][i] || "gainers";
        applyMarketTab();
      });
    });
    document.querySelectorAll(".tf-btn").forEach((btn) => {
      if (btn.__bridged) return;
      btn.__bridged = true;
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tf-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const asset = window.__pronousSelectedAsset || findAsset($("ticker")?.value || "NVDA");
        if (asset && typeof window.loadAssetChart === "function") window.loadAssetChart(asset, currentBar());
      });
    });
    const pair = $("chartPair");
    if (pair && !pair.__bridged) {
      pair.__bridged = true;
      pair.addEventListener("change", () => {
        const t = String(pair.value || pair.options[pair.selectedIndex]?.text || "").replace(/\/USDT$/, "");
        selectTicker(t);
      });
    }
    const cmc = $("cmcRadar");
    if (cmc && !cmc.__bridgedClick) {
      cmc.__bridgedClick = true;
      cmc.addEventListener("click", (e) => {
        const row = e.target.closest("[data-ticker], .cmc-radar-row, tr");
        if (!row || row.classList.contains("head")) return;
        let t = row.getAttribute("data-ticker");
        if (!t) {
          const cell = row.querySelector("b, td:nth-child(2), div:nth-child(2)");
          t = (cell?.textContent || "").trim().split(/\s+/)[0];
        }
        if (t && /^[A-Z0-9.]{1,12}$/i.test(t)) selectTicker(t.toUpperCase());
      });
    }
    document.querySelectorAll(".cmc-tab").forEach((btn, i) => {
      if (btn.__bridged) return;
      btn.__bridged = true;
      btn.addEventListener("click", () => {
        document.querySelectorAll(".cmc-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const map = ["rwa", "tokenisation", "all"];
        if (typeof window.setCmcTab === "function") window.setCmcTab(map[i] || "rwa");
      });
    });
  }

  function hookCmcRender() {
    const original = window.renderCMCRadar;
    if (typeof original !== "function" || original.__bridged) return;
    window.renderCMCRadar = function () {
      original.apply(this, arguments);
      const el = $("cmcRadar");
      if (!el) return;
      el.querySelectorAll(".cmc-radar-row, tr").forEach((row) => {
        if (row.classList.contains("head")) return;
        const cell = row.querySelector("b, td:nth-child(2), div:nth-child(2)");
        const t = (cell?.textContent || "").trim().split(/\s+/)[0];
        if (t) row.setAttribute("data-ticker", t.toUpperCase());
        row.style.cursor = "pointer";
      });
    };
    window.renderCMCRadar.__bridged = true;
  }

  function bindSignalTabs() {
    document.querySelectorAll('.sig-tab').forEach((btn) => {
      if (btn.__pronousBound) return;
      btn.__pronousBound = true;
      btn.addEventListener('click', () => {
        const text = (btn.textContent || '').trim().toLowerCase();
        window.__pronousSignalTab = text === 'all assets' ? 'all' : text;
        document.querySelectorAll('.sig-tab').forEach(b => b.classList.toggle('active', b === btn));
        renderSignalList();
      });
    });
  }

  function boot() {
    hookLoadMarket();
    hookScan();
    hookOpenAsset();
    hookRenderMarket();
    hookMarketClicks();
    hookCmcRender();
    bindChrome();
    bindSignalTabs();
    syncWalletFromApi();
    if (assets().length) {
      renderSignalList();
      fillPairSelect();
    }
    setInterval(() => { syncWalletFromApi(); }, 15000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 80));
  } else {
    setTimeout(boot, 80);
  }
})();
