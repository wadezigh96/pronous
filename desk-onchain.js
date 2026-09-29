(function () {
  const ANCHOR = "0xD729eFf0E050195D464cC9597d7A5Cc7194911B5";
  const RPC = "https://bsc-dataseed.binance.org";
  const TOKENS = {
    USDT: "0x55d398326f99059fF775485246999027B3197955",
    USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"
  };
  const STATUS = ["PLANNED", "SIMULATED", "CONFIRMED", "EXECUTED", "BLOCKED", "REJECTED", "EXPIRED"];
  const GET_RECORD_ABI = [{
    type: "function",
    name: "getRecord",
    stateMutability: "view",
    inputs: [{ name: "poaHash", type: "bytes32" }],
    outputs: [
      { name: "actor", type: "address" },
      { name: "status", type: "uint8" },
      { name: "timestamp", type: "uint64" },
      { name: "poaId", type: "string" },
      { name: "exists", type: "bool" }
    ]
  }];

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }
  function short(a) {
    a = String(a || "");
    return a.length > 12 ? a.slice(0, 6) + "\u2026" + a.slice(-4) : a || "\u2014";
  }
  function fmtAmt(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "\u2014";
    if (n === 0) return "0";
    if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (n >= 1) return n.toFixed(4);
    return n.toPrecision(4);
  }

  async function rpc(method, params) {
    const r = await fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params })
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message || "RPC error");
    return j.result;
  }

  async function getViem() {
    return import("/vendor/privy-bundle.js");
  }


  function wallet() {
    const api = window.PRONOUS_WALLET;
    return {
      address: api && typeof api.getAddress === "function" ? api.getAddress() : null,
      chainId: api && typeof api.getChainId === "function" ? api.getChainId() : null,
      source: api && typeof api.getSource === "function" ? api.getSource() : null,
      api: api && typeof api.request === "function" ? api : null
    };
  }

  function pad32(hex) {
    return String(hex || "").replace(/^0x/, "").padStart(64, "0");
  }

  async function erc20Balance(token, owner) {
    const data = "0x70a08231" + pad32(owner);
    const raw = await rpc("eth_call", [{ to: token, data: data }, "latest"]);
    return BigInt(raw || "0x0");
  }

  async function nativeBalance(owner) {
    return BigInt((await rpc("eth_getBalance", [owner, "latest"])) || "0x0");
  }

  function fromWei(bi, decimals) {
    const s = bi.toString().padStart(decimals + 1, "0");
    const whole = s.slice(0, -decimals);
    const frac = s.slice(-decimals).replace(/0+$/, "").slice(0, 6);
    return frac ? whole + "." + frac : whole;
  }

  function cell(label, value) {
    return '<div style="padding:8px;border:1px solid rgba(245,197,66,.14);border-radius:10px"><label class="muted small">' +
      esc(label) + "</label><div><b>" + esc(fmtAmt(value)) + "</b></div></div>";
  }

  function ensurePanels() {
    if (!document.getElementById("walletOnchain")) {
      const exec = document.getElementById("execution");
      const box = document.createElement("div");
      box.id = "walletOnchain";
      box.className = "result";
      box.style.whiteSpace = "normal";
      box.innerHTML = '<div class="muted small">Connect wallet to load on-chain balances.</div>';
      const ctx = document.querySelector("#execution .wallet-context");
      if (ctx && ctx.parentNode) ctx.parentNode.insertBefore(box, ctx.nextSibling);
      else if (exec) exec.appendChild(box);
    }
    const existingExecute = document.getElementById("executeOnchainBtn");
    if (existingExecute && !existingExecute.__pronousBound) {
      const btn = existingExecute;
      btn.__pronousBound = true;
        btn.onclick = async function () {
          const status = document.getElementById("poaGateStatus");
          if (!wallet().address) {
            if (status) status.textContent = "Connect wallet before Execute.";
            return;
          }
          if (!window.__pronousSimulated) {
            if (status) status.textContent = "Run simulation first. Execute stays gated.";
            return;
          }
          if (typeof window.confirmAction !== "function") {
            if (status) status.textContent = "Confirmation handler unavailable. Execution blocked.";
            return;
          }
          const result = await window.confirmAction();
          if (result !== true) {
            if (status) status.textContent = "Confirmation was not accepted. Execution blocked.";
            return;
          }
          if (typeof window.executeOnchain !== "function") {
            if (status) status.textContent = "Execution handler unavailable. Execution blocked.";
            return;
          }
          await window.executeOnchain();
        };
    }
    if (!document.getElementById("poaChainStatus")) {
      const poa = document.getElementById("poa-section");
      if (poa) {
        const d = document.createElement("div");
        d.id = "poaChainStatus";
        d.className = "result";
        d.style.whiteSpace = "normal";
        d.style.marginTop = "10px";
        d.innerHTML = '<div class="muted small">On-chain POA reader idle.</div>';
        const cur = document.getElementById("poaCurrent");
        if (cur && cur.parentNode) cur.parentNode.insertBefore(d, cur.nextSibling);
        else poa.appendChild(d);
      }
    }
  }

  async function loadWalletBalances(stockToken) {
    ensurePanels();
    const address = wallet().address;
    const box = document.getElementById("walletOnchain");
    if (!box) return;
    if (!address) {
      box.innerHTML = '<div class="muted small">Connect wallet to read BSC balances.</div>';
      return;
    }
    box.innerHTML = '<div class="muted small">Reading BSC balances\u2026</div>';
    try {
      const bnb = await nativeBalance(address);
      const usdt = await erc20Balance(TOKENS.USDT, address);
      const usdc = await erc20Balance(TOKENS.USDC, address);
      const wbnb = await erc20Balance(TOKENS.WBNB, address);
      const stock = stockToken ? await erc20Balance(stockToken, address) : 0n;
      const bnbHuman = fromWei(bnb, 18);
      const usdtHuman = fromWei(usdt, 18);
      const usdcHuman = fromWei(usdc, 18);
      const wbnbHuman = fromWei(wbnb, 18);
      const gates = window.PRONOUS_EXECUTION_GATES;
      const gasReserve = gates ? gates.GAS_RESERVE_BNB : 0.0002;
      const spendableBnb = gates ? gates.safeSpendableBnb(bnbHuman, gasReserve) : Math.max(0, Number(bnbHuman) - gasReserve);
      const hasStable = Number(usdtHuman) > 0 || Number(usdcHuman) > 0;
      box.innerHTML =
        '<div class="muted small">ON-CHAIN WALLET · BSC MAINNET</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-top:8px">' +
        cell("BNB", bnbHuman) +
        cell("USDT", usdtHuman) +
        cell("USDC", usdcHuman) +
        cell("WBNB", wbnbHuman) +
        (stockToken ? cell("STOCK", fromWei(stock, 18)) : "") +
        cell("Spendable BNB*", spendableBnb.toFixed(6)) +
        "</div>" +
        '<div class="muted small" style="margin-top:8px">' +
        (hasStable
          ? "Stablecoin balance detected · quote can use USDT/USDC if Binance route allows it."
          : "BNB-only wallet detected · keep BNB for gas. Native BNB → NVDAon is not enabled by the current Binance route, so Execute remains gated.") +
        '</div>' +
        '<div class="muted small" style="margin-top:6px">*Reserve: 0.0002 BNB for gas. No transaction is broadcast by balance checking.</div>' +
        '<div class="muted small" style="margin-top:8px"><a href="https://bscscan.com/address/' +
        esc(address) + '" target="_blank" rel="noopener">' + esc(short(address)) + "</a></div>";
    } catch (e) {
      box.innerHTML = '<div class="muted small">Balance read failed: ' + esc(e.message || e) + "</div>";
    }
  }

  function pickAsset() {
    const t = ((document.getElementById("ticker") && document.getElementById("ticker").value) || "NVDA").trim().toUpperCase();
    const list = window.marketAssets || [];
    return list.find((a) => String(a.ticker).toUpperCase() === t) || list[0] || null;
  }

  function decorateRadarLinks() {
    const rows = document.querySelectorAll("#radar .radar-gap-row");
    const list = window.marketAssets || [];
    rows.forEach((row) => {
      if (row.querySelector(".bsc-link")) return;
      const ticker = row.querySelector("b") && row.querySelector("b").textContent;
      const asset = list.find((a) => a.ticker === ticker);
      if (!asset || !asset.tokenContractAddress) return;
      const a = document.createElement("a");
      a.className = "bsc-link muted small";
      a.href = "https://bscscan.com/token/" + asset.tokenContractAddress;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "BscScan";
      a.onclick = function (ev) { ev.stopPropagation(); };
      row.appendChild(a);
    });
  }

  function unwrapOnchain(value, depth) {
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

  async function autoLoadOnchain() {
    const asset = pickAsset();
    if (!asset || !asset.tokenContractAddress) return;
    if (typeof window.loadOnchain === "function") {
      try { await window.loadOnchain(asset); } catch (e) { console.warn("auto onchain", e); }
    }
    await loadWalletBalances(asset.tokenContractAddress);
    decorateRadarLinks();
  }

  async function readPoaOnchain(poaHash) {
    if (!poaHash) return null;
    const hash = poaHash.startsWith("0x") ? poaHash : "0x" + poaHash;
    const padded = hash.length === 66 ? hash : "0x" + pad32(hash);
    const viem = await getViem();
    const data = viem.encodeFunctionData({ abi: GET_RECORD_ABI, functionName: "getRecord", args: [padded] });
    const raw = await rpc("eth_call", [{ to: ANCHOR, data: data }, "latest"]);
    if (!raw || raw === "0x") return { exists: false };
    try {
      const decoded = viem.decodeFunctionResult({ abi: GET_RECORD_ABI, functionName: "getRecord", data: raw });
      const actor = decoded[0], status = decoded[1], timestamp = decoded[2], poaId = decoded[3], exists = decoded[4];
      return {
        exists: !!exists,
        actor: actor,
        status: Number(status),
        statusLabel: STATUS[Number(status)] || String(status),
        timestamp: Number(timestamp),
        poaId: poaId
      };
    } catch (e) {
      return { exists: false, error: e.message };
    }
  }

  async function refreshPoaChain() {
    ensurePanels();
    const box = document.getElementById("poaChainStatus");
    if (!box) return;
    const proof = window.currentPOA;
    const hash = proof && (proof.poaHash || proof.hash);
    if (!hash) {
      box.innerHTML =
        '<div class="muted small">Create a POA, then this panel reads <code>PoaAnchor.getRecord</code> on BSC.</div>' +
        '<div class="muted small"><a href="https://bscscan.com/address/' + ANCHOR + '#readContract" target="_blank" rel="noopener">Read contract 0xD729\u202611B5</a></div>';
      return;
    }
    box.innerHTML = '<div class="muted small">Reading PoaAnchor\u2026</div>';
    try {
      const rec = await readPoaOnchain(hash);
      if (!rec || !rec.exists) {
        box.innerHTML = '<div class="muted small">Hash not anchored yet.</div><code>' + esc(String(hash).slice(0, 18)) + "\u2026</code>";
        return;
      }
      box.innerHTML =
        "<div><b>ON-CHAIN POA</b> \u00b7 " + esc(rec.statusLabel) + "</div>" +
        '<div class="muted small">' + esc(rec.poaId || "") + " \u00b7 actor " +
        '<a href="https://bscscan.com/address/' + esc(rec.actor) + '" target="_blank" rel="noopener">' + esc(short(rec.actor)) + "</a></div>" +
        '<div class="muted small">' + (rec.timestamp ? new Date(rec.timestamp * 1000).toISOString() : "") + "</div>";
    } catch (e) {
      box.innerHTML = '<div class="muted small">POA read failed: ' + esc(e.message || e) + "</div>";
    }
  }

  function pickQuoteId(quote) {
    if (!quote) return "";
    return quote.quoteId || (quote.data && quote.data.quoteId) || (quote.quote && quote.quote.quoteId) ||
      (Array.isArray(quote.data) && quote.data[0] && quote.data[0].quoteId) || "";
  }
  function pickExecutionMode(quote) {
    const q = (quote && (quote.quote || quote.data)) || quote || {};
    return String(q.executionMode || (q.data && q.data.executionMode) || "").toUpperCase();
  }
  function pickTx(built) {
    const root = (built && built.built) || built || {};
    const data = root.data || root;
    return data.tx || data.evmTx || data.swapTransaction || data.transaction || root.tx || null;
  }
  function pickRfq(built) {
    const root = (built && built.built) || built || {};
    const data = root.data || root;
    return data.rfq || root.rfq || null;
  }
  function toHex(v) {
    if (v == null || v === "") return "0x0";
    const s = String(v);
    if (s.startsWith("0x")) return s;
    try { return "0x" + BigInt(s).toString(16); } catch (_) { return "0x0"; }
  }

  async function sendTx(api, tx, from, chainId) {
    if (!api || typeof api.request !== "function") throw new Error("Active wallet API unavailable");
    const policy = window.PRONOUS_TX_POLICY;
    if (!policy) throw new Error("Transaction policy unavailable");
    const checked = policy.validateBroadcastTx(tx, chainId);
    if (!checked.ok) throw new Error(checked.error);
    const params = { from: from, to: checked.to, data: checked.data, value: "0x0" };
    if (tx.gas || tx.gasLimit) params.gas = toHex(tx.gas || tx.gasLimit);
    if (tx.gasPrice) params.gasPrice = toHex(tx.gasPrice);
    return api.request("eth_sendTransaction", [params], "pronous-desk");
  }

  async function createExecutedPoa(txHash, extra) {
    const t = ((document.getElementById("ticker") && document.getElementById("ticker").value) || "NVDA").trim().toUpperCase();
    const intent = {
      ticker: t,
      amount: document.getElementById("amount") && document.getElementById("amount").value,
      wallet: wallet().address,
      txHash: txHash,
      extra: extra || {}
    };
    const input = {
      action: "EXECUTE_ONCHAIN",
      status: "EXECUTED",
      network: "BSC",
      asset: { ticker: t },
      intent: intent,
      txHash: txHash,
      userConfirmation: true
    };
    const r = await fetch("/api/poa?action=create&proof=" + encodeURIComponent(JSON.stringify(input)));
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || "POA EXECUTED create failed");
    window.currentPOA = j.proof;
    try {
      const ledger = JSON.parse(localStorage.getItem("pronous_poa_ledger_v1") || "[]");
      ledger.unshift({ poaId: j.proof.poaId, status: j.proof.status, hash: j.proof.poaHash, txHash: txHash, at: j.proof.timestamp });
      localStorage.setItem("pronous_poa_ledger_v1", JSON.stringify(ledger.slice(0, 20)));
      if (typeof window.renderPOALedger === "function") window.renderPOALedger();
    } catch (_) {}
    const box = document.getElementById("poaCurrent");
    if (box) {
      box.innerHTML = '<div class="poa-proof"><div><b>' + esc(j.proof.poaId) + "</b> \u00b7 EXECUTED</div><code>" +
        esc(j.proof.poaHash) + '</code><div class="muted small"><a href="https://bscscan.com/tx/' +
        esc(txHash) + '" target="_blank" rel="noopener">' + esc(txHash) + "</a></div></div>";
    }
    return j.proof;
  }

  window.executeOnchain = async function executeOnchain() {
    const status = document.getElementById("poaGateStatus");
    const set = function (t) { if (status) status.textContent = t; };
    const btn = document.getElementById("executeOnchainBtn");
    const w = wallet();
    const state = window.__pronousExecutionState || (window.__pronousExecutionState = { inFlight: false });
    const gates = window.PRONOUS_EXECUTION_GATES;
    if (!gates) { set("Execution security module unavailable. Execution blocked."); return; }
    if (!w.address || !w.api) { set("Connect wallet before on-chain execute."); return; }
    if (!window.__pronousSimulated) { set("Run chain simulation before execute."); return; }
    if (!window.__pronousConfirmed) { set("Confirm action before wallet signing."); return; }
    if (!window.__pronousBuiltTx || !window.__pronousSimTxHash) { set("Simulated transaction is missing. Run simulation again."); return; }
    const currentBinding = await (async () => {
          const json = gates.canonicalJson({ params: window.__pronousExecutionParams ? window.__pronousExecutionParams() : {
            ticker: ((document.getElementById("ticker") && document.getElementById("ticker").value) || "NVDA").trim().toUpperCase(),
            amount: ((document.getElementById("amount") && document.getElementById("amount").value) || "").trim(),
            fromTokenAddress: ((document.getElementById("fromTokenAddress") && document.getElementById("fromTokenAddress").value) || "").trim(),
            wallet: w.address || ""
          }, tx: window.__pronousBuiltTx });
          const bytes = new TextEncoder().encode(json);
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
        })();
    if (currentBinding !== window.__pronousSimTxHash) {
      set("Transaction or execution inputs changed. Run simulation again.");
      window.__pronousSimulated = false;
      window.__pronousConfirmed = false;
      window.__pronousBuiltTx = null;
      return;
    }
    if (!gates.canExecute({
      wallet: w.address,
      simulated: window.__pronousSimulated,
      confirmed: window.__pronousConfirmed,
      paramsHash: currentBinding,
      simHash: window.__pronousSimTxHash
    })) {
      set("Execution gate blocked. Re-run simulation and confirmation.");
      return;
    }
    if (!gates.beginExecution(state)) {
      set("Execution already in progress.");
      return;
    }
    if (btn) btn.disabled = true;
    try {
      if (Number(w.chainId) !== 56) {
        if (typeof w.api.ensureBsc === "function") await w.api.ensureBsc();
        throw new Error("Wallet switched to BSC. Run simulation again after the chain change.");
      }
      const tx = window.__pronousBuiltTx;
      const t = ((document.getElementById("ticker") && document.getElementById("ticker").value) || "NVDA").trim().toUpperCase();
      const asset = pickAsset();
      const toToken = asset && asset.tokenContractAddress;
      if (!tx || !tx.to) throw new Error("Simulated transaction is unavailable. Run simulation again.");
      set("Final chain simulation…");
      const simUrl = "/api/agent?action=simulateTx&ticker=" + encodeURIComponent(t) + "&evmTx=" + encodeURIComponent(JSON.stringify(tx));
      const simRes = await fetch(simUrl);
      const simJson = await simRes.json();
      if (!simRes.ok || simJson.status !== "PASSED" || !simJson.simulation || simJson.simulation.status !== "PASSED") {
        throw new Error(simJson.reason || simJson.error || "Final BSC simulation failed");
      }
      set("Simulation passed · confirm in wallet…");
      const txHash = await sendTx(w.api, tx, w.address, w.chainId);
      set("Broadcast · " + String(txHash).slice(0, 12) + "…");
      // Broadcast succeeded. Clear every execution authorization immediately so
      // post-broadcast POA failures can never make the user resend the swap.
      window.__pronousSimulated = false;
      window.__pronousConfirmed = false;
      window.__pronousBuiltTx = null;
      window.__pronousSimulation = null;
      window.__pronousSimTxHash = null;
      window.__pronousParamsHash = null;
      if (gates) gates.endExecution(state);
      else state.inFlight = false;
      if (typeof setExecutionStep === "function") setExecutionStep("execution", "SENT");
      const link = document.getElementById("poaAnchorTx");
      if (link) {
        link.href = "https://bscscan.com/tx/" + txHash;
        link.textContent = String(txHash).slice(0, 18) + "…";
        link.style.display = "inline";
      }
      try {
        await createExecutedPoa(txHash, { mode: "SWAP" });
        await refreshPoaChain();
      } catch (poaError) {
        set(window.PRONOUS_EXECUTION_RESULT?.broadcastPoaFailureMessage
          ? window.PRONOUS_EXECUTION_RESULT.broadcastPoaFailureMessage(txHash)
          : "Transaksi terkirim (hash " + String(txHash) + "), pencatatan POA gagal; JANGAN kirim ulang");
        console.error("PRONOUS post-broadcast POA recording failed", poaError);
      }
      try { await loadWalletBalances(toToken); } catch (_) {}
    } catch (e) {
      set("Execute failed: " + (e.message || e));
      console.error("PRONOUS executeOnchain", e);
    } finally {
      if (gates) gates.endExecution(state);
      else state.inFlight = false;
      window.__pronousSimulated = false;
      window.__pronousConfirmed = false;
      window.__pronousBuiltTx = null;
      window.__pronousSimulation = null;
      window.__pronousSimTxHash = null;
      window.__pronousParamsHash = null;
      if (btn) btn.disabled = false;
    }
  };


  function enableExecuteIfReady() {
    const btn = document.getElementById("executeOnchainBtn");
    if (!btn) return;
    btn.disabled = false;
    btn.title = wallet().address
      ? (window.__pronousSimulated
        ? "Click to confirm and send the swap from your wallet."
        : "Run simulation first. Execute will remain gated until simulation passes.")
      : "Connect wallet first.";
  }

  window.addEventListener("pronous:simulation-passed", enableExecuteIfReady);

  const origConfirm = window.confirmAction;
  window.confirmAction = async function () {
    if (typeof origConfirm !== "function") return false;
    const result = await origConfirm();
    enableExecuteIfReady();
    setTimeout(refreshPoaChain, 400);
    return result;
  };

  window.addEventListener("pronous:privy-wallet-connected", function () {
    enableExecuteIfReady();
    const asset = pickAsset();
    loadWalletBalances(asset && asset.tokenContractAddress);
  });
  window.addEventListener("pronous:privy-wallet-disconnected", function () {
    enableExecuteIfReady();
    loadWalletBalances(null);
  });

  function wrapLoad() {
    if (window.__pronousOnchainWrapped) return;
    if (typeof window.loadMarket !== "function") { setTimeout(wrapLoad, 80); return; }
    window.__pronousOnchainWrapped = true;
    const origLoad = window.loadMarket;
    window.loadMarket = async function (opts) {
      const out = await origLoad(opts);
      if (!opts || !opts.silent) autoLoadOnchain();
      else decorateRadarLinks();
      return out;
    };
  }

  function boot() {
    ensurePanels();
    enableExecuteIfReady();
    wrapLoad();
    autoLoadOnchain();
    refreshPoaChain();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 700); });
  else setTimeout(boot, 700);
})();
