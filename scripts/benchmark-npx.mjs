#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

const timeoutMs = Number(process.env.PRONOUS_NPX_BENCH_TIMEOUT_MS || 180000);
const beforeSpec = process.env.PRONOUS_NPX_BENCH_BEFORE || "github:wadezigh96/pronous";
const afterSpec = process.env.PRONOUS_NPX_BENCH_AFTER || "github:wadezigh96/pronous#fix/radar-mid-gap-off-hours-20261010";
const runs = [];

async function benchmark(packageSpec, label) {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "pronous-npx-cold-"));
  const startedAt = new Date().toISOString();
  const start = performance.now();
  let result;
  try {
    result = await new Promise((resolve) => {
      const child = spawn("npx", ["-y", packageSpec], {
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          CI: "1",
          npm_config_cache: cacheDir,
          NPM_CONFIG_CACHE: cacheDir,
          npm_config_update_notifier: "false",
          NPM_CONFIG_UPDATE_NOTIFIER: "false"
        }
      });
      let stdout = "";
      let stderr = "";
      let pending = "";
      let sawInitialize = false;
      let settled = false;
      let timeout;
      const stopChildProcessGroup = () => {
        try {
          if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGTERM");
          else child.kill("SIGTERM");
        } catch (_) {
          try { child.kill("SIGTERM"); } catch {}
        }
        // A timed-out npx process can leave npm/node descendants holding these
        // pipes open. Close our ends so the benchmark process and CI step exit.
        for (const stream of [child.stdin, child.stdout, child.stderr]) {
          try { stream.destroy(); } catch {}
        }
      };
      const finish = (ok, error = null, tools = []) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        stopChildProcessGroup();
        resolve({
          label, packageSpec, startedAt,
          elapsedMs: Math.round(performance.now() - start),
          ok, error, tools,
          stderrTail: stderr.trim().slice(-1500),
          stdoutTail: stdout.trim().slice(-1000)
        });
      };
      child.on("error", (error) => finish(false, "SPAWN_ERROR: " + error.message));
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
        pending += chunk.toString();
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line) continue;
          let message;
          try { message = JSON.parse(line); } catch { continue; }
          if (message.id === 1 && message.result?.protocolVersion) {
            sawInitialize = true;
            child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
            child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");
          } else if (message.id === 1 && message.error) {
            finish(false, "INITIALIZE_ERROR: " + JSON.stringify(message.error));
          } else if (message.id === 2) {
            const names = Array.isArray(message.result?.tools) ? message.result.tools.map((x) => x.name) : [];
            const required = ["market_assets", "scan_asset", "preflight"];
            const missing = required.filter((name) => !names.includes(name));
            if (!sawInitialize) finish(false, "INITIALIZE_RESPONSE_MISSING");
            else if (missing.length) finish(false, "MISSING_TOOLS: " + missing.join(","), names);
            else finish(true, null, names);
          }
        }
      });
      child.on("exit", (code, signal) => {
        if (!settled) finish(false, "PROCESS_EXIT_BEFORE_TOOLS_LIST code=" + code + " signal=" + signal);
      });
      timeout = setTimeout(() => finish(false, "TIMEOUT_AFTER_MS " + timeoutMs), timeoutMs);
      child.stdin.write(JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "pronous-cold-start-benchmark", version: "1.0.0" } }
      }) + "\n");
    });
  } catch (error) {
    result = { label, packageSpec, startedAt, elapsedMs: Math.round(performance.now() - start), ok: false, error: String(error) };
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
  runs.push(result);
  console.log("NPM_NPX_COLD_START " + JSON.stringify(result));
  return result;
}

const before = await benchmark(beforeSpec, "before-main");
const after = await benchmark(afterSpec, "after-pr-branch");
const deltaMs = after.elapsedMs - before.elapsedMs;
const reductionPct = before.elapsedMs > 0 ? Number(((before.elapsedMs - after.elapsedMs) / before.elapsedMs * 100).toFixed(2)) : null;
const report = {
  measuredAt: new Date().toISOString(),
  metric: "cold start from npx invocation to MCP initialize + tools/list success",
  methodology: "Each run uses an independent empty npm cache directory; both require market_assets, scan_asset, and preflight tools.",
  baseline: before,
  candidate: after,
  deltaMs,
  reductionPct,
  faster: deltaMs < 0,
  bothPassed: before.ok && after.ok
};
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/npx-cold-start.json", JSON.stringify(report, null, 2) + "\n");
console.log("NPM_NPX_COLD_START_BENCHMARK " + JSON.stringify({
  baselineMs: before.elapsedMs, candidateMs: after.elapsedMs, deltaMs, reductionPct, bothPassed: report.bothPassed
}));
if (!report.bothPassed) process.exitCode = 1;
