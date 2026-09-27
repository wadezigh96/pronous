(function () {
  function fmtPx(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "\u2014";
    return n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(3) : n.toPrecision(4);
  }

  window.renderRadar = function renderRadar() {
    const rows = (window.marketAssets || marketAssets || [])
      .filter((x) => Number.isFinite(Number(x.spreadPct)))
      .sort((a, b) => Math.abs(Number(b.spreadPct)) - Math.abs(Number(a.spreadPct)));
    const el = document.getElementById("radar");
    if (!el) return;
    const top = rows.slice(0, 8);
    el.style.whiteSpace = "normal";
    if (!top.length) {
      el.innerHTML = "No tokenized-stock gap data.";
      return;
    }
    el.innerHTML =
      '<div class="muted small" style="margin-bottom:8px">LIVE \u00b7 token vs reference \u00b7 ' +
      top.length +
      " of " +
      rows.length +
      " gaps</div>" +
      top
        .map((x) => {
          const gap = Number(x.spreadPct);
          return (
            '<div class="radar-gap-row" onclick="openAsset(' +
            JSON.stringify(x.ticker) +
            "," +
            JSON.stringify(x.platformId || "") +
            ')"><div><b>' +
            esc(x.ticker) +
            '</b> <span class="muted small">' +
            esc(x.platformId || "") +
            '</span></div><div class="muted small">' +
            fmtPx(x.tokenPrice) +
            " / " +
            fmtPx(x.referencePrice) +
            '</div><div class="' +
            (gap >= 0 ? "pos" : "neg") +
            '">' +
            (gap > 0 ? "+" : "") +
            gap.toFixed(2) +
            "%</div></div>"
          );
        })
        .join("");
    const tape = document.getElementById("liveGapTape");
    if (tape) {
      tape.innerHTML = rows
        .slice(0, 12)
        .map((x) => {
          const gap = Number(x.spreadPct);
          return (
            "<span>" +
            esc(x.ticker) +
            ' <em class="' +
            (gap >= 0 ? "pos" : "neg") +
            '">' +
            (gap > 0 ? "+" : "") +
            gap.toFixed(2) +
            "%</em></span>"
          );
        })
        .join("");
    }
  };

  const originalLoadMarket = window.loadMarket;
  window.loadMarket = async function loadMarket(opts) {
    const silent = opts && opts.silent;
    const box = document.getElementById("marketTable");
    const existing = window.marketAssets || (typeof marketAssets !== "undefined" ? marketAssets : []);
    if (box && !existing.length) box.textContent = "Loading live RWA gaps\u2026";
    try {
      const r = await fetch("/api/agent?action=assets", { cache: "no-store" });
      const j = await r.json();
      if (j.error && !(j.assets && j.assets.length)) throw new Error(j.error || j.message || "RWA feed error");
      marketAssets = j.assets || [];
      window.marketAssets = marketAssets;
      const mode = document.getElementById("marketMode");
      if (mode) {
        mode.textContent = (j.mode || "unknown").toUpperCase();
        mode.className = "tag " + (j.mode === "live-data" ? "live" : "demo");
      }
      const kpiMode = document.getElementById("kpiMode");
      if (kpiMode) kpiMode.textContent = (j.mode || "\u2014").replace("live-data", "LIVE");
      const kpiAssets = document.getElementById("kpiAssets");
      if (kpiAssets) kpiAssets.textContent = String((j.summary && j.summary.total) || marketAssets.length);
      const updated = document.getElementById("marketUpdated");
      if (updated) {
        updated.textContent =
          "Updated " +
          new Date(j.updatedAt || Date.now()).toLocaleTimeString() +
          " \u00b7 " +
          ((j.summary && j.summary.actionable) || 0) +
          " actionable gaps";
      }
      const pulse = document.getElementById("radarPulse");
      if (pulse) pulse.textContent = "LIVE " + new Date().toLocaleTimeString();
      if (typeof updateGapKpi === "function") updateGapKpi();
      if (typeof renderMarket === "function") renderMarket();
      if (typeof renderRadar === "function") renderRadar();
      if (!silent && typeof renderClock === "function") renderClock(marketAssets[0]);
      if (window.drawGapChart) drawGapChart();
    } catch (e) {
      if (typeof originalLoadMarket === "function" && !existing.length) {
        try {
          return await originalLoadMarket(opts);
        } catch (_) {}
      }
      if (box && !existing.length) box.textContent = "Market data error: " + e.message;
    }
  };

  if (!document.getElementById("desk-live-style")) {
    const style = document.createElement("style");
    style.id = "desk-live-style";
    style.textContent =
      ".radar-gap-row{display:grid;grid-template-columns:1.2fr 1fr auto;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid rgba(245,197,66,.1);cursor:pointer}" +
      ".radar-gap-row:hover{background:rgba(245,197,66,.05)}.radar-gap-row:last-child{border-bottom:0}" +
      "#liveGapTape em{font-style:normal;margin-left:4px}#radarPulse{width:auto}";
    document.head.appendChild(style);
  }

  if (window.marketAssets && window.marketAssets.length) {
    if (typeof renderRadar === "function") renderRadar();
  } else if (typeof loadMarket === "function") {
    loadMarket({ silent: true });
  }
})();
