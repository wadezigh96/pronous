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

  function ensureBnbButton() {
    const row = document.querySelector("#execution .row:has(button)");
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
    btn.onclick = function () { window.setSpendToken(NATIVE); window.applyDustAmount && window.applyDustAmount(); };
    usdtBtn.parentNode.insertBefore(btn, usdtBtn);
  }

  window.applyDustAmount = function applyDustAmount() {
    const amount = el("amount");
    const maxSpend = el("maxSpend");
    if (amount) amount.value = "0.0003";
    if (maxSpend) maxSpend.value = "1";
    const from = el("fromTokenAddress");
    if (from && !from.value) from.value = NATIVE;
    setHint(
      "<div><b>MICRO TEST</b> · 0.0003 BNB (~$0.20)</div>" +
      "<div class=\"muted small\">NVDA tokenized ~$200+. $0.20 BNB cukup untuk gas + uji quote kecil, bukan 1 saham. Pakai BNB native, bukan USDT.</div>"
    );
  };

  const origSet = window.setSpendToken;
  window.setSpendToken = function (addr) {
    if (typeof origSet === "function") origSet(addr);
    else if (el("fromTokenAddress")) el("fromTokenAddress").value = addr;
    const label = addr.toLowerCase() === NATIVE.toLowerCase() ? "BNB native" :
      addr.toLowerCase() === WBNB.toLowerCase() ? "WBNB" :
      addr.toLowerCase() === USDT.toLowerCase() ? "USDT (18 dec, BSC)" :
      addr.toLowerCase() === USDC.toLowerCase() ? "USDC" : "token";
    setHint("<div class=\"muted small\">Spend = <b>" + label + "</b>. Amount diisi human units (0.0003 BNB), API mengirim wei.</div>");
  };

  const origQuote = window.requestQuote;
  window.requestQuote = async function () {
    const box = el("quoteResult");
    const from = ((el("fromTokenAddress") && el("fromTokenAddress").value) || "").trim();
    const amt = (el("amount") && el("amount").value) || "";
    if (!from) {
      if (box) box.textContent = "Pilih spend token dulu. Kalau hanya punya BNB, klik BNB.";
      window.setSpendToken(NATIVE);
      return;
    }
    if (from.toLowerCase() === USDT.toLowerCase() && Number(amt) >= 1 && Number(amt) <= 100) {
      setHint("<div class=\"muted small\">USDT BSC = 18 decimals. Amount 10 artinya 10 USDT, dikirim sebagai 10000000000000000000.</div>");
    }
    if (typeof origQuote === "function") {
      try {
        await origQuote();
      } catch (e) {
        if (box) box.textContent = "Quote error: " + (e.message || e);
      }
    }
    const text = box && box.textContent || "";
    if (/invalid amount/i.test(text)) {
      box.innerHTML =
        "<b>AMOUNT FORMAT</b><div class=\"muted small\">API minta integer wei. Desk sekarang konversi otomatis.</div>" +
        "<div class=\"muted small\">Kalau hanya $0.20 BNB: klik <b>BNB</b> lalu amount <b>0.0003</b>, bukan 10 USDT.</div>";
    }
  };

  function boot() {
    ensureBnbButton();
    const from = el("fromTokenAddress");
    const amount = el("amount");
    if (from && !from.value) from.value = NATIVE;
    if (amount && (amount.value === "10" || amount.value === "")) {
      window.applyDustAmount();
    } else {
      setHint(
        "<div class=\"muted small\">Amount = human units. $0.20 BNB ≈ 0.0003 BNB. Cukup gas + micro quote. Tidak cukup beli 1 NVDA on-chain.</div>"
      );
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 400); });
  else setTimeout(boot, 400);
})();
