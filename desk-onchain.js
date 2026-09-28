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
    return import("https://esm.sh/viem@2.21.19");
  }

  function wallet() {
    return {
      address: window.__pronousPrivyAddress || window.walletAddress || null,
      provider: window.__pronousPrivyProvider || window.walletProvider || window.ethereum || null
    };
  }

  async function ensureBsc(provider) {
    if (!provider || !provider.request) return;
    const chainId = await provider.request({ method: "eth_chainId" }).catch(() => null);
    if (String(chainId).toLowerCase() === "0x38") return;
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
    } catch (e) {
      if (e && (e.code === 4902 || String(e.message || "").includes("Unrecognized"))) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: "0x38",
            chainName: "BNB Smart Chain",
            nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
            rpcUrls: [RPC],
            blockExplorerUrls: ["https://bscscan.com"]
          }]
        });
      } else throw e;
    }
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
    if (!document.getElementById("executeOnchainBtn")) {
      const row = document.querySelector("#execution .poa-gate-row");
      if (row) {
        const btn = document.createElement("button");
        btn.id = "executeOnchainBtn";
        btn.type = "button";
        btn.textContent = "Execute on-chain";
        btn.disabled = true;
        btn.onclick = async function () {
          if (!window.__pronousSimulated || !wallet().address) return;
          if (typeof window.confirmAction === "function") await window.confirmAction();
          if (window.__pronousSimulated && window.executeOnchain) await window.executeOnchain();
        };
        row.insertBefore(btn, row.firstChild);
      }
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
      box.innerHTML =
        '<div class="muted small">ON-CHAIN WALLET \u00b7 BSC</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-top:8px">' +
        cell("BNB", fromWei(bnb, 18)) +
        cell("USDT", fromWei(usdt, 18)) +
        cell("USDC", fromWei(usdc, 18)) +
        cell("WBNB", fromWei(wbnb, 18)) +
        (stockToken ? cell("STOCK", fromWei(stock, 18)) : "") +
        "</div>" +
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
    const viem = await getViem();
    const hash = poaHash.startsWith("0x") ? poaHash : "0x" + poaHash;
    const padded = hash.length === 66 ? hash : "0x" + pad32(hash);
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
  async function sendTx(provider, tx, from) {
    const params = { from: from, to: tx.to, data: tx.data || tx.input || "0x", value: toHex(tx.value || "0") };
    if (tx.gas || tx.gasLimit) params.gas = toHex(tx.gas || tx.gasLimit);
    if (tx.gasPrice) params.gasPrice = toHex(tx.gasPrice);
    return provider.request({ method: "eth_sendTransaction", params: [params] });
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
    const w = wallet();
    if (!w.address || !w.provider || !w.provider.request) { set("Connect wallet before on-chain execute."); return; }
    if (!window.__pronousSimulated) { set("Run simulation before execute."); return; }
    try {
      await ensureBsc(w.provider);
      const fromToken = ((document.getElementById("fromTokenAddress") && document.getElementById("fromTokenAddress").value) || "").trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(fromToken)) { set("Set spend token (USDT / WBNB / USDC) first."); return; }
      const asset = pickAsset();
      const toToken = asset && asset.tokenContractAddress;
      const amount = document.getElementById("amount") && document.getElementById("amount").value;
      const t = ((document.getElementById("ticker") && document.getElementById("ticker").value) || "NVDA").trim().toUpperCase();
      set("Quote + build…");
      const qp = new URLSearchParams({
        action: "quoteBuild",
        ticker: t,
        fromTokenAddress: fromToken,
        amount: amount,
        userWalletAddress: w.address,
        vendor: "LiquidMesh",
        slippagePercent: "0.5",
        approveTransaction: "true"
      });
      if (toToken) qp.set("toTokenAddress", toToken);
      const br = await fetch("/api/agent?" + qp.toString());
      const built = await br.json();
      if (!br.ok || built.error) throw new Error(built.error || "Quote + build failed");
      window.latestQuote = built;
      const quoteId = pickQuoteId(built.built || built);
      const mode = pickExecutionMode(built.built || built);
      set("Built swap (" + (mode || "SWAP") + ") · simulation required…");
      const rfq = pickRfq(built);
      const tx = pickTx(built);
      if (rfq && rfq.typedDataToSign) {
        set("Sign RFQ in wallet\u2026");
        const sig = await w.provider.request({ method: "eth_signTypedData_v4", params: [w.address, JSON.stringify(rfq.typedDataToSign)] });
        set("Submitting RFQ order\u2026");
        const body = {
          userSignature: sig,
          vendor: rfq.vendor || (asset && asset.platformId) || "ondo",
          quoteId: quoteId || rfq.quoteId,
          requestId: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now())
        };
        const sr = await fetch("/api/trade?action=submitRfq", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const sj = await sr.json();
        if (!sr.ok || sj.error) throw new Error(sj.error || "RFQ submit failed");
        const orderId = (sj.data && sj.data.data && sj.data.data.orderId) || (sj.data && sj.data.orderId) || rfq.orderId || body.requestId;
        set("RFQ submitted \u00b7 " + orderId);
        if (typeof setExecutionStep === "function") setExecutionStep("execution", "RFQ");
        await createExecutedPoa("rfq:" + orderId, { mode: "RFQ", orderId: orderId });
        await refreshPoaChain();
        return;
      }
      if (!tx || !tx.to) throw new Error("Build did not return an EVM tx or RFQ payload");
      set("Confirm swap in wallet\u2026");
      const txHash = await sendTx(w.provider, tx, w.address);
      set("Broadcast \u00b7 " + String(txHash).slice(0, 12) + "\u2026");
      if (typeof setExecutionStep === "function") setExecutionStep("execution", "SENT");
      const link = document.getElementById("poaAnchorTx");
      if (link) {
        link.href = "https://bscscan.com/tx/" + txHash;
        link.textContent = String(txHash).slice(0, 18) + "\u2026";
        link.style.display = "inline";
      }
      await createExecutedPoa(txHash, { mode: "SWAP" });
      await refreshPoaChain();
      await loadWalletBalances(toToken);
    } catch (e) {
      set("Execute failed: " + (e.message || e));
      console.error("PRONOUS executeOnchain", e);
    }
  };

  function enableExecuteIfReady() {
    const btn = document.getElementById("executeOnchainBtn");
    if (!btn) return;
    btn.disabled = !(window.__pronousSimulated && wallet().address);
    btn.title = btn.disabled
      ? "Connect wallet and pass simulation first."
      : "Click to confirm and send the swap from your wallet.";
  }

  window.addEventListener("pronous:simulation-passed", enableExecuteIfReady);

  const origConfirm = window.confirmAction;
  window.confirmAction = async function () {
    if (typeof origConfirm === "function") await origConfirm();
    enableExecuteIfReady();
    setTimeout(refreshPoaChain, 400);
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
