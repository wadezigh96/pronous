(function () {
  const ADDR = /^0x[a-fA-F0-9]{40}$/;
  const orig = window.fetch;
  if (typeof orig !== "function") return;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      if (/bsc-dataseed\.binance\.org/i.test(url) && init && init.body) {
        const payload = JSON.parse(init.body);
        const method = payload && payload.method;
        const params = payload && payload.params;
        if (method === "eth_getBalance") {
          const owner = params && params[0];
          if (typeof owner !== "string" || !ADDR.test(owner)) {
            return Promise.resolve(new Response(JSON.stringify({
              jsonrpc: "2.0",
              id: payload.id || 1,
              error: { code: -32602, message: "invalid owner address" }
            }), { status: 200, headers: { "Content-Type": "application/json" } }));
          }
        }
        if (method === "eth_call") {
          const to = params && params[0] && params[0].to;
          if (to && (typeof to !== "string" || !ADDR.test(to))) {
            return Promise.resolve(new Response(JSON.stringify({
              jsonrpc: "2.0",
              id: payload.id || 1,
              error: { code: -32602, message: "invalid token address" }
            }), { status: 200, headers: { "Content-Type": "application/json" } }));
          }
        }
      }
    } catch (_) {}
    return orig.apply(this, arguments);
  };
})();
