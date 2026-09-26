let walletAddress=null, walletProvider=null;
function shortAddress(a){a=String(a||'');return a&&a.length>12?a.slice(0,6)+'…'+a.slice(-4):a||'Not connected'}
function setWalletUI(address){
 walletAddress=address||null;
 const label=document.getElementById('walletStatus'),addr=document.getElementById('walletAddress'),btn=document.getElementById('connectWalletBtn'),kpi=document.getElementById('kpiExec');
 if(label)label.textContent=address?'WALLET CONNECTED':'WALLET NOT CONNECTED';
 if(addr)addr.textContent=address?shortAddress(address):'Not connected';
 if(btn)btn.textContent=address?'Disconnect':'Connect Wallet';
 if(kpi)kpi.textContent=address?'ARMED':'LOCKED';
}
let discoveredProvider=null;
function rememberProvider(provider){
 if(!provider)return;
 discoveredProvider=provider;
 if(provider.isMetaMask || !walletProvider) walletProvider=provider;
}
window.addEventListener('eip6963:announceProvider',event=>rememberProvider(event.detail?.provider));
try{window.dispatchEvent(new Event('eip6963:requestProvider'));}catch(e){}
function openMetaMaskDapp(){
 const url='https://metamask.app.link/dapp/pronous.vercel.app';
 window.location.href=url;
}
async function connectInjectedWallet(){
 if(walletAddress){
  if(window.__pronousPrivyConnected){window.dispatchEvent(new CustomEvent('pronous:privy-disconnect-request'));}
  walletAddress=null;walletProvider=null;setWalletUI(null);return;
 }
 const provider=walletProvider||discoveredProvider||window.ethereum;
 if(!provider){
  const go=confirm('Wallet tidak terdeteksi di browser ini. Buka PRONOUS di MetaMask agar wallet bisa terhubung?');
  if(go)openMetaMaskDapp();
  return;
 }
 try{
  const accounts=await provider.request({method:'eth_requestAccounts'});
  let chain=await provider.request({method:'eth_chainId'});
  if(String(chain).toLowerCase()!=='0x38'){
   try{
    await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x38'}]});
    chain=await provider.request({method:'eth_chainId'});
   }catch(e){alert('Please switch your wallet to BSC Mainnet (chain 56).');return;}
  }
  if(String(chain).toLowerCase()!=='0x38'){alert('Wallet is not on BSC Mainnet (chain 56).');return;}
  walletProvider=provider;setWalletUI(accounts?.[0]||null);
 }catch(e){alert('Wallet connection failed: '+(e?.message||e));}
}
function initInjectedWallet(){
 const provider=window.ethereum||discoveredProvider;
 if(!provider)return;
 rememberProvider(provider);
 provider.on?.('accountsChanged',a=>setWalletUI(a?.[0]||null));
 provider.on?.('chainChanged',()=>window.location.reload());
 provider.request?.({method:'eth_accounts'}).then(a=>{if(a?.[0])setWalletUI(a[0])}).catch(()=>{});
}
window.addEventListener('eip6963:announceProvider',event=>initInjectedWallet());
if(window.ethereum) initInjectedWallet();
window.addEventListener('ethereum#initialized',initInjectedWallet,{once:true});
setTimeout(initInjectedWallet,3000);
window.addEventListener('pronous:privy-wallet-connected',event=>{
 const detail=event.detail||{};
 if(detail.provider) walletProvider=detail.provider;
 setWalletUI(detail.address||window.__pronousPrivyAddress||null);
});
window.addEventListener('pronous:privy-wallet-disconnected',()=>{
 walletProvider=null;
 setWalletUI(null);
});
if(typeof window.connectWallet!=='function') window.connectWallet=connectInjectedWallet;

