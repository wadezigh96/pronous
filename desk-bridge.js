/**
 * PRONOUS desk-bridge — even integration of wallet + market + chart + on-chain.
 * Does not replace desk-app / wallet-connect; only wires panels together.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

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
      if (!gate.dataset.locked) {
        gate.textContent = "Wallet connected · run preflight before confirm.";
      }
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
    if (!address) return;
    applyWalletEverywhere({
      address,
      source: typeof api.getSource === "function" ? api.getSource() : "injected",
      chainId: typeof api.getChainId === "function" ? api.getChainId() : 56
    });
  }

  window.addEventListener("pronous:privy-wallet-connected", (e) => {
    applyWalletEverywhere(e.detail || {});
  });
  window.addEventListener("pronous:privy-wallet-disconnected", () => {
    applyWalletEverywhere(null);
  });

  function pickSignals(list) {
    const prefer = ["NVDA", "AAPL", "TSLA", "BTC", "ETH", "BNB", "SPY", "GOLD"];
    const byTicker = new Map();
    list.forEach((a) => {
      const t = String(a.ticker || "").toUpperCase();
      if (!t) return;
      if (!byTicker.has(t)) byTicker.set(t, a);
    });
    const out = [];
    prefer.forEach((t) => {
      if (byTicker.has(t)) out.push(byTicker.get(t));
    });
    list.forEach((a) => {
      if (out.length >= 8) return;
      const t = String(a.ticker || "").toUpperCase();
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

  function fmtPriceLocal(v) { return fmtPrice(v); }

  function renderSignalList() {
    const box = $("signalList");
    if (!box) return;
    const rows = pickSignals(assets());
    if (!rows.length) return;
    box.innerHTML = rows
      .map((a) => {
        const t = String(a.ticker || "").toUpperCase();
        const name = esc(a.companyName || a.tokenSymbol || t);
        const px = Number(a.tokenPrice ?? a.referencePrice);
        const gap = Number(a.spreadPct);
        const pos = Number.isFinite(gap) ? gap >= 0 : true;
        const badge = !Number.isFinite(gap) ? "neutral" : Math.abs(gap) < 0.15 ? "neutral" : pos ? "bullish" : "neutral";
        const badgeLabel = badge === "bullish" ? "Bullish" : "Neutral";
        const spark = pos ? "▂▃▄▅▆▇" : "▇▆▅▄▃▂";
        const letter = t.slice(0, 1) || "?";
        return (
          '<div class="signal-row" role="button" tabindex="0" data-ticker="' +
          esc(t) +
          '">' +
          '<div class="sig-asset"><span class="sig-logo ' +
          logoClass(t) +
          '">' +
          esc(letter) +
          "</span><div><b>" +
          esc(t) +
          "</b><span>" +
          name +
          "</span></div></div>" +
          '<div class="sig-price">' +
          fmtPriceLocal(px) +
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
    });
  }

  function selectTicker(ticker) {
    if (!ticker) return;
    const t = String(ticker).toUpperCase();
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
    const asset = assets().find((a) => String(a.ticker || "").toUpperCase() === t);
    if (asset) {
      const last = $("chartLast");
      const chg = $("chartChange");
      const label = $("tapeLabel");
      const px = Number(asset.tokenPrice ?? asset.referencePrice);
      const gap = Number(asset.spreadPct);
      if (last && Number.isFinite(px)) last.textContent = px.toFixed(2);
      if (chg && Number.isFinite(gap)) {
        chg.textContent = fmtPct(gap);
        chg.className = gap >= 0 ? "pos" : "neg";
      }
      if (label) label.textContent = t + "/USDT · live gap " + fmtPct(gap);
      if (typeof window.loadOnchain === "function") {
        try {
          window.loadOnchain(asset);
        } catch (_) {}
      }
    }
    if (typeof window.drawGapChart === "function") {
      try {
        window.drawGapChart();
      } catch (_) {}
    }
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
        renderSignalList();
        const t = ($("ticker")?.value || "NVDA").toUpperCase();
        selectTicker(t);
        if (typeof window.drawGapChart === "function") window.drawGapChart();
      } catch (e) {
        console.warn("PRONOUS bridge post-market", e);
      }
      return r;
    };
    window.loadMarket.__bridged = true;
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
        const cell = tr.querySelector("td, th, b");
        t = (cell?.textContent || "").trim().split(/\s+/)[0];
      }
      if (t && /^[A-Z0-9.]{1,12}$/i.test(t)) selectTicker(t.toUpperCase());
    });
  }

  function boot() {
    hookLoadMarket();
    hookScan();
    hookMarketClicks();
    syncWalletFromApi();
    if (assets().length) renderSignalList();
    setInterval(() => {
      if (typeof window.loadMarket === "function") {
        try {
          window.loadMarket({ silent: true });
        } catch (_) {}
      }
      syncWalletFromApi();
    }, 60000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 80));
  } else {
    setTimeout(boot, 80);
  }
})();
