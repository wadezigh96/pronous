(function () {
  function fmtPx(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(3) : n.toPrecision(4);
  }

  function signalFor(x) {
    const q = String(x?.dataQuality || "").toLowerCase();
    const spread = x?.adjustedSpreadPct == null ? NaN : Number(x.adjustedSpreadPct);
    if (q === "missing_ratio") return { label: "MISSING RATIO", cls: "neg" };
    if (q !== "ok") return { label: "REVIEW DATA", cls: "muted" };
    if (Number.isFinite(spread) && Math.abs(spread) >= 1) return { label: spread > 0 ? "PREMIUM" : "DISCOUNT", cls: spread > 0 ? "pos" : "neg" };
    return { label: "OBSERVE", cls: "muted" };
  }

  function arm() {
    if (window.__pronousLiveArmed) return;
    if (typeof window.loadMarket !== "function" || typeof window.renderRadar !== "function") {
      setTimeout(arm, 40);
      return;
    }
    window.__pronousLiveArmed = true;
    hook();
  }

  function hook() {
    window.renderRadar = function renderRadar() {
      const rows = (window.__pronousRadarAssets || []);
      const el = document.getElementById("radar");
      if (!el) return;
      const top = rows.slice(0, 8);
      el.style.whiteSpace = "normal";
      if (!top.length) {
        const volumeUnavailable = window.__pronousRadarSummary?.volumeAvailable === false;
        el.innerHTML = '<div class="muted small">' +
          (volumeUnavailable
            ? 'Radar paused: upstream feed has no measured 24h volume; no assets were quoted, so no top-by-volume ranking is claimed.'
            : esc(window.__pronousRadarError || 'On-chain quote radar unavailable. No divergence is inferred from token/reference feed fields.')) +
          '</div>';
        const tape = document.getElementById("liveGapTape");
        if (tape) tape.textContent = volumeUnavailable ? "24H VOLUME UNAVAILABLE" : "ON-CHAIN QUOTES UNAVAILABLE";
        return;
      }
      el.innerHTML =
        '<div class="muted small" style="margin-bottom:8px">BUY-QUOTE vs REFERENCE · PancakeSwap quote-only · ' +
        esc(String(top[0].quoteSizeUSDT || 100)) + ' USDT input · ' + top.length + ' candidates · volume units unverified</div>' +
        '<div class="muted small" style="margin-bottom:8px">This is a one-way buy quote, not a sell quote or round-trip arbitrage calculation. Price impact may exceed the apparent gap.</div>' +
        top.map((x) => {
          const routed = x.routeStatus === "ROUTE";
          const gap = x.onchainGapPct == null ? null : Number(x.onchainGapPct);
          const context = String(x.marketContext || "MARKET_HOURS_UNCONFIRMED");
          const state = x.marketStatus || x.openState || "hours unconfirmed";
          const gapText = !routed ? String(x.routeStatus || "QUOTE ERROR") :
            gap == null || !Number.isFinite(gap) ? "NO REFERENCE" : ((gap > 0 ? "+" : "") + gap.toFixed(2) + "%");
          const signal = !routed ? {label:gapText,cls:"muted"} :
            gap == null || !Number.isFinite(gap) ? {label:"NO REFERENCE",cls:"muted"} :
            context === "MARKET_CLOSED_REFERENCE_MAY_BE_STALE" ? {label:"MARKET CLOSED · CHECK STALE REF",cls:"muted"} :
            Number(x.priceImpactPct) > Number(window.__pronousRadarSummary?.maxActionablePriceImpactPct || 1) ? {label:"HIGH IMPACT · REVIEW",cls:"muted"} :
            Math.abs(gap) >= 1 ? {label:gap > 0 ? "PREMIUM" : "DISCOUNT",cls:gap > 0 ? "pos" : "neg"} :
            {label:"BELOW THRESHOLD",cls:"muted"};
          const shownGap = routed && gap != null && Number.isFinite(gap);
          return (
            '<div class="radar-gap-row" role="button" tabindex="0" onclick="openAsset(' +
            JSON.stringify(x.ticker) + "," + JSON.stringify(x.platformId || "") +
            ')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openAsset(' +
            JSON.stringify(x.ticker) + "," + JSON.stringify(x.platformId || "") +
            ')}"><div><b>' + esc(x.ticker) +
            '</b> <span class="muted small">' + esc(x.platformId || "") +
            '</span><div class="muted small">' + esc(String(state)) + ' · ' + esc(context) + '</div></div>' +
            '<div class="muted small">' + (routed ? 'Quote: ' + fmtPx(x.quotePriceUSDTPerToken) + ' USDT/token' : 'Route: ' + esc(String(x.routeStatus || "QUOTE ERROR"))) +
            '<div class="muted small">Ref × ratio: ' + (x.referencePrice == null || x.shareRatio == null ? '—' : fmtPx(Number(x.referencePrice) * Number(x.shareRatio))) + '</div></div>' +
            '<div class="' + (shownGap && gap >= 0 ? "pos" : shownGap ? "neg" : "muted") + '">' +
            esc(gapText) + '<div class="small ' + signal.cls + '">' + esc(signal.label) + '</div>' +
            (x.priceImpactPct == null ? '' : '<div class="muted small">Impact ' + esc(Number(x.priceImpactPct).toFixed(3)) + '%</div>') +
            '</div></div>'
          );
        }).join("");
      const tape = document.getElementById("liveGapTape");
      if (tape) {
        tape.innerHTML = top.map((x) => {
          if (x.routeStatus !== "ROUTE" || x.onchainGapPct == null) {
            return "<span>" + esc(x.ticker) + ' <em class="muted">' + esc(x.routeStatus || "NO QUOTE") + '</em></span>';
          }
          const gap = Number(x.onchainGapPct);
          return "<span>" + esc(x.ticker) + ' <em class="' + (gap >= 0 ? "pos" : "neg") + '">' +
            (gap > 0 ? "+" : "") + gap.toFixed(2) + "%</em></span>";
        }).join("");
      }
    };

    const originalLoadMarket = window.loadMarket;
    window.loadMarket = async function loadMarket(opts) {
      const box = document.getElementById("marketTable");
      if (box && !(window.marketAssets || []).length) box.textContent = "Loading live RWA data…";
      try {
        const allAssets = [];
        let offset = 0;
        let pageCount = 0;
        let responseMeta = null;
        do {
          const response = await fetch("/api/agent?action=assets&limit=100&offset=" + offset, { cache: "no-store" });
          let payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            const code = payload.error || ("HTTP_" + response.status);
            if (response.status === 429) throw new Error("Rate limited. Wait 60 seconds before retrying.");
            if (response.status >= 500) throw new Error("Market API unavailable (" + code + "). Retry shortly.");
            throw new Error("Market API request failed (" + code + ").");
          }
          if (payload.mode !== "live-data" || !Array.isArray(payload.assets)) {
            throw new Error(payload.message || payload.error || "No verified live RWA feed is available.");
          }
          if (!responseMeta) responseMeta = payload;
          allAssets.push(...payload.assets);
          offset = payload.pagination?.nextOffset;
          pageCount += 1;
        } while (offset !== null && offset !== undefined && pageCount < 10);
        const j = { ...responseMeta, assets: allAssets };
        if (j.pagination?.total != null && allAssets.length < j.pagination.total) {
          throw new Error("Market asset list is incomplete; retry to continue pagination.");
        }
        marketAssets = allAssets;
        window.marketAssets = marketAssets;
        const mode = document.getElementById("marketMode");
        if (mode) {
          mode.textContent = "LIVE DATA";
          mode.className = "tag live";
        }
        const kpiMode = document.getElementById("kpiMode");
        if (kpiMode) kpiMode.textContent = "LIVE";
        const kpiAssets = document.getElementById("kpiAssets");
        if (kpiAssets) kpiAssets.textContent = String((j.summary && j.summary.total) || marketAssets.length);
        const updated = document.getElementById("marketUpdated");
        if (updated) updated.textContent = "Feed updated " +
          new Date(j.feedUpdatedAt || j.updatedAt || Date.now()).toLocaleTimeString() +
          " · " + marketAssets.length + " assets · quotes are separate from reference feed";
        try {
          const radarResponse = await fetch("/api/agent?action=radar&limit=5&sizeUSDT=100", { cache: "no-store" });
          const radarPayload = await radarResponse.json().catch(() => ({}));
          if (!radarResponse.ok || radarPayload.mode !== "live-data" || !Array.isArray(radarPayload.assets)) {
            const code = radarPayload.error || ("HTTP_" + radarResponse.status);
            throw new Error(radarResponse.status === 429 ? "rate limited" : code);
          }
          window.__pronousRadarAssets = radarPayload.assets;
          window.__pronousRadarSummary = radarPayload.summary || {};
          window.__pronousRadarError = null;
        } catch (radarError) {
          window.__pronousRadarAssets = [];
          window.__pronousRadarSummary = {};
          window.__pronousRadarError = radarError.message || "quote radar unavailable";
        }
        const pulse = document.getElementById("radarPulse");
        if (pulse) pulse.textContent = window.__pronousRadarError ? "QUOTE UNAVAILABLE" : "ON-CHAIN QUOTES";
        if (typeof updateGapKpi === "function") updateGapKpi();
        if (typeof renderMarket === "function") renderMarket();
        if (typeof renderRadar === "function") renderRadar();
        if (!(opts && opts.silent) && typeof renderClock === "function") renderClock(marketAssets[0]);
        if (window.drawGapChart) drawGapChart();
      } catch (e) {
        if (box) box.textContent = "Market data unavailable: " + (e.message || "unknown error") + ". No static/demo prices are substituted.";
        const mode = document.getElementById("marketMode");
        if (mode) { mode.textContent = "UNAVAILABLE"; mode.className = "tag demo"; }
        const kpiMode = document.getElementById("kpiMode");
        if (kpiMode) kpiMode.textContent = "OFFLINE";
        const pulse = document.getElementById("radarPulse");
        if (pulse) pulse.textContent = "API UNAVAILABLE";
        window.__pronousRadarAssets = [];
        window.__pronousRadarSummary = {};
        window.__pronousRadarError = e.message || "market API unavailable";
        if (typeof renderRadar === "function") renderRadar();
      }
    };

    if (!document.getElementById("desk-live-style")) {
      const style = document.createElement("style");
      style.id = "desk-live-style";
      style.textContent =
        ".radar-gap-row{display:grid;grid-template-columns:1.2fr 1fr auto;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid rgba(245,197,66,.1);cursor:pointer}" +
        ".radar-gap-row:hover,.radar-gap-row:focus{background:rgba(245,197,66,.05)}.radar-gap-row:last-child{border-bottom:0}" +
        ".market tbody tr[tabindex]{cursor:pointer}.market tbody tr[tabindex]:focus{outline:1px solid rgba(217,184,76,.32);outline-offset:-1px;background:#11161b}" +
        "#liveGapTape em{font-style:normal;margin-left:4px}#radarPulse{width:auto}" +
        "@media(max-width:560px){.radar-gap-row{grid-template-columns:minmax(0,1fr) auto!important;gap:6px!important}.radar-gap-row>div:nth-child(2){grid-column:1/-1;grid-row:2}.radar-gap-row>div:nth-child(3){grid-column:2;grid-row:1/3;text-align:right;max-width:42vw;overflow-wrap:anywhere}.radar-gap-row .small{font-size:10px}}";
      document.head.appendChild(style);
    }

    function bindMarketKeyboard() {
      document.querySelectorAll(".market tbody tr").forEach((row) => {
        if (row.dataset.pronousKeyboardBound === "1") return;
        row.dataset.pronousKeyboardBound = "1";
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        row.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          row.click();
        });
      });
    }

    const originalRenderMarket = window.renderMarket;
    if (typeof originalRenderMarket === "function") {
      window.renderMarket = function accessibleRenderMarket() {
        originalRenderMarket();
        bindMarketKeyboard();
      };
      bindMarketKeyboard();
    }

    if (window.marketAssets && window.marketAssets.length) renderRadar();
    else window.loadMarket({ silent: true });
  }

  arm();
})();
