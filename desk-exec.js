(function () {
  const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  const USDT = "0x55d398326f99059fF775485246999027B3197955";
  const USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
  const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

  function el(id) { return document.getElementById(id); }

  function setHint(html) {
    let box = el("spendHint");
    if (!box) {
      const host = el("execution");
      if (!host) return;
      box = document.createElement("div");
      box.id = "spendHint";
      box.className = "result";
      box.style.whiteSpace = "normal";
      const quote = el("quoteResult");
      if (quote && quote.parentNode) quote.parentNode.insertBefore(box, quote);
      else host.appendChild(box);
    }
    box.innerHTML = html;
  }

  function tokenLabel(addr) {
    const a = String(addr || "").toLowerCase();
    if (a === NATIVE.toLowerCase()) return "BNB (native)";
    if (a === WBNB.toLowerCase()) return "WBNB";
    if (a === USDT.toLowerCase()) return "USDT";
    if (a === USDC.toLowerCase()) return "USDC";
    return "token";
  }

  function ensureBnbButton() {
    const buttons = document.querySelectorAll("#execution button.secondary");
    let hasBnb = false;
    buttons.forEach((b) => { if ((b.textContent || "").trim() === "BNB") hasBnb = true; });
    const usdtBtn = Array.from(buttons).find((b) => (b.textContent || "").trim() === "USDT");
    if (hasBnb || !usdtBtn || !usdtBtn.parentNode) return;
    const btn = document.createElement("button");
    btn.className = "secondary";
    btn.type = "button";
    btn.style.width = "auto";
    btn.textContent = "BNB";
    btn.onclick = function () { window.setSpendToken(NATIVE); };
    usdtBtn.parentNode.insertBefore(btn, usdtBtn);
  }

  const origSet = window.setSpendToken;
  window.setSpendToken = function (addr) {
    if (typeof origSet === "function") origSet(addr);
    else if (el("fromTokenAddress")) el("fromTokenAddress").value = addr;
    const label = tokenLabel(addr);
    setHint(
      "<div class=\"muted small\">Spend token: <b>" + label + "</b>. " +
      "Enter the amount in human units (for example 1 or 0.5). " +
      "Connect a wallet on <b>BSC Mainnet</b>, run preflight, then get a quote.</div>"
    );
  };

  const origQuote = window.requestQuote;
  window.requestQuote = async function () {
    const box = el("quoteResult");
    const from = ((el("fromTokenAddress") && el("fromTokenAddress").value) || "").trim();
    if (!from) {
      if (box) box.textContent = "Choose a spend token first (USDT, USDC, WBNB, or BNB).";
      return;
    }
    if (typeof origQuote === "function") {
      try {
        await origQuote();
      } catch (e) {
        if (box) box.textContent = "Quote error: " + (e.message || e);
      }
    }
  };

  function boot() {
    ensureBnbButton();
    const from = el("fromTokenAddress");
    if (from && !String(from.value || "").trim()) {
      // Prefer USDT for supported quote routes; native BNB is often gas-only.
      from.value = USDT;
    }
    setHint(
      "<div class=\"muted small\">" +
      "Enter an amount, select a spend token, then <b>Run preflight</b>. " +
      "Quote stays locked until preflight passes. " +
      "Execution requires wallet connection, simulation, and your confirmation on BSC Mainnet." +
      "</div>"
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 400); });
  } else {
    setTimeout(boot, 400);
  }
})();