let last=null, marketAssets=[], marketFilter='all';
let preflightReady=false, latestQuote=null;
let currentPOA=null;
function setExecutionStep(step,status){
 const order=['preflight','quote','simulation','confirmation','execution'];
 const idx=order.indexOf(step);
 document.querySelectorAll('.exec-step').forEach((el,i)=>{
  const active=i===idx, done=i<idx;
  el.classList.toggle('active',active);
  el.classList.toggle('done',done);
  const em=el.querySelector('em');
  if(em) em.textContent=active?status:(done?'PASS':(i>idx?'LOCKED':em.textContent));
 });
}


function poaLedgerRead(){
 try{return JSON.parse(localStorage.getItem('pronous-poa-ledger')||'[]')}catch(e){return[]}
}
function poaLedgerWrite(rows){try{localStorage.setItem('pronous-poa-ledger',JSON.stringify(rows.slice(0,25)))}catch(e){}}
function shortHash(v){v=String(v||'');return v.length>18?v.slice(0,10)+'…'+v.slice(-8):v}
function renderPOALedger(){
 const box=document.getElementById('poaLedger'); if(!box)return;
 const rows=poaLedgerRead();
 box.innerHTML=rows.length?rows.map(p=>'<div class="poa-row"><div><b>'+esc(p.poaId)+'</b><span class="tag">'+esc(p.status)+'</span></div><span class="muted small">'+esc(p.action)+' · '+esc(p.timestamp)+'</span><code>'+esc(shortHash(p.poaHash))+'</code></div>').join(''):'No evidence yet.';
}
function savePOA(proof){
 currentPOA=proof;
 const rows=poaLedgerRead().filter(x=>x.poaId!==proof.poaId);
 rows.unshift(proof); poaLedgerWrite(rows); renderPOALedger();
 const box=document.getElementById('poaCurrent');
 if(box)box.innerHTML='<div class="poa-proof"><div><b>'+esc(proof.poaId)+'</b> <span class="tag">'+esc(proof.status)+'</span></div><div class="muted small">Intent '+esc(shortHash(proof.intentHash))+'</div><div class="muted small">POA hash <code>'+esc(shortHash(proof.poaHash))+'</code></div><button class="secondary" type="button" onclick="verifyCurrentPOA()">Verify proof</button></div>';
}
async function createPOAForAction(action,status,extra={}){
 const intent={agentId:'PRONOUS',action,network:'BSC',ticker:(document.getElementById('ticker')?.value||'NVDA').trim().toUpperCase(),amount:document.getElementById('amount')?.value||null,...extra};
 try{
  const proofInput={agentId:'PRONOUS',action,status,network:'BSC',intent,asset:extra.asset||null,simulation:extra.simulation||null,userConfirmation:Boolean(extra.userConfirmation),txHash:extra.txHash||null,previousPoaHash:currentPOA?.poaHash||null};
  const r=await fetch('/api/poa?action=create&proof='+encodeURIComponent(JSON.stringify(proofInput)));
  const j=await r.json(); if(j.proof)savePOA(j.proof); else throw new Error(j.error||'POA creation failed');
 }catch(e){const box=document.getElementById('poaCurrent');if(box)box.textContent='POA error: '+e.message}
}
async function createCurrentPOA(){await createPOAForAction(last?.action||'OBSERVE','PLANNED',{asset:last?.asset||null})}
async function confirmAction(){
 if(!currentPOA){const s=document.getElementById('poaGateStatus');if(s)s.textContent='Create and simulate a POA first.';return}
 if(currentPOA.status!=='SIMULATED'||currentPOA.simulation?.mode!=='BSC_RPC'||currentPOA.simulation?.status!=='PASSED'){const s=document.getElementById('poaGateStatus');if(s)s.textContent='Only a passed BSC RPC simulation can unlock confirmation.';return}
 if(!walletProvider||!walletAddress){const s=document.getElementById('poaGateStatus');if(s)s.textContent='Connect the execution wallet before confirmation.';return}
 if(!latestQuote?.evmTx){const s=document.getElementById('poaGateStatus');if(s)s.textContent='No simulated transaction is available.';return}
 await createPOAForAction('EXECUTION','CONFIRMED',{asset:currentPOA.asset,simulation:currentPOA.simulation,userConfirmation:true});
 setExecutionStep('confirmation','CONFIRMED');
 const s=document.getElementById('poaGateStatus');if(s)s.textContent='Confirmation recorded. Review the wallet prompt to approve or reject the transaction.';
 const b=document.getElementById('confirmActionBtn');if(b)b.disabled=true;
 try{
  const tx=latestQuote.evmTx;
  const request={from:walletAddress,to:tx.to,data:tx.data||'0x'};
  if(tx.value!==undefined)request.value=String(tx.value);
  if(tx.gas!==undefined)request.gas=String(tx.gas);
  if(tx.gasPrice!==undefined)request.gasPrice=String(tx.gasPrice);
  const txHash=await walletProvider.request({method:'eth_sendTransaction',params:[request]});
  setExecutionStep('execution','PENDING');
  if(s)s.textContent='Transaction sent. Waiting for BSC receipt… '+txHash;
  let receipt=null;
  for(let attempt=0;attempt<30;attempt++){
   await new Promise(resolve=>setTimeout(resolve,2000));
   receipt=await walletProvider.request({method:'eth_getTransactionReceipt',params:[txHash]});
   if(receipt)break;
  }
  if(!receipt)throw new Error('TRANSACTION_RECEIPT_TIMEOUT');
  if(String(receipt.status).toLowerCase()!=='0x1')throw new Error('TRANSACTION_REVERTED');
  await createPOAForAction('EXECUTION','EXECUTED',{asset:currentPOA.asset,simulation:currentPOA.simulation,userConfirmation:true,txHash});
  setExecutionStep('execution','EXECUTED');
  if(s)s.textContent='Transaction confirmed on BSC. TX hash: '+txHash;
 }catch(e){
  if(s)s.textContent='Wallet rejected or transaction failed: '+(e?.message||e);
  setExecutionStep('confirmation','REJECTED');
  await createPOAForAction('EXECUTION','REJECTED',{asset:currentPOA?.asset||null,simulation:currentPOA?.simulation||null,userConfirmation:false});
 }
}
async function verifyCurrentPOA(){
 if(!currentPOA)return;
 const r=await fetch('/api/poa?action=verify&proof='+encodeURIComponent(JSON.stringify(currentPOA)));
 const j=await r.json(); const box=document.getElementById('poaCurrent');
 if(box)box.innerHTML+='<div class="poa-verify '+(j.verification?.valid?'valid':'invalid')+'">'+(j.verification?.valid?'✓ HASH MATCH':'✕ HASH MISMATCH')+' · '+esc(j.verification?.reason||'UNKNOWN')+'</div>';
}
function clearPOALedger(){try{localStorage.removeItem('pronous-poa-ledger')}catch(e){}currentPOA=null;renderPOALedger();document.getElementById('poaCurrent').textContent='No POA generated for this session.'}

