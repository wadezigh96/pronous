import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

let failed = false;

function ok(label, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}${detail ? ' · ' + detail : ''}`);
  if (!pass) failed = true;
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    ok(`${file} readable`, false, error && error.message ? error.message : 'read failed');
    return null;
  }
}

function rootJs() {
  return fs.readdirSync('.', { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => entry.name);
}

function dirFiles(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(ext))
    .map((entry) => path.join(dir, entry.name));
}

const files = [
  ...rootJs(),
  ...dirFiles('api', '.js'),
  ...dirFiles('lib', '.js'),
  ...dirFiles('mcp', '.mjs')
].sort();

for (const file of files) {
  const source = readText(file);
  if (source === null) continue;
  try {
    const result = execFileSync(process.execPath, ['--check', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    ok(`${file} syntax`, true);
    if (result) void result;
  } catch (error) {
    const stderr = String(error && error.stderr || error && error.message || 'syntax check failed').trim().replace(/\s+/g, ' ');
    ok(`${file} syntax`, false, stderr.slice(0, 500));
  }
}

for (const file of ['package.json', 'vercel.json', 'agent-card.json']) {
  const source = readText(file);
  if (source === null) continue;
  try {
    JSON.parse(source);
    ok(`${file} JSON`, true);
  } catch (error) {
    ok(`${file} JSON`, false, error && error.message ? error.message : 'invalid JSON');
  }
}

const index = readText('index.html');
if (index !== null) {
  const srcs = [...index.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
  ok('index.html script references', srcs.every((src) => {
    if (/^(https?:)?\/\//i.test(src)) return true;
    const clean = src.split('?')[0].split('#')[0].replace(/^\//, '');
    const exists = fs.existsSync(clean);
    if (!exists) ok(`index.html script ${src} exists`, false, 'referenced file missing');
    return exists;
  }));
}

const frontendFiles = [...rootJs(), 'index.html'];
const secretPatterns = [
  /(?:PRIVATE_KEY|PRIVATEKEY|PRIVY_SECRET|SECRET_KEY|BINANCE_WEB3_API_SECRET|API_KEY|[A-Z0-9]+_SECRET)\s*[:=]\s*["'][^"']+["']/i,
  /0x[a-f0-9]{64}\b/i
];
for (const file of frontendFiles) {
  const source = readText(file);
  if (source === null) continue;
  const hit = secretPatterns.find((pattern) => pattern.test(source));
  ok(`${file} frontend secret scan`, !hit, hit ? 'potential secret literal' : '');
}

const wallet = readText('wallet-connect.js') || '';
const page = readText('index.html') || '';
const cmc = readText('api/cmc-radar.js') || '';
const onchain = readText('api/onchain.js') || '';
const execution = readText('lib/execution.js') || '';
const gates = readText('lib/execution-gates.js') || '';

ok('Privy connect-or-create flow', wallet.includes('useConnectOrCreateWallet') && wallet.includes('connectOrCreateWallet()'));
ok('BSC chain 56 configured', wallet.includes('id: 56') && wallet.includes("'0x38'"));
ok('CMC server-side key', cmc.includes('process.env.CMC_API_KEY') && cmc.includes('X-CMC_PRO_API_KEY'));
ok('CMC RWA quotes endpoint', cmc.includes('/v5/real-world-assets/quotes/latest'));
ok('CMC DEX on-chain token endpoint', onchain.includes('/v1/dex/token') && onchain.includes('/v1/dex/token/price'));
ok('CMC DEX pools + transactions', onchain.includes('/v1/dex/token/pools') && onchain.includes('/v1/dex/tokens/transactions'));
ok('CMC DEX liquidity endpoint', onchain.includes('/v1/dex/token-liquidity/query'));
ok('On-chain BSC guard', onchain.includes('chain !== "56"') && onchain.includes('Only BSC mainnet is supported'));
ok('On-chain Binance fallback', onchain.includes('loadBinanceFallback') && onchain.includes('fallbackFrom: "CoinMarketCap DEX"'));
ok('Execution confirmation gate', execution.includes('confirmationGate') && execution.includes('READY_TO_EXECUTE'));
ok('Pure canExecute gate exists', gates.includes('function canExecute'));
ok('Pure reset state exists', gates.includes('function resetExecutionState'));
ok('Pure in-flight guard exists', gates.includes('function beginExecution'));
ok('Wallet source chooser', page.includes('Browser wallet') && page.includes('Email / Google (Privy)'));
ok('Privy wallet creation policy', wallet.includes("createOnLogin: 'users-without-wallets'") && wallet.includes('showWalletUIs: true'));
ok('Privy is not auto-bound without user preference', wallet.includes("getPreference() !== 'privy'"));
ok('Wallet provider is not exposed globally', !/window\.__pronousPrivyProvider|window\.walletProvider|window\.ethereum\s*=/m.test(wallet));
ok('Wallet request allowlist', wallet.includes("method !== 'eth_sendTransaction'") && wallet.includes("method !== 'eth_signTypedData_v4'"));
ok('Provider change listeners', wallet.includes("provider.on('accountsChanged'") && wallet.includes("provider.on('chainChanged'") && wallet.includes('detachProviderListeners'));
ok('Shared BSC switch with 4902 fallback', wallet.includes('async function ensureBsc') && wallet.includes('code === 4902') && !/async function ensureBsc/.test(readText('desk-onchain.js') || ''));
ok('Wallet state tests present', fs.existsSync('scripts/wallet-state.test.mjs'));

const apiFiles = dirFiles('api', '.js');
for (const file of apiFiles) {
  const source = readText(file);
  if (source === null) continue;
  ok(file + ' rate-limit/CORS guard', source.includes('guardRequest(req, res)'));
}

const sourceFiles = [...rootJs(), ...apiFiles, ...dirFiles('lib', '.js'), 'index.html'].filter(file => fs.existsSync(file));
const allowedRuntimeHosts = new Set(['auth.privy.io','fonts.googleapis.com','fonts.gstatic.com','web3.binance.com','bsc-dataseed.binance.org','pro-api.coinmarketcap.com']);
for (const file of sourceFiles) {
  const source = readText(file);
  if (source === null) continue;
  const urls = [...source.matchAll(/(?:import\s*\(|<script[^>]+src=["'])(https?:\/\/[^"'\)\s]+)/gi)].map(m => m[1]);
  for (const url of urls) {
    let host = '';
    try { host = new URL(url).hostname; } catch (_) {}
    ok(file + ' runtime host allowlist', Boolean(host && (allowedRuntimeHosts.has(host) || host.endsWith('.privy.io'))), host || 'invalid URL');
  }
  ok(file + ' no esm.sh runtime import', !/https?:\/\/esm\.sh\//i.test(source));
}
const vercel = readText('vercel.json') || '';
ok('CSP header configured', /Content-Security-Policy/.test(vercel) && /script-src 'self'/.test(vercel) && /connect-src/.test(vercel));
ok('Security headers configured', /X-Content-Type-Options/.test(vercel) && /Referrer-Policy/.test(vercel) && /frame-ancestors 'none'/.test(vercel));
ok('Local Privy vendor build configured', fs.existsSync('scripts/build-vendor.mjs') && fs.existsSync('vendor/privy-entry.jsx'));

if (failed) process.exit(1);
