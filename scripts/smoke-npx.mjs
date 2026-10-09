#!/usr/bin/env node
import { spawn } from "node:child_process";

const timeoutMs = Number(process.env.PRONOUS_NPX_SMOKE_TIMEOUT_MS || 60000);
const child = spawn("npx", ["-y", "github:wadezigh96/pronous"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, CI: "1" }
});

let stdout = "";
let stderr = "";
let pending = "";
let sawInitialize = false;
let sawTools = false;
let done = false;
let timeout;

function fail(message) {
  if (done) return;
  done = true;
  clearTimeout(timeout);
  try { child.kill("SIGTERM"); } catch {}
  console.error("NPM_NPX_SMOKE_FAIL " + message);
  if (stderr.trim()) console.error(stderr.trim().slice(-4000));
  process.exitCode = 1;
}

function pass() {
  if (done) return;
  done = true;
  clearTimeout(timeout);
  console.log("NPM_NPX_SMOKE_PASS " + JSON.stringify({
    command: "npx -y github:wadezigh96/pronous",
    node: process.version,
    initialized: sawInitialize,
    tools: ["market_assets", "scan_asset", "preflight"]
  }));
  try { child.kill("SIGTERM"); } catch {}
}

child.on("error", (error) => fail("SPAWN_ERROR " + error.message));
child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
  pending += chunk.toString();
  const lines = pending.split(/\r?\n/);
  pending = lines.pop() || "";
  for (const line of lines) {
    const clean = line.trim();
    if (!clean) continue;
    let message;
    try { message = JSON.parse(clean); } catch { continue; }

    if (message.id === 1 && message.result?.protocolVersion) {
      sawInitialize = true;
      child.stdin.write(JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized"
      }) + "\n");
      child.stdin.write(JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {}
      }) + "\n");
    } else if (message.id === 1 && message.error) {
      fail("INITIALIZE_ERROR " + JSON.stringify(message.error));
    } else if (message.id === 2) {
      const tools = message.result?.tools;
      const names = Array.isArray(tools) ? tools.map((tool) => tool.name) : [];
      const required = ["market_assets", "scan_asset", "preflight"];
      const missing = required.filter((name) => !names.includes(name));
      if (missing.length) fail("MISSING_TOOLS " + missing.join(","));
      else {
        sawTools = true;
        pass();
      }
    }
  }
});

child.on("exit", (code, signal) => {
  if (!done) fail("PROCESS_EXIT_BEFORE_SMOKE_COMPLETE code=" + code + " signal=" + signal + " stdout=" + stdout.slice(-1500));
});

timeout = setTimeout(() => fail("TIMEOUT_AFTER_MS " + timeoutMs), timeoutMs);
child.stdin.write(JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "pronous-npx-smoke", version: "1.0.0" }
  }
}) + "\n");
