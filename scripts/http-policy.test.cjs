const test = require("node:test");
const assert = require("node:assert/strict");
const { guardRequest } = require("../lib/http-policy");

function responseMock() {
  const headers = {};
  let statusCode = 200;
  let body = null;
  let ended = false;
  return {
    headers,
    get statusCode() { return statusCode; },
    get body() { return body; },
    get ended() { return ended; },
    setHeader(name, value) { headers[name] = value; },
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; },
    end() { ended = true; return this; }
  };
}

test("per-process IP limiter returns 429 and Retry-After after 60 requests", () => {
  const ip = "198.51.100.77";
  const req = { method: "GET", headers: { "x-forwarded-for": ip }, socket: { remoteAddress: ip } };
  for (let i = 0; i < 60; i++) {
    const res = responseMock();
    assert.equal(guardRequest(req, res), true, "request " + (i + 1) + " should be allowed");
  }
  const blocked = responseMock();
  assert.equal(guardRequest(req, blocked), false);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers["Retry-After"], "60");
  assert.deepEqual(blocked.body, { error: "RATE_LIMITED" });
});

test("OPTIONS preflight exits without consuming the IP request bucket", () => {
  const ip = "198.51.100.78";
  const req = { method: "OPTIONS", headers: { "x-forwarded-for": ip }, socket: { remoteAddress: ip } };
  const res = responseMock();
  assert.equal(guardRequest(req, res), false);
  assert.equal(res.statusCode, 204);
  assert.equal(res.ended, true);
});

test("normalized client IP takes precedence over spoofable forwarded values", () => {
  const req = {
    method: "GET",
    headers: { "x-real-ip": "198.51.100.91", "x-forwarded-for": "203.0.113.1" },
    socket: { remoteAddress: "127.0.0.1" }
  };
  for (let i = 0; i < 60; i++) assert.equal(guardRequest(req, responseMock()), true);
  const blocked = responseMock();
  assert.equal(guardRequest(req, blocked), false);
  assert.equal(blocked.statusCode, 429);
});