function toggleMarketWatch(force){const body=document.getElementById('marketWatchBody'),btn=document.getElementById('marketToggle');if(!body||!btn)return;const open=force!==undefined?force:!body.classList.contains('open');body.classList.toggle('open',open);btn.setAttribute('aria-expanded',String(open));btn.textContent=open?'− Collapse':'＋ Expand';try{localStorage.setItem('pronous-market-watch-open',open?'1':'0')}catch(e){}}
function initMarketWatch(){let open=false;try{open=localStorage.getItem('pronous-market-watch-open')==='1'}catch(e){}toggleMarketWatch(open)}
function esc(s){return String(s??'').replace(/[&<>"]/g,m=>({'&':'&','<':'<','>':'>','"':'"'}[m]))}
function setFilter(f){marketFilter=f;renderMarket()}
function openAsset(ticker,platform){
 const x=marketAssets.find(a=>String(a.ticker).toUpperCase()===String(ticker).toUpperCase()&&(!platform||String(a.platformId)===String(platform)))||marketAssets.find(a=>String(a.ticker).toUpperCase()===String(ticker).toUpperCase());
 if(!x)return;
 const gap=Number(x.spreadPct);
 const drawer=document.getElementById('assetDrawer');
 const content=document.getElementById('drawerContent');
 if(!drawer||!content)return;
 content.innerHTML='<div class="drawer-kicker">TOKENIZED EQUITY / ASSET DETAIL</div><div class="drawer-title">'+esc(x.ticker)+'</div><div class="drawer-sub">'+esc(x.companyName||x.underlyingName||'')+' · '+esc(x.platformId||'—')+'</div><div class="drawer-price"><div class="drawer-stat"><label>Token price</label><strong>'+esc(x.tokenPrice??'—')+'</strong></div><div class="drawer-stat"><label>Reference</label><strong>'+esc(x.referencePrice??'—')+'</strong></div></div><div class="drawer-gap"><div class="muted small">TOKEN / REFERENCE GAP</div><strong class="'+(gap>=0?'pos':'neg')+'">'+(Number.isFinite(gap)?(gap>0?'+':'')+gap.toFixed(3)+'%':'—')+'</strong><div class="muted small" style="margin-top:5px">'+esc(x.marketStatus||x.openState||'Market state unavailable')+'</div></div><div class="chart-box"><div class="chart-meta"><span id="assetChartLabel">TOKEN CANDLES · 1H</span><span id="assetChartSrc">LOADING</span></div><canvas id="assetChart" width="420" height="168"></canvas></div><div class="drawer-grid"><div class="drawer-row"><span>Token</span>'+esc(x.tokenSymbol||'—')+'</div><div class="drawer-row"><span>Platform</span>'+esc(x.platformId||'—')+'</div><div class="drawer-row"><span>24h volume</span>'+esc(x.volume24H||'—')+'</div><div class="drawer-row"><span>Market cap</span>'+esc(x.marketCap||'—')+'</div><div class="drawer-row"><span>Next open</span>'+esc(x.nextOpenTime||'—')+'</div><div class="drawer-row"><span>Next close</span>'+esc(x.nextCloseTime||'—')+'</div></div><div class="drawer-actions"><button class="secondary" onclick="document.getElementById(\'ticker\').value='+JSON.stringify(x.ticker)+';closeAsset();scan()">Scan asset</button><button onclick="document.getElementById(\'execution\').scrollIntoView({behavior:\'smooth\'});closeAsset()">Open preflight</button></div>';
 drawer.classList.add('open'); drawer.setAttribute('aria-hidden','false'); renderClock(x); if(window.loadAssetChart)loadAssetChart(x); if(window.loadOnchain)loadOnchain(x);
}
function closeAsset(){const d=document.getElementById('assetDrawer');if(d){d.classList.remove('open');d.setAttribute('aria-hidden','true')}}
function renderMarket(){
 const q=(document.getElementById('marketSearch')?.value||'').trim().toUpperCase();
 const rows=marketAssets.filter(x=>(marketFilter==='all'||String(x.platformId).toLowerCase().includes(marketFilter))&&(String(x.ticker||'').toUpperCase().includes(q)||String(x.companyName||'').toUpperCase().includes(q)));
 const box=document.getElementById('marketTable');
 const count=document.getElementById('marketCount'); if(count)count.textContent=rows.length?String(rows.length):'0';
 if(!rows.length){box.textContent='No matching assets.';return}
 box.innerHTML='<div class="market-wrap"><table class="market compact-market"><thead><tr><th>Asset</th><th>Price</th><th>Gap</th><th>State</th></tr></thead><tbody>'+rows.map(x=>{const gap=Number(x.spreadPct);return '<tr onclick="openAsset('+JSON.stringify(x.ticker)+','+JSON.stringify(x.platformId||'')+')"><td><b>'+esc(x.ticker)+'</b> <span class="muted small">'+esc(x.platformId||'')+'</span></td><td><b>'+esc(x.tokenPrice??'—')+'</b> <span class="muted small">ref '+esc(x.referencePrice??'—')+'</span></td><td class="'+(gap>=0?'pos':'neg')+'">'+(Number.isFinite(gap)?(gap>0?'+':'')+gap.toFixed(3)+'%':'—')+'</td><td><span class="tag">'+esc(x.marketStatus||x.openState||'—')+'</span></td></tr>'}).join('')+'</tbody></table></div>';
}
function renderRadar(){
 const rows=[...marketAssets].filter(x=>Number.isFinite(Number(x.spreadPct))).sort((a,b)=>Math.abs(Number(b.spreadPct))-Math.abs(Number(a.spreadPct))).slice(0,5);
 document.getElementById('radar').innerHTML=rows.length?rows.map(x=>'<div style="margin:0 0 10px"><b>'+esc(x.ticker)+'</b> · '+esc(x.platformId)+' · <span class="'+(Number(x.spreadPct)>=0?'pos':'neg')+'">'+(Number(x.spreadPct)>0?'+':'')+Number(x.spreadPct).toFixed(3)+'%</span><br><span class="muted small">Token '+esc(x.tokenPrice)+' vs reference '+esc(x.referencePrice)+' · '+esc(x.marketStatus||x.openState||'state unavailable')+'</span></div>').join(''):'No spread data available.';
}
function renderClock(x){document.getElementById('clock').innerHTML=x?'<div class="metric">'+esc(x.marketStatus||x.openState||'—')+'</div><div class="muted small">'+esc(x.ticker)+' · '+esc(x.platformId)+'</div><p class="small">Next open: '+esc(x.nextOpenTime||'—')+'<br>Next close: '+esc(x.nextCloseTime||'—')+'</p>':'Select an asset to inspect its market state.'}
function updateGapKpi(){
 const el=document.getElementById('kpiGap');
 const note=el&&el.parentElement?el.parentElement.querySelector('.kpi-note'):null;
 if(!el)return;
 const scored=marketAssets.filter(x=>Number.isFinite(Number(x.spreadPct)));
 if(!scored.length){el.textContent='—';if(note)note.textContent='Token / reference spread';return;}
 const actionable=scored.filter(x=>Math.abs(Number(x.spreadPct))<25);
 const pool=actionable.length?actionable:scored;
 const best=pool.slice().sort((a,b)=>Math.abs(Number(b.spreadPct))-Math.abs(Number(a.spreadPct)))[0];
 const gap=Number(best.spreadPct);
 el.textContent=(gap>0?'+':'')+gap.toFixed(2)+'%';
 if(note)note.textContent=(actionable.length?best.ticker+' · actionable':best.ticker+' · unreliable feed');
}
async function loadSkills(){try{const r=await fetch('/api/skills?action=list');const j=await r.json();document.getElementById('skills').innerHTML=(j.skills||[]).map(s=>'<div><b>'+esc(s.icon)+' '+esc(s.name)+'</b><span class="muted small">'+esc(s.purpose)+'</span><br><span class="tag">'+esc(s.risk)+'</span><span class="tag">'+esc(s.output)+'</span></div>').join('')}catch(e){document.getElementById('skills').textContent='Skills unavailable.'}}
async function loadMarket(){
 const box=document.getElementById('marketTable'); box.textContent='Loading…';
 try{const r=await fetch('/api/agent?action=assets');const j=await r.json();marketAssets=j.assets||[];window.marketAssets=marketAssets;const mode=document.getElementById('marketMode');if(mode){mode.textContent=(j.mode||'unknown').toUpperCase();mode.className='tag '+(j.mode==='live-data'?'live':'demo');}const upd=document.getElementById('marketUpdated');if(upd)upd.textContent=j.updatedAt?'Updated '+new Date(j.updatedAt).toLocaleTimeString():'—';const kpiMode=document.getElementById('kpiMode');if(kpiMode)kpiMode.textContent=(j.mode||'—').replace('live-data','LIVE');const kpiAssets=document.getElementById('kpiAssets');if(kpiAssets)kpiAssets.textContent=String((j.summary&&j.summary.total)||marketAssets.length);updateGapKpi();renderMarket();renderRadar();renderClock(marketAssets[0]); if(window.drawGapChart)drawGapChart();}
 catch(e){box.textContent='Market data error: '+e.message}
}
function addMessage(type,text){
 const log=document.getElementById('chatlog');
 const p=document.createElement('p');
 p.className='msg '+type;
 p.innerHTML='<b>'+(type==='you'?'You':'PRONOUS')+':</b> '+text.replace(/\n/g,'<br>');
 log.appendChild(p); log.scrollTop=log.scrollHeight;
}
async function preflight(){
 const t=(document.getElementById('ticker').value||'NVDA').trim().toUpperCase();const amount=document.getElementById('amount').value;const maxSpend=document.getElementById('maxSpend').value;const box=document.getElementById('preflight');box.textContent='Running deterministic checks…';
 try{const r=await fetch('/api/agent?action=preflight&ticker='+encodeURIComponent(t)+'&amount='+encodeURIComponent(amount)+'&maxSpend='+encodeURIComponent(maxSpend));const j=await r.json(); preflightReady=j.preflight?.status==='READY_FOR_SIMULATION'; latestQuote=null; const qr=document.getElementById('quoteResult'); if(qr)qr.textContent=preflightReady?'Preflight passed. Enter source token and request quote.':'Quote is locked until preflight passes.'; await createPOAForAction('PREFLIGHT',preflightReady?'PLANNED':'BLOCKED',{asset:j.asset||null,simulation:{status:j.preflight?.status||'UNKNOWN'}}); setExecutionStep('preflight',j.preflight?.status||'BLOCKED');box.innerHTML='<b>'+esc(j.preflight?.status||'UNKNOWN')+'</b>\n'+(j.preflight?.checks||[]).map(x=>(x.pass?'✓ ':'✕ ')+esc(x.label)+(x.reason?' — '+esc(x.reason):'')).join('<br>')+'<br><span class="muted small">Next: '+esc(j.preflight?.next||'—')+'</span>';}catch(e){box.textContent='Preflight error: '+e.message}
}
async function scan(){
 const t=document.getElementById('ticker').value.trim().toUpperCase();
 if(!t)return;
 document.getElementById('scan').textContent='Scanning…';
 try{
  const r=await fetch('/api/agent?action=scan&ticker='+encodeURIComponent(t));
  const j=await r.json(); last=j;
  document.getElementById('scan').textContent=JSON.stringify(j,null,2);
  await createPOAForAction('SCAN','PLANNED',{asset:j.asset||null});
  document.getElementById('plan').textContent=JSON.stringify(j.plan||'No plan returned.',null,2);
 }catch(e){document.getElementById('scan').textContent='Error: '+e.message}
}
async function buildTransaction(){
 const box=document.getElementById('quoteResult');
 if(!latestQuote){if(box)box.textContent='Get a live quote first.';return;}
 const quote=latestQuote.quote||latestQuote.data||latestQuote;
 const quoteId=quote.quoteId||quote.id||quote.quoteID;
 const fromToken=(document.getElementById('fromTokenAddress')?.value||'').trim();
 const toToken=(latestQuote.asset?.tokenContractAddress||'').trim();
 const amount=(document.getElementById('amount')?.value||'').trim();
 if(!quoteId){if(box)box.textContent='Quote returned without a recognizable quoteId; build is locked.';return;}
 if(!walletAddress||!/^0x[a-fA-F0-9]{40}$/.test(fromToken)||!/^0x[a-fA-F0-9]{40}$/.test(toToken)){if(box)box.textContent='Wallet and valid token addresses are required before build.';return;}
 if(box)box.textContent='Building unsigned transaction…';
 try{
  const p=new URLSearchParams({action:'build',ticker:(document.getElementById('ticker').value||'NVDA').trim().toUpperCase(),fromTokenAddress:fromToken,toTokenAddress:toToken,amount,userWalletAddress:walletAddress,quoteId:String(quoteId),slippagePercent:'0.5',approveTransaction:'false'});
  const r=await fetch('/api/agent?'+p.toString()); const j=await r.json();
  if(!r.ok||j.error)throw new Error(j.error||'Build request failed');
  const built=j.built||j.swap||j;
  const evmTx=built.evmTx||built.transaction||built.tx||built.data?.evmTx||built.data?.transaction||null;
  if(!evmTx){latestQuote={...latestQuote,build:j};if(box)box.textContent='Build response received, but no recognizable EVM transaction was returned. Signing remains locked.';return;}
  latestQuote={...latestQuote,build:j,evmTx};
  if(box)box.innerHTML='<b>UNSIGNED TX READY</b><br><span class="muted small">Transaction prepared. Run chain simulation before confirmation.</span>';
  const sim=await fetch('/api/agent?'+new URLSearchParams({action:'simulateTx',ticker:(document.getElementById('ticker').value||'NVDA').trim().toUpperCase(),evmTx:JSON.stringify(evmTx)}).toString());
  const sj=await sim.json();
  if(!sim.ok||sj.status==='FAILED'||sj.simulation?.status!=='PASSED')throw new Error(sj.reason||sj.error||'Chain simulation failed');
  latestQuote={...latestQuote,simulation:sj};
  await createPOAForAction('SIMULATION','SIMULATED',{asset:latestQuote.asset||null,simulation:{mode:'BSC_RPC',status:'PASSED',gasEstimate:sj.simulation?.gasEstimate||null}});
  setExecutionStep('simulation','PASSED');
  const cb=document.getElementById('confirmActionBtn');if(cb)cb.disabled=false;
  const gs=document.getElementById('poaGateStatus');if(gs)gs.textContent='BSC RPC simulation passed. Explicit confirmation is now available; signing is still locked.';
 }catch(e){if(box)box.textContent='Build/simulation error: '+e.message;}
}
async function requestQuote(){
 const box=document.getElementById('quoteResult');
 const t=(document.getElementById('ticker').value||'NVDA').trim().toUpperCase();
 const fromToken=(document.getElementById('fromTokenAddress')?.value||'').trim();
 const amount=(document.getElementById('amount')?.value||'').trim();
 if(!preflightReady){if(box)box.textContent='Run a successful preflight first.';return;}
 if(!/^0x[a-fA-F0-9]{40}$/.test(fromToken)){if(box)box.textContent='Enter a valid source token contract address.';return;}
 if(!walletAddress){if(box)box.textContent='Connect the execution wallet before requesting a live quote.';return;}
 if(box)box.textContent='Requesting quote…';
 try{
  const p=new URLSearchParams({action:'quote',ticker:t,fromTokenAddress:fromToken,amount,userWalletAddress:walletAddress});
  const r=await fetch('/api/agent?'+p.toString()); const j=await r.json();
  if(!r.ok||j.error)throw new Error(j.error||'Quote request failed');
  latestQuote=j;
  if(box)box.innerHTML='<b>QUOTE READY</b><br><span class="muted small">Quote received without broadcast.</span><br><button class="secondary" type="button" onclick="buildTransaction()">Build unsigned transaction</button>';
  setExecutionStep('quote','READY');
 }catch(e){latestQuote=null;if(box)box.textContent='Quote error: '+e.message;}
}
async function simulate(){
 const t=(document.getElementById('ticker').value||'NVDA').trim().toUpperCase();
 if(!preflightReady){document.getElementById('plan').textContent='Run a successful preflight first.';return;}
 if(!walletProvider||!walletAddress){document.getElementById('plan').textContent='Connect the execution wallet before chain simulation.';return;}
 if(!latestQuote?.evmTx){document.getElementById('plan').textContent='Build an unsigned transaction from a live quote first.';return;}
 document.getElementById('plan').textContent='Running BSC RPC simulation…';
 try{
  const r=await fetch('/api/agent?'+new URLSearchParams({action:'simulateTx',ticker:t,evmTx:JSON.stringify(latestQuote.evmTx)}).toString());
  const j=await r.json();
  if(!r.ok||j.status==='FAILED'||j.simulation?.status!=='PASSED')throw new Error(j.reason||j.error||'BSC RPC simulation failed');
  latestQuote={...latestQuote,simulation:j};
  await createPOAForAction('SIMULATION','SIMULATED',{asset:latestQuote.asset||null,simulation:{mode:'BSC_RPC',status:'PASSED',gasEstimate:j.simulation?.gasEstimate||null}});
  setExecutionStep('simulation','PASSED');
  const cb=document.getElementById('confirmActionBtn');if(cb)cb.disabled=false;
  const gs=document.getElementById('poaGateStatus');if(gs)gs.textContent='BSC RPC simulation passed. Explicit wallet confirmation is now available.';
  document.getElementById('plan').textContent=JSON.stringify(j,null,2);
 }catch(e){document.getElementById('plan').textContent='BSC simulation error: '+e.message;}
}
async function ask(){
 const input=document.getElementById('question');
 const q=input.value.trim();
 if(!q)return;
 addMessage('you',q); input.value='';
 try{
  const r=await fetch('/api/ask?q='+encodeURIComponent(q)+'&ticker='+encodeURIComponent((document.getElementById('ticker').value||'NVDA').trim().toUpperCase()));
  const j=await r.json();
  addMessage('agent',j.answer||'I could not answer that yet.');
 }catch(e){addMessage('agent','The 24/7 desk is temporarily unavailable. You can still use Market Intelligence.');}
}
async function loadOnchain(x){
  const box=document.getElementById('chain');
  if(!box) return;
  const token=x&&x.tokenContractAddress;
  if(!token){box.textContent='No contract address for this asset.';return;}
  box.textContent='Loading on-chain data…';
  try{
    const r=await fetch('/api/onchain?token='+encodeURIComponent(token));
    const j=await r.json();
    const info=j.info&&!j.info.error?j.info:{};
    const holders=Array.isArray(j.holders)?j.holders:(j.holders&&j.holders.list)||[];
    const trades=Array.isArray(j.trades)?j.trades:(j.trades&&j.trades.list)||[];
    const pools=Array.isArray(j.pools)?j.pools:(j.pools&&j.pools.list)||[];
    const short=a=>{a=String(a||'');return a.length>12?a.slice(0,8)+'…'+a.slice(-6):a};
    box.innerHTML='Contract <a href="'+esc(j.explorer||'#')+'" target="_blank" rel="noreferrer">'+esc(short(token))+'</a> · BSC<br>'
      +'Creator '+(info.creatorAddress?esc(short(info.creatorAddress)):'—')
      +' · Top10 '+(info.top10HoldingPercent||'—')+'%<br>'
      +(Array.isArray(holders)?holders.length:0)+' holders · '
      +(Array.isArray(trades)?trades.length:0)+' trades · '
      +(Array.isArray(pools)?pools.length:0)+' pools';
  }catch(e){box.textContent='On-chain error: '+e.message;}
}
document.getElementById('question').addEventListener('keydown',e=>{if(e.key==='Enter')ask()});
loadMarket();
loadSkills();
initMarketWatch();
renderPOALedger();
