import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const out = path.join(root, 'public');

function copyFile(srcRel) {
  const src = path.join(root, srcRel);
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) return false;
  const dest = path.join(out, srcRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function copyDir(srcRel) {
  const src = path.join(root, srcRel);
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) return;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const rel = path.join(srcRel, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    if (entry.isDirectory()) copyDir(rel);
    else copyFile(rel);
  }
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const rootFiles = [
  'index.html',
  'desk.css',
  'desk-v0.css',
  'desk-density-v2.css',
  'agent-card.json',
  'desk-app.js',
  'desk-charts.js',
  'desk-exec.js',
  'desk-live.js',
  'desk-onchain.js',
  'wallet-connect.js',
  'cmc-radar.js'
];

for (const file of rootFiles) copyFile(file);
copyDir('lib');
copyDir('vendor');

if (!fs.existsSync(path.join(out, 'index.html'))) {
  console.error('prepare-vercel-public: index.html was not copied');
  process.exit(1);
}

console.log('Prepared public/ static output for Vercel');
