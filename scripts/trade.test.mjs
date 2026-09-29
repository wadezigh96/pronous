import test from "node:test";
import assert from "node:assert/strict";

process.env.BINANCE_WEB3_API_KEY ||= "test-key";
process.env.BINANCE_WEB3_API_SECRET ||= "test-secret";

const handler = (await import("../api/trade.js")).default || (await import("../api/trade.js"));

function makeRes() {
  return { statusCode: 200, headers: {}, body: undefined, setHeader(k,v){this.headers[k]=v}, status(n){this.statusCode=n;return this}, json(v){this.body=v;return this}, end(){return this} };
}
function req({method="GET",action="info",headers={},body="",query=""}={}) {
  return { method, url: "/api/trade?action="+action+(query ? "&orderId="+encodeURIComponent(query) : ""), headers, body, socket:{remoteAddress:"127.0.0.1"} };
}
const originalFetch = global.fetch;

test("GET submitRfq is rejected", async () => {
  const res=makeRes(); await handler(req({action:"submitRfq"}),res);
  assert.equal(res.statusCode,405);
});

test("wrong origin is rejected", async () => {
  const res=makeRes(); await handler(req({action:"orderStatus",headers:{origin:"https://evil.example"}}),res);
  assert.equal(res.statusCode,403);
});

test("missing Origin is rejected even when Sec-Fetch-Site says same-origin", async () => {
  const res=makeRes(); await handler(req({action:"orderStatus",headers:{"sec-fetch-site":"same-origin"}}),res);
  assert.equal(res.statusCode,403);
});

test("matching production Origin is accepted", async () => {
  global.fetch=async()=>({ok:true,status:200,headers:{get:()=>"application/json"},json:async()=>({code:0,id:"ok"})});
  const res=makeRes(); await handler(req({action:"orderStatus",headers:{origin:"https://pronous.vercel.app"},query:"order_123"}),res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.data.id,"ok");
  global.fetch=originalFetch;
});

test("submitRfq accepts only the documented fields", async () => {
  global.fetch=async()=>({ok:true,status:200,headers:{get:()=> "application/json"},json:async()=>({code:0,id:"ok"})});
  const res=makeRes();
  await handler(req({method:"POST",action:"submitRfq",headers:{origin:"https://pronous.vercel.app"},body:JSON.stringify({
    userSignature:"0xabcdef",quoteId:"quote_123",vendor:"LiquidMesh",requestId:"req_123",secret:"drop"
  })}),res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.data.id,"ok");
  assert.equal(res.body.data.secret,undefined);
  global.fetch=originalFetch;
});

test("query credentials are rejected", async () => {
  const res=makeRes(); await handler({method:"GET",url:"/api/trade?action=history&quoteId=quote_123",headers:{origin:"https://pronous.vercel.app"},body:"",socket:{remoteAddress:"127.0.0.1"}},res);
  assert.equal(res.statusCode,400);
  assert.equal(res.body.error,"QUERY_CREDENTIALS_NOT_ALLOWED");
});

test("invalid input returns 400", async () => {
  const res=makeRes(); await handler(req({method:"POST",action:"submitRfq",headers:{origin:"https://pronous.vercel.app"},body:JSON.stringify({
    userSignature:"bad",quoteId:"x",vendor:"bad",requestId:"x"
  })}),res);
  assert.equal(res.statusCode,400);
});

test("upstream non-json returns generic 502 without details", async () => {
  global.fetch=async()=>({ok:false,status:500,headers:{get:()=> "text/plain"},json:async()=>{throw new Error("raw") }});
  const res=makeRes(); await handler(req({action:"orderStatus",headers:{origin:"https://pronous.vercel.app"},query:"order_123"}),res);
  assert.equal(res.statusCode,502); assert.equal(res.body.error,"UPSTREAM_ERROR");
  assert.equal(res.body.details,undefined); assert.equal(res.body["X-OC-SIGN"],undefined);
  global.fetch=originalFetch;
});

test("timeout maps to generic upstream error", async () => {
  global.fetch=async()=>{ throw Object.assign(new Error("timeout"),{name:"TimeoutError"}) };
  const res=makeRes(); await handler(req({action:"orderStatus",headers:{origin:"https://pronous.vercel.app"},query:"order_123"}),res);
  assert.equal(res.statusCode,502); assert.deepEqual(Object.keys(res.body),["error"]);
  global.fetch=originalFetch;
});

test("response headers are hardened", async () => {
  const res=makeRes(); await handler(req({action:"info"}),res);
  assert.equal(res.headers["Cache-Control"],"no-store");
  assert.equal(res.headers["X-Content-Type-Options"],"nosniff");
});
