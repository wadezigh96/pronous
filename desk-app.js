const PRONOUS_AGENT_STUDIO_PROMPT='Create and deploy a BSC mainnet autonomous agent named PRONOUS. Monitor tokenized equities through Binance Web3 API; search tickers; read token/reference prices; calculate spread; check market status; create transparent execution plans. Enforce scoped wallet policy, spend caps, contract allowlists, spot-only execution, simulation before broadcast, structured intents, and explicit user confirmation. Expose market, price, portfolio, quote, simulation and execution tools with secrets server-side. Register ERC-8004 identity, expose ERC-8183 tasks, enable x402 self-funding, and keep read-only/demo mode available when unfunded.';
function copyAgentStudioPrompt(){const f=document.getElementById('studioFeedback');const done=()=>{if(f)f.textContent='Deploy prompt copied.'};if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(PRONOUS_AGENT_STUDIO_PROMPT).then(done).catch(()=>fallbackCopyAgentStudioPrompt(done));else fallbackCopyAgentStudioPrompt(done)}
function fallbackCopyAgentStudioPrompt(done){const ta=document.createElement('textarea');ta.value=PRONOUS_AGENT_STUDIO_PROMPT;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done()}catch(e){const f=document.getElementById('studioFeedback');if(f)f.textContent='Copy unavailable — use agent/AGENT_STUDIO_PROMPT.md'}ta.remove()}
function openAgentStudioDocs(){window.open('https://www.bnbchain.org/en/bnb-agent-studio','_blank','noopener,noreferrer')}
let walletAddress=null,walletProvider=null,last=null,marketAssets=[],marketFilter='all',preflightReady=false,latestQuote=null,currentPOA=null;
function shortAddress(a){a=String(a||'');return a&&a.length>12?a.slice(0,6)+'…'+a.slice(-4):a||'Not connected'}
function setWalletUI(address){
 walletAddress=address||null;
 const label=document.getElementById('walletStatus'),addr=document.getElementById('walletAddress'),btn=document.getElementById('connectWalletBtn'),kpi=document.getElementById('kpiExec');
 if(label)label.textContent=address?'WALLET CONNECTED':'WALLET NOT CONNECTED';
 if(addr)addr.textContent=address?shortAddress(address):'Not connected';
 if(btn){btn.disabled=false;btn.textContent=address?'Disconnect':'Connect Wallet'}
 if(kpi)kpi.textContent=address?'ARMED':'LOCKED';
}
window.addEventListener('pronous:privy-wallet-connected',event=>{
 const d=event.detail||{};
 walletProvider=d.provider||window.__pronousPrivyProvider||null;
 setWalletUI(d.address||window.__pronousPrivyAddress||null);
});
window.addEventListener('pronous:privy-wallet-disconnected',()=>{walletProvider=null;setWalletUI(null)});
function esc(s){return String(s??'').replace(/[&<>"]/g,m=>({'&':'&','<':'<','>':'>','"':'"'}[m]))}
function setExecutionStep(step,status){
 const order=['preflight','quote','simulation','confirmation','execution'];
 const idx=order.indexOf(step);
 document.querySelectorAll('.exec-step').forEach((el,i)=>{
  const active=i===idx,done=i<idx;
  el.classList.toggle('active',active);
  el.classList.toggle('done',done);
  const em=el.querySelector('em');
  if(em)em.textContent=active?status:(done?'PASS':(i>idx?'LOCKED':em.textContent));
 });
}
function toggleMarketWatch(force){const body=document.getElementById('marketWatchBody'),btn=document.getElementById('marketToggle');if(!body||!btn)return;const open=force!==undefined?force:!body.classList.contains('open');body.classList.toggle('open',open);btn.setAttribute('aria-expanded',String(open));btn.textContent=open?'\u2212 Collapse':'\uff0b Expand'}
function initMarketWatch(){toggleMarketWatch(false)}
function setFilter(f){marketFilter=f;renderMarket()}
function closeAsset(){const d=document.getElementById('assetDrawer');if(d){d.classList.remove('open');d.setAttribute('aria-hidden','true')}}
function renderClock(x){const el=document.getElementById('clock');if(!el)return;el.innerHTML=x?'<div class="metric">'+esc(x.marketStatus||x.openState||'\u2014')+'</div><div class="muted small">'+esc(x.ticker)+' \u00b7 '+esc(x.platformId)+'</div>':'Select an asset.'}
function updateGapKpi(){
 const el=document.getElementById('kpiGap'); if(!el)return;
 const scored=marketAssets.filter(x=>Number.isFinite(Number(x.spreadPct)));
 if(!scored.length){el.textContent='\u2014';return}
 const actionable=scored.filter(x=>Math.abs(Number(x.spreadPct))<25);
 const pool=actionable.length?actionable:scored;
 const best=pool.slice().sort((a,b)=>Math.abs(Number(b.spreadPct))-Math.abs(Number(a.spreadPct)))[0];
 const gap=Number(best.spreadPct);
 el.textContent=(gap>0?'+':'')+gap.toFixed(2)+'%';
}
function renderRadar(){
 const rows=marketAssets.filter(x=>Number.isFinite(Number(x.spreadPct))).sort((a,b)=>Math.abs(Number(b.spreadPct))-Math.abs(Number(a.spreadPct))).slice(0,5);
 const el=document.getElementById('radar'); if(!el)return;
 el.innerHTML=rows.length?rows.map(x=>'<div style="margin:0 0 10px"><b>'+esc(x.ticker)+'</b> \u00b7 '+esc(x.platformId)+' \u00b7 <span class="'+(Number(x.spreadPct)>=0?'pos':'neg')+'">'+(Number(x.spreadPct)>0?'+':'')+Number(x.spreadPct).toFixed(3)+'%</span></div>').join(''):'No spread data available.';
}
function renderMarket(){
 const q=(document.getElementById('marketSearch')&&document.getElementById('marketSearch').value||'').trim().toUpperCase();
 const rows=marketAssets.filter(x=>(marketFilter==='all'||String(x.platformId).toLowerCase().includes(marketFilter))&&(String(x.ticker||'').toUpperCase().includes(q)||String(x.companyName||'').toUpperCase().includes(q)));
 const box=document.getElementById('marketTable');
 const count=document.getElementById('marketCount'); if(count)count.textContent=String(rows.length);
 if(!box)return;
 if(!rows.length){box.textContent='No matching assets.';return}
 box.innerHTML='<div class="market-wrap"><table class="market compact-market"><thead><tr><th>Asset</th><th>Price</th><th>Gap</th><th>State</th></tr></thead><tbody>'+rows.slice(0,80).map(x=>{const gap=Number(x.spreadPct);return '<tr onclick="openAsset('+JSON.stringify(x.ticker)+','+JSON.stringify(x.platformId||'')+')"><td><b>'+esc(x.ticker)+'</b> <span class="muted small">'+esc(x.platformId||'')+'</span></td><td><b>'+esc(x.tokenPrice??'\u2014')+'</b></td><td class="'+(gap>=0?'pos':'neg')+'">'+(Number.isFinite(gap)?(gap>0?'+':'')+gap.toFixed(3)+'%':'\u2014')+'</td><td><span class="tag">'+esc(x.marketStatus||x.openState||'\u2014')+'</span></td></tr>'}).join('')+'</tbody></table></div>';
}
function openAsset(ticker,platform){
 const x=marketAssets.find(a=>String(a.ticker).toUpperCase()===String(ticker).toUpperCase()&&(!platform||String(a.platformId)===String(platform)))||marketAssets.find(a=>String(a.ticker).toUpperCase()===String(ticker).toUpperCase());
 if(!x)return;
 document.getElementById('ticker').value=x.ticker;
 renderClock(x);
 loadOnchain(x);
 const drawer=document.getElementById('assetDrawer');
 const content=document.getElementById('drawerContent');
 if(content)content.innerHTML='<div class="drawer-title">'+esc(x.ticker)+'</div><div class="drawer-sub">'+esc(x.platformId||'')+'</div><div class="drawer-actions"><button class="secondary" onclick="closeAsset();scan()">Scan asset</button></div>';
 if(drawer){drawer.classList.add('open');drawer.setAttribute('aria-hidden','false')}
}
async function loadSkills(){try{const r=await fetch('/api/skills?action=list');const j=await r.json();document.getElementById('skills').innerHTML=(j.skills||[]).map(s=>'<div><b>'+esc(s.icon)+' '+esc(s.name)+'</b><span class="muted small">'+esc(s.purpose)+'</span></div>').join('')}catch(e){const el=document.getElementById('skills');if(el)el.textContent='Skills unavailable.'}}
async function loadMarket(){
 const box=document.getElementById('marketTable'); if(box)box.textContent='Loading\u2026';
 try{const r=await fetch('/api/agent?action=assets');const j=await r.json();marketAssets=j.assets||[];window.marketAssets=marketAssets;const mode=document.getElementById('marketMode');if(mode){mode.textContent=(j.mode||'unknown').toUpperCase();mode.className='tag '+(j.mode==='live-data'?'live':'demo')}const kpiMode=document.getElementById('kpiMode');if(kpiMode)kpiMode.textContent=(j.mode||'\u2014').replace('live-data','LIVE');const kpiAssets=document.getElementById('kpiAssets');if(kpiAssets)kpiAssets.textContent=String((j.summary&&j.summary.total)||marketAssets.length);updateGapKpi();renderMarket();renderRadar();renderClock(marketAssets[0]);if(window.drawGapChart)drawGapChart();}
 catch(e){if(box)box.textContent='Market data error: '+e.message}
}
async function scan(){
 const t=(document.getElementById('ticker').value||'').trim().toUpperCase(); if(!t)return;
 document.getElementById('scan').textContent='Scanning\u2026';
 try{const r=await fetch('/api/agent?action=scan&ticker='+encodeURIComponent(t));const j=await r.json();last=j;document.getElementById('scan').textContent=JSON.stringify(j,null,2);document.getElementById('plan').textContent=JSON.stringify(j.plan||'No plan returned.',null,2);}
 catch(e){document.getElementById('scan').textContent='Error: '+e.message}
}
async function preflight(){
 const t=(document.getElementById('ticker').value||'NVDA').trim().toUpperCase();
 const box=document.getElementById('preflight'); box.textContent='Running deterministic checks\u2026';
 try{const r=await fetch('/api/agent?action=preflight&ticker='+encodeURIComponent(t)+'&amount='+encodeURIComponent(document.getElementById('amount').value)+'&maxSpend='+encodeURIComponent(document.getElementById('maxSpend').value));const j=await r.json();preflightReady=j.preflight&&j.preflight.status==='READY_FOR_SIMULATION';setExecutionStep('preflight',j.preflight&&j.preflight.status||'BLOCKED');box.innerHTML='<b>'+esc(j.preflight&&j.preflight.status||'UNKNOWN')+'</b>';}
 catch(e){box.textContent='Preflight error: '+e.message}
}
async function requestQuote(){
 const box=document.getElementById('quoteResult');
 if(!walletAddress){box.textContent='Connect the execution wallet before requesting a live quote.';return}
 const fromToken=(document.getElementById('fromTokenAddress').value||'').trim();
 if(!/^0x[a-fA-F0-9]{40}$/.test(fromToken)){box.textContent='Enter a valid source token contract address.';return}
 try{const p=new URLSearchParams({action:'quote',ticker:(document.getElementById('ticker').value||'NVDA').trim().toUpperCase(),fromTokenAddress:fromToken,amount:document.getElementById('amount').value,userWalletAddress:walletAddress});const r=await fetch('/api/agent?'+p.toString());const j=await r.json();if(!r.ok||j.error)throw new Error(j.error||'Quote failed');latestQuote=j;box.innerHTML='<b>QUOTE READY</b>';setExecutionStep('quote','READY')}
 catch(e){box.textContent='Quote error: '+e.message}
}
async function simulate(){const el=document.getElementById('plan');if(!walletAddress){el.textContent='Connect the execution wallet before chain simulation.';return}el.textContent='Wallet connected. Run preflight + quote first.';}
async function confirmAction(){const s=document.getElementById('poaGateStatus');if(!walletAddress){if(s)s.textContent='Connect the execution wallet before confirmation.';return}if(s)s.textContent='Wallet connected. Simulation still required before a live send.';}
async function loadOnchain(x){const box=document.getElementById('chain');if(!box)return;const token=x&&x.tokenContractAddress;if(!token){box.textContent='No contract address for this asset.';return}try{await fetch('/api/onchain?token='+encodeURIComponent(token));box.textContent='Contract '+token;}catch(e){box.textContent='On-chain error: '+e.message}}
function createCurrentPOA(){}
function clearPOALedger(){}
function renderPOALedger(){}
loadMarket();
loadSkills();
initMarketWatch();
