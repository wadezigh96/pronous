import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const files = [
  'api/agent.js',
  'api/cmc-radar.js',
  'lib/execution.js',
  'wallet-connect.js',
  'desk-app.js',
  'desk-onchain.js',
  'package.json'
];
let failed = false;
function ok(label, pass) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`);
  if (!pass) failed = true;
}
for (const file of files) {
  ok(`${file} exists`, fs.existsSync(file));
  if (!fs.existsSync(file)) continue;
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'ignore' }); ok(`${file} syntax`, true); }
  catch { ok(`${file} syntax`, false); }
}
const wallet = fs.readFileSync('wallet-connect.js', 'utf8');
const cmc = fs.readFileSync('api/cmc-radar.js', 'utf8');
const execution = fs.readFileSync('lib/execution.js', 'utf8');
const deskOnchain = fs.readFileSync('desk-onchain.js', 'utf8');
ok('Privy connect-or-create flow', wallet.includes('useConnectOrCreateWallet') && wallet.includes('connectOrCreateWallet()'));
ok('BSC chain 56 configured', wallet.includes('id: 56') && wallet.includes("'0x38'"));
ok('CMC server-side key', cmc.includes('process.env.CMC_API_KEY') && cmc.includes('X-CMC_PRO_API_KEY'));
ok('CMC RWA quotes endpoint', cmc.includes('/v5/real-world-assets/quotes/latest'));
ok('Execution confirmation gate', /confirmation/i.test(execution));

const onclickMatch = deskOnchain.match(/btn\.onclick\s*=\s*async function \(\) \{([\s\S]*?)\n\s*\};/);
const onclick = onclickMatch ? onclickMatch[1] : '';
ok('Execute handler exists', Boolean(onclickMatch));
ok('Execute handler rejects without wallet', /if\s*\(!wallet\(\)\.address\)/.test(onclick));
ok('Execute handler rejects without simulation', /if\s*\(!window\.__pronousSimulated\)/.test(onclick));
const walletGate = onclick.indexOf('if (!wallet().address)');
const simulationGate = onclick.indexOf('if (!window.__pronousSimulated)');
const confirmCall = onclick.indexOf('window.confirmAction');
const executeCall = onclick.indexOf('window.executeOnchain');
ok('Execute handler gates wallet before simulation', walletGate >= 0 && simulationGate > walletGate);
ok('Execute handler gates simulation before confirmation', simulationGate >= 0 && confirmCall > simulationGate);
ok('Execute handler gates simulation before execution', simulationGate >= 0 && executeCall > simulationGate);
ok('Execute handler remains clickable', /btn\.disabled\s*=\s*false/.test(deskOnchain) || !/btn\.disabled\s*=\s*true/.test(onclick));
ok('No obvious private-key literal in frontend', !/(PRIVATE_KEY|PRIVATEKEY|PRIVY_SECRET|SECRET_KEY)\s*=\s*['\"]/.test(wallet));
if (failed) process.exit(1);
