const PRONOUS_AGENT_STUDIO_PROMPT='Create and deploy a BSC mainnet autonomous agent named PRONOUS. Monitor tokenized equities through Binance Web3 API; search tickers; read token/reference prices; calculate spread; check market status; create transparent execution plans. Enforce scoped wallet policy, spend caps, contract allowlists, spot-only execution, simulation before broadcast, structured intents, and explicit user confirmation.';
function copyAgentStudioPrompt(){const f=document.getElementById('studioFeedback');const done=()=>{if(f)f.textContent='Deploy prompt copied.'};if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(PRONOUS_AGENT_STUDIO_PROMPT).then(done).catch(()=>fallbackCopyAgentStudioPrompt(done));else fallbackCopyAgentStudioPrompt(done)}
function fallbackCopyAgentStudioPrompt(done){const ta=document.createElement('textarea');ta.value=PRONOUS_AGENT_STUDIO_PROMPT;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done()}catch(e){const f=document.getElementById('studioFeedback');if(f)f.textContent='Copy unavailable'}ta.remove()}
function openAgentStudioDocs(){window.open('https://www.bnbchain.org/en/bnb-agent-studio','_blank','noopener,noreferrer')}
let walletAddress=null,walletChainId=null,walletSource=null,last=null,marketAssets=[],marketFilter='all',preflightReady=false,latestQuote=null,currentPOA=null;
const EXEC_GATES=window.PRONOUS_EXECUTION_GATES||null;
function resetExecutionState(reason){
  preflightReady=false;
  latestQuote=null;
  window.preflightReady=false;
  window.latestQuote=null;
  window.__pronousSimulated=false;
  window.__pronousConfirmed=false;
  window.__pronousBuiltTx=null;
  window.__pronousSimulation=null;
  window.__pronousSimTxHash=null;
  window.__pronousParamsHash=null;
  window.__pronousExecutionResetReason=reason||'input changed';
  const confirmBtn=document.getElementById('confirmActionBtn');
  if(confirmBtn)confirmBtn.disabled=true;
  if(/wallet|disconnect/i.test(String(reason||''))){
    const quote=document.getElementById('quoteResult');
    if(quote)quote.textContent='Quote is locked until preflight passes.';
    const gate=document.getElementById('poaGateStatus');
    if(gate&&!walletAddress)gate.textContent='Connect wallet, then simulate before confirmation.';
  }
}
function executionParams(){
  return {
    ticker:(document.getElementById('ticker')?.value||'NVDA').trim().toUpperCase(),
    amount:(document.getElementById('amount')?.value||'').trim(),
    maxSpend:(document.getElementById('maxSpend')?.value||'').trim(),
    fromTokenAddress:(document.getElementById('fromTokenAddress')?.value||'').trim(),
    wallet:walletAddress||''
  };
}
async function hashExecutionValue(value){
  const json=EXEC_GATES?EXEC_GATES.canonicalJson(value):JSON.stringify(value);
  if(window.crypto&&window.crypto.subtle){
    const bytes=new TextEncoder().encode(json);
    const digest=await window.crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  return json;
}
function resetOnExecutionInput(){
  resetExecutionState('execution input changed');
}
window.__pronousExecutionParams=executionParams;
window.__pronousResetExecutionState=resetExecutionState;
function shortAddress(a){a=String(a||'');return a&&a.length>12?a.slice(0,6)+'…'+a.slice(-4):a||'Not connected'}
function setWalletUI(address,source,chainId){const next=address||null;const changed=String(walletAddress||'').toLowerCase()!==String(next||'').toLowerCase()||String(walletSource||'')!==String(source||'')||Number(walletChainId||0)!==Number(chainId||0);walletAddress=next;walletSource=source||null;walletChainId=chainId||null;if(changed)resetExecutionState(next?'wallet changed':'wallet disconnected');const label=document.getElementById('walletStatus'),addr=document.getElementById('walletAddress'),addrTop=document.getElementById('walletAddressTop'),src=document.getElementById('walletSource'),btn=document.getElementById('connectWalletBtn'),kpi=document.getElementById('kpiExec');if(label)label.textContent=next?(source==='privy'?'PRIVY WALLET · BSC':'BROWSER WALLET · BSC'):'WALLET NOT CONNECTED';if(addr)addr.textContent=next?shortAddress(next):'Not connected';if(addrTop)addrTop.textContent=next?shortAddress(next):'Not connected';if(src)src.textContent=next?(source==='privy'?'PRIVY':'BROWSER WALLET'):'NO WALLET';if(btn){btn.disabled=false;btn.textContent=next?'Disconnect':'Connect Wallet'}if(kpi)kpi.textContent=next?'ARMED':'LOCKED'}
window.addEventListener('pronous:privy-wallet-connected',e=>{const d=e.detail||{};const same=String(walletAddress||'').toLowerCase()===String(d.address||'').toLowerCase()&&String(walletSource||'')===String(d.source||'')&&Number(walletChainId||0)===Number(d.chainId||0);if(!same)resetExecutionState(d.source==='privy'?'Privy wallet connected':'Browser wallet connected');setWalletUI(d.address||null,d.source||'privy',d.chainId||null)});
async function syncDeskWallet(){const api=window.PRONOUS_WALLET;if(api&&typeof api.sync==='function'){try{await api.sync()}catch(e){}}if(!api||typeof api.getAddress!=='function')return walletAddress||null;const address=api.getAddress();if(!address)return null;setWalletUI(address,typeof api.getSource==='function'?api.getSource():walletSource,typeof api.getChainId==='function'?api.getChainId():walletChainId);return address}
window.dispatchEvent(new CustomEvent('pronous:wallet-replay-request'));
window.addEventListener('pronous:privy-wallet-disconnected',e=>{resetExecutionState((e.detail&&e.detail.source||'wallet')+' disconnected');setWalletUI(null,null,null)});
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function setExecutionStep(step,status){const order=['preflight','quote','simulation','confirmation','execution'];const idx=order.indexOf(step);document.querySelectorAll('.exec-step').forEach((el,i)=>{const active=i===idx,done=i<idx;el.classList.toggle('active',active);el.classList.toggle('done',done);const em=el.querySelector('em');if(em)em.textContent=active?status:(done?'PASS':(i>idx?'LOCKED':em.textContent))})}
function toggleMarketWatch(force){const body=document.getElementById('marketWatchBody'),btn=document.getElementById('marketToggle');if(!body||!btn)return;const open=force!==undefined?force:!body.classList.contains('open');body.classList.toggle('open',open);btn.setAttribute('aria-expanded',String(open));btn.textContent=open?'− Collapse':'＋ Expand'}
function initMarketWatch(){toggleMarketWatch(false)}
function setFilter(f){marketFilter=f;renderMarket()}
function closeAsset(){const d=document.getElementById('assetDrawer');if(d){d.classList.remove('open');d.setAttribute('aria-hidden','true')}}
function renderClock(x){const el=document.getElementById('clock');if(!el)return;el.innerHTML=x?'<div class="metric">'+esc(x.marketStatus||x.openState||'—')+'</div><div class="muted small">'+esc(x.ticker)+' · '+esc(x.platformId)+'</div>':'Select an asset.'}
function updateGapKpi(){const el=document.getElementById('kpiGap');if(!el)return;const scored=marketAssets.filter(x=>Number.isFinite(Number(x.spreadPct)));if(!scored.length){el.textContent='—';return}const actionable=scored.filter(x=>Math.abs(Number(x.spreadPct))<25);const pool=actionable.length?actionable:scored;const best=pool.slice().sort((a,b)=>Math.abs(Number(b.spreadPct))-Math.abs(Number(a.spreadPct)))[0];const gap=Number(best.spreadPct);el.textContent=(gap>0?'+':'')+gap.toFixed(2)+'%'}
function renderRadar(){const rows=marketAssets.filter(x=>Number.isFinite(Number(x.spreadPct))).sort((a,b)=>Math.abs(Number(b.spreadPct))-Math.abs(Number(a.spreadPct))).slice(0,5);const el=document.getElementById('radar');if(!el)return;el.innerHTML=rows.length?rows.map(x=>'<div style="margin:0 0 10px"><b>'+esc(x.ticker)+'</b> · '+esc(x.platformId)+' · <span class="'+(Number(x.spreadPct)>=0?'pos':'neg')+'">'+(Number(x.spreadPct)>0?'+':'')+Number(x.spreadPct).toFixed(3)+'%</span></div>').join(''):'No spread data available.'}
function renderMarket(){const q=(document.getElementById('marketSearch')&&document.getElementById('marketSearch').value||'').trim().toUpperCase();const rows=marketAssets.filter(x=>(marketFilter==='all'||String(x.platformId).toLowerCase().includes(marketFilter))&&(String(x.ticker||'').toUpperCase().includes(q)||String(x.companyName||'').toUpperCase().includes(q)));const box=document.getElementById('marketTable');const count=document.getElementById('marketCount');if(count)count.textContent=String(rows.length);if(!box)return;if(!rows.length){box.textContent='No matching assets.';return}box.innerHTML='<div class="market-wrap"><table class="market compact-market"><thead><tr><th>Asset</th><th>Price</th><th>Gap</th><th>State</th></tr></thead><tbody>'+rows.slice(0,80).map(x=>{const gap=Number(x.spreadPct);return '<tr onclick="openAsset('+JSON.stringify(x.ticker)+','+JSON.stringify(x.platformId||'')+')"><td><b>'+esc(x.ticker)+'</b> <span class="muted small">'+esc(x.platformId||'')+'</span></td><td><b>'+esc(x.tokenPrice??'—')+'</b></td><td class="'+(gap>=0?'pos':'neg')+'">'+(Number.isFinite(gap)?(gap>0?'+':'')+gap.toFixed(3)+'%':'—')+'</td><td><span class="tag">'+esc(x.marketStatus||x.openState||'—')+'</span></td></tr>'}).join('')+'</tbody></table></div>'}
function openAsset(ticker,platform){const x=marketAssets.find(a=>String(a.ticker).toUpperCase()===String(ticker).toUpperCase()&&(!platform||String(a.platformId)===String(platform)))||marketAssets.find(a=>String(a.ticker).toUpperCase()===String(ticker).toUpperCase());if(!x)return;document.getElementById('ticker').value=x.ticker;window.__pronousSelectedAsset=x;renderClock(x);loadOnchain(x);if(typeof window.loadRwaParity==='function')window.loadRwaParity(x.ticker);const gap=Number(x.spreadPct);const gapClass=Number.isFinite(gap)?(gap>=0?'pos':'neg'):'';const gapText=Number.isFinite(gap)?((gap>0?'+':'')+gap.toFixed(3)+'%'):'—';const drawer=document.getElementById('assetDrawer');const content=document.getElementById('drawerContent');if(content)content.innerHTML='<div class="drawer-kicker">TOKENIZED EQUITY</div><div class="drawer-title">'+esc(x.ticker)+'</div><div class="drawer-sub">'+esc(x.companyName||'')+' · '+esc(x.platformId||'')+'</div><div class="drawer-price"><div class="drawer-stat"><label>Token</label><strong>'+esc(x.tokenPrice??'—')+'</strong></div><div class="drawer-stat"><label>Reference</label><strong>'+esc(x.referencePrice??'—')+'</strong></div></div><div class="drawer-gap"><label class="muted small">SPREAD</label><div class="metric '+gapClass+'">'+gapText+'</div></div><div class="drawer-actions"><button class="secondary" onclick="closeAsset();scan()">Scan</button><button onclick="closeAsset();preflight()">Preflight</button></div>';if(drawer){drawer.classList.add('open');drawer.setAttribute('aria-hidden','false');}if(typeof loadAssetChart==='function')loadAssetChart(x,'1h')}
async function loadSkills(){try{const r=await fetch('/api/skills?action=list');const j=await r.json();document.getElementById('skills').innerHTML=(j.skills||[]).map(s=>'<div><b>'+esc(s.icon)+' '+esc(s.name)+'</b><span class="muted small">'+esc(s.purpose)+'</span></div>').join('')}catch(e){const el=document.getElementById('skills');if(el)el.textContent='Skills unavailable.'}}
async function loadMarket(){const box=document.getElementById('marketTable');if(box)box.textContent='Loading…';try{const r=await fetch('/api/agent?action=assets');const j=await r.json();marketAssets=j.assets||[];window.marketAssets=marketAssets;const mode=document.getElementById('marketMode');if(mode){mode.textContent=(j.mode||'unknown').toUpperCase();mode.className='tag '+(j.mode==='live-data'?'live':'demo')}const kpiMode=document.getElementById('kpiMode');if(kpiMode)kpiMode.textContent=(j.mode||'—').replace('live-data','LIVE');const kpiAssets=document.getElementById('kpiAssets');if(kpiAssets)kpiAssets.textContent=String((j.summary&&j.summary.total)||marketAssets.length);updateGapKpi();renderMarket();renderRadar();renderClock(marketAssets[0]);if(window.drawGapChart)drawGapChart()}catch(e){if(box)box.textContent='Market data error: '+e.message}}
async function scan(){const t=(document.getElementById('ticker').value||'').trim().toUpperCase();if(!t)return;document.getElementById('scan').textContent='Scanning…';try{const r=await fetch('/api/agent?action=scan&ticker='+encodeURIComponent(t));const j=await r.json();last=j;document.getElementById('scan').textContent=JSON.stringify(j,null,2);document.getElementById('plan').textContent=JSON.stringify(j.plan||'No plan returned.',null,2);if(j.asset){loadOnchain(j.asset);if(typeof window.loadRwaParity==='function')window.loadRwaParity(j.asset.ticker||t)}}catch(e){document.getElementById('scan').textContent='Error: '+e.message}}
async function preflight(){resetExecutionState('preflight changed');const t=(document.getElementById('ticker').value||'NVDA').trim().toUpperCase();const box=document.getElementById('preflight');box.textContent='Running deterministic checks…';try{const r=await fetch('/api/agent?action=preflight&ticker='+encodeURIComponent(t)+'&amount='+encodeURIComponent(document.getElementById('amount').value)+'&maxSpend='+encodeURIComponent(document.getElementById('maxSpend').value));const j=await r.json();preflightReady=j.preflight&&j.preflight.status==='READY_FOR_SIMULATION';setExecutionStep('preflight',j.preflight&&j.preflight.status||'BLOCKED');box.innerHTML='<b>'+esc(j.preflight&&j.preflight.status||'UNKNOWN')+'</b>'}catch(e){box.textContent='Preflight error: '+e.message}}
function bnbOnlyGuard(){const from=(document.getElementById('fromTokenAddress')?.value||'').trim().toLowerCase();if(from==='0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'||from==='0x0000000000000000000000000000000000000000'){const box=document.getElementById('quoteResult');if(box)box.textContent='Native BNB → NVDAon is not available in the current Binance route. Keep BNB for gas; use simulation/demo until a supported stablecoin balance exists.';return false}return true}
async function loadPancakeQuotePreview(ticker,fromTokenAddress,toTokenAddress,amount,maxSpend){
  const p=new URLSearchParams({action:'pancakeQuote',ticker,fromTokenAddress,toTokenAddress,amount,maxSpend});
  const r=await fetch('/api/agent?'+p.toString());
  const j=await r.json();
  window.__pronousPancakeQuote=j;
  return {httpOk:r.ok,data:j};
}
async function requestQuote(){
  const box=document.getElementById('quoteResult');
  if(!bnbOnlyGuard())return;
  if(!preflightReady){box.textContent='Run preflight before quote.';return}
  if(!(await syncDeskWallet())){box.textContent='Connect wallet before quote.';return}
  const fromToken=(document.getElementById('fromTokenAddress').value||'').trim();
  if(!/^0x[a-fA-F0-9]{40}$/.test(fromToken)){box.textContent='Enter a supported spend token (USDT/USDC for the PancakeSwap preview), not the stock token.';return}
  const t=(document.getElementById('ticker').value||'NVDA').trim().toUpperCase();
  const asset=(marketAssets||[]).find(a=>String(a.ticker).toUpperCase()===t)||(last&&last.asset)||null;
  const toToken=asset&&asset.tokenContractAddress?String(asset.tokenContractAddress).trim():'';
  if(!toToken){box.textContent='No verified live contract address for this RWA asset.';return}
  if(fromToken.toLowerCase()===toToken.toLowerCase()){box.textContent='from and to token addresses must differ.';return}
  const amount=(document.getElementById('amount').value||'').trim();
  const maxSpend=(document.getElementById('maxSpend')?.value||'').trim();
  box.textContent='Checking live quote sources…';
  const requestBinance=async()=>{
    const p=new URLSearchParams({action:'quote',ticker:t,fromTokenAddress:fromToken,amount,userWalletAddress:walletAddress,toTokenAddress:toToken});
    const r=await fetch('/api/agent?'+p.toString());
    const j=await r.json();
    return {httpOk:r.ok,data:j};
  };
  const [binanceResult,pancakeResult]=await Promise.allSettled([
    requestBinance(),
    loadPancakeQuotePreview(t,fromToken,toToken,amount,maxSpend)
  ]);
  let html='';
  let binanceLive=false;
  if(binanceResult.status==='fulfilled'){
    const j=binanceResult.value.data;
    if(binanceResult.value.httpOk && j.mode==='live-quote' && j.quote){
      binanceLive=true;
      latestQuote=j;
      html+='<div><b>BINANCE DEX LIVE QUOTE</b></div>';
    }else{
      const reason=String(j.error||j.status||j.mode||'quote unavailable');
      html+='<div><b>Binance DEX quote unavailable</b> · '+esc(reason)+'</div>';
    }
  }else{
    html+='<div><b>Binance DEX quote unavailable</b> · '+esc(binanceResult.reason?.message||'request failed')+'</div>';
  }
  if(pancakeResult.status==='fulfilled'){
    const result=pancakeResult.value;
    const j=result.data||{};
    if(result.httpOk && j.quote && j.quote.status==='QUOTE_ONLY'){
      const q=j.quote;
      html+='<div style="margin-top:8px"><b>PancakeSwap quote preview</b> · '+esc(q.amountIn)+' → '+esc(q.amountOut)+' · price impact '+esc(q.priceImpact??'n/a')+' · '+esc((q.routeTypes||[]).join(' / '))+'</div><div class="muted small">Quote only; no calldata, signing or broadcast. Refresh before use.</div>';
    }else{
      html+='<div style="margin-top:8px"><b>PancakeSwap preview unavailable</b> · '+esc(j.status||j.error||j.mode||'no route')+'</div>';
    }
  }else{
    html+='<div style="margin-top:8px"><b>PancakeSwap preview unavailable</b> · '+esc(pancakeResult.reason?.message||'request failed')+'</div>';
  }
  box.innerHTML=html;
  if(binanceLive)setExecutionStep('quote','LIVE QUOTE');
  else setExecutionStep('quote','PREVIEW ONLY');
}
function setSpendToken(addr){const el=document.getElementById('fromTokenAddress');if(el){el.value=addr;resetExecutionState('spend token changed');el.focus()}}
function pickSimulationTx(root){const seen=new Set();function walk(x,depth){if(!x||typeof x!=='object'||depth>5||seen.has(x))return null;seen.add(x);for(const k of ['tx','evmTx','swapTransaction','transaction']){const v=x[k];if(v&&typeof v==='object'&&v.to)return v}for(const v of Object.values(x)){const hit=walk(v,depth+1);if(hit)return hit}return null}return walk(root,0)}
async function simulate(){const el=document.getElementById('plan');const t=(document.getElementById('ticker').value||'NVDA').trim().toUpperCase();if(!(await syncDeskWallet())){el.textContent='Connect wallet before simulation.';return}if(!preflightReady){el.textContent='Run preflight first.';return}const fromToken=(document.getElementById('fromTokenAddress').value||'').trim();if(!/^0x[a-fA-F0-9]{40}$/.test(fromToken)){el.textContent='Set spend token first (USDT / WBNB / USDC).';return}const asset=(marketAssets||[]).find(a=>String(a.ticker).toUpperCase()===t)||(last&&last.asset)||null;const toToken=asset&&asset.tokenContractAddress?String(asset.tokenContractAddress).trim():'';const amount=(document.getElementById('amount').value||'').trim();if(!toToken){el.textContent='Asset contract is unavailable.';return}el.textContent='Building unsigned transaction…';window.__pronousSimulated=false;try{const maxSpend=(document.getElementById('maxSpend')?.value||'').trim();
if(!maxSpend){el.textContent='Set max spend before simulation.';return}
const qp=new URLSearchParams({action:'quoteBuild',ticker:t,fromTokenAddress:fromToken,toTokenAddress:toToken,amount,maxSpend,userWalletAddress:walletAddress,vendor:'LiquidMesh',slippagePercent:'0.5',approveTransaction:'true'});const br=await fetch('/api/agent?'+qp.toString());const built=await br.json();if(!br.ok||built.error)throw new Error(built.error||'Quote + build failed');
latestQuote=built;
window.latestQuote=built;
setExecutionStep('quote','READY');
const tx=pickSimulationTx(built);if(!tx||!tx.to)throw new Error('Build did not return an EVM transaction');el.textContent='Simulating on BSC…';const sr=await fetch('/api/agent?action=simulateTx&ticker='+encodeURIComponent(t)+'&userWalletAddress='+encodeURIComponent(walletAddress)+'&evmTx='+encodeURIComponent(JSON.stringify(tx)));const sj=await sr.json();if(!sr.ok||sj.status!=='PASSED'||!sj.simulation||sj.simulation.status!=='PASSED')throw new Error(sj.reason||sj.error||'BSC simulation failed');window.__pronousBuiltTx=tx;window.__pronousSimulation=sj.simulation;window.latestQuote=built;window.__pronousParamsHash=await hashExecutionValue({params:executionParams(),tx:tx});window.__pronousSimTxHash=window.__pronousParamsHash;window.__pronousSimulated=true;setExecutionStep('simulation','PASSED');el.innerHTML='<b>CHAIN SIMULATION PASSED</b><div class="muted small">BSC eth_call · no broadcast</div>';const s=document.getElementById('poaGateStatus');if(s)s.textContent='Chain simulation passed. Confirm before wallet signing.';const btn=document.getElementById('confirmActionBtn');if(btn)btn.disabled=false;window.dispatchEvent(new CustomEvent('pronous:simulation-passed'))}catch(e){window.__pronousSimulated=false;window.__pronousBuiltTx=null;el.textContent='Simulation error: '+(e.message||e)}}
async function confirmAction(){
  const s=document.getElementById('poaGateStatus');
  if(!(await syncDeskWallet())){
    if(s)s.textContent='Connect wallet before confirmation.';
    return false;
  }

  if(!preflightReady){
    if(s)s.textContent='Preflight must pass first.';
    return false;
  }

  if(!latestQuote && !window.latestQuote){
    if(s)s.textContent='Quote must pass before confirmation.';
    return false;
  }

  if(!window.__pronousSimulated){
    if(s)s.textContent='Run chain simulation before confirmation.';
    return false;
  }

  setExecutionStep('confirmation','CONFIRMED');
  window.__pronousConfirmed=true;

  if(s)s.textContent='Confirmed. Creating POA (no broadcast).';
  await createCurrentPOA('CONFIRMED');
  return true;
}
function poaLedgerKey(){return 'pronous_poa_ledger_v1'}
function loadPOALedger(){try{return JSON.parse(localStorage.getItem(poaLedgerKey())||'[]')}catch(e){return []}}
function savePOALedger(rows){try{localStorage.setItem(poaLedgerKey(),JSON.stringify(rows.slice(0,20)))}catch(e){}}
async function createCurrentPOA(status){const box=document.getElementById('poaCurrent');const t=(document.getElementById('ticker').value||'NVDA').trim().toUpperCase();const intent={ticker:t,amount:document.getElementById('amount')&&document.getElementById('amount').value,maxSpend:document.getElementById('maxSpend')&&document.getElementById('maxSpend').value,wallet:walletAddress||null,preflightReady:!!preflightReady,simulated:!!window.__pronousSimulated};const input={action:'SCAN_OR_TRADE',status:status||(window.__pronousSimulated?'SIMULATED':'PLANNED'),network:'BSC',asset:{ticker:t},intent,userConfirmation:status==='CONFIRMED'};if(box)box.textContent='Creating POA…';try{const r=await fetch('/api/poa?action=create&proof='+encodeURIComponent(JSON.stringify(input)));const j=await r.json();if(!r.ok||j.error)throw new Error(j.error||'POA failed');currentPOA=j.proof;window.currentPOA=j.proof;if(box)box.innerHTML='<div class="poa-proof"><div><b>'+esc(j.proof.poaId)+'</b> · '+esc(j.proof.status)+'</div><code>'+esc(j.proof.poaHash)+'</code><button class="secondary" type="button" onclick="verifyCurrentPOA()">Verify</button><div id="poaVerify" class="poa-verify"></div></div>';const ledger=loadPOALedger();ledger.unshift({poaId:j.proof.poaId,status:j.proof.status,hash:j.proof.poaHash,at:j.proof.timestamp});savePOALedger(ledger);renderPOALedger()}catch(e){if(box)box.textContent='POA error: '+e.message}}
async function verifyCurrentPOA(){const el=document.getElementById('poaVerify');if(!currentPOA){if(el)el.textContent='No POA.';return}try{const r=await fetch('/api/poa?action=verify&proof='+encodeURIComponent(JSON.stringify(currentPOA)));const j=await r.json();const v=j.verification||{};if(el){el.textContent=v.valid?'VALID · hash match':'INVALID · '+(v.reason||'mismatch');el.className='poa-verify '+(v.valid?'valid':'invalid')}}catch(e){if(el)el.textContent='Verify error: '+e.message}}
function clearPOALedger(){savePOALedger([]);renderPOALedger();const box=document.getElementById('poaCurrent');if(box)box.textContent='No POA generated for this session.';currentPOA=null;window.currentPOA=null}
function renderPOALedger(){const el=document.getElementById('poaLedger');if(!el)return;const rows=loadPOALedger();if(!rows.length){el.textContent='No evidence yet.';return}el.innerHTML=rows.map(r=>'<div class="poa-row"><div><b>'+esc(r.poaId)+'</b> <span class="muted">'+esc(r.status)+'</span></div><code>'+esc(String(r.hash||'').slice(0,16))+'…</code><span class="muted small">'+esc(String(r.at||'').slice(0,19))+'</span></div>').join('')}
const PRONOUS_POA_ANCHOR_DEFAULT='0xD729eFf0E050195D464cC9597d7A5Cc7194911B5';
const POA_STATUS_CODE={PLANNED:0,SIMULATED:1,CONFIRMED:2,EXECUTED:3,BLOCKED:4,REJECTED:5,EXPIRED:6};
function getPoaAnchorAddress(){try{const fromLs=localStorage.getItem('pronous_poa_anchor');if(fromLs&&/^0x[a-fA-F0-9]{40}$/.test(fromLs))return fromLs}catch(e){}if(window.PRONOUS_POA_ANCHOR&&/^0x[a-fA-F0-9]{40}$/.test(window.PRONOUS_POA_ANCHOR))return window.PRONOUS_POA_ANCHOR;return PRONOUS_POA_ANCHOR_DEFAULT}
function setPoaAnchorAddress(addr){const a=String(addr||'').trim();if(!/^0x[a-fA-F0-9]{40}$/.test(a))throw new Error('Invalid contract address');localStorage.setItem('pronous_poa_anchor',a);window.PRONOUS_POA_ANCHOR=a}
function savePoaAnchorFromInput(){const el=document.getElementById('poaAnchorInput');const st=document.getElementById('poaAnchorStatus');try{setPoaAnchorAddress(el&&el.value);if(st)st.textContent='Anchor contract saved: '+getPoaAnchorAddress()}catch(e){if(st)st.textContent=e.message}}
async function encodeAnchorCalldata(poaHashHex,statusCode,poaId){const viem=await import('/vendor/privy-bundle.js');const hash=poaHashHex.startsWith('0x')?poaHashHex:'0x'+poaHashHex;if(hash.length!==66)throw new Error('poaHash must be 32-byte hex');return viem.encodeFunctionData({abi:[{type:'function',name:'anchor',stateMutability:'nonpayable',inputs:[{name:'poaHash',type:'bytes32'},{name:'status',type:'uint8'},{name:'poaId',type:'string'}],outputs:[]}],functionName:'anchor',args:[hash,statusCode,String(poaId||'')]})}
async function resolveWalletForAnchor(){const api=window.PRONOUS_WALLET;if(!api||typeof api.getAddress!=='function'||typeof api.request!=='function')return{api:null,address:null};if(typeof api.sync==='function'){try{await api.sync()}catch(_){}}const address=api.getAddress()||walletAddress||null;const chainId=typeof api.getChainId==='function'?api.getChainId():null;const source=typeof api.getSource==='function'?api.getSource():null;return{api,address,chainId,source}}
async function anchorCurrentPOA(){const box=document.getElementById('poaAnchorStatus');const set=(t)=>{if(box)box.textContent=t};if(!currentPOA||!currentPOA.poaHash){set('Create an off-chain POA first.');return}set('Checking wallet…');const{api,address,chainId}=await resolveWalletForAnchor();if(!api||typeof api.request!=='function'){set('No active wallet API. Tap Connect Wallet, then retry Anchor.');return}if(!address){set('No connected wallet state. Reconnect wallet, approve, then Anchor again.');return}if(Number(chainId || walletChainId || 0)!==56){set('Wallet must be on BSC Mainnet (chainId 56).');return}const contract=getPoaAnchorAddress();if(!contract){set('No anchor contract set.');return}try{if(typeof api.ensureBsc==='function'){set('Checking BSC Mainnet…');await api.ensureBsc()}set('Encoding tx…');const status=POA_STATUS_CODE[String(currentPOA.status||'PLANNED').toUpperCase()]??0;const data=await encodeAnchorCalldata(currentPOA.poaHash,status,currentPOA.poaId||'');set('Confirm in wallet (BNB gas only)…');const txHash=await api.request('eth_sendTransaction',[{from:address,to:contract,data,value:'0x0'}],'pronous-desk');set('Anchored · tx '+String(txHash).slice(0,12)+'…');const link=document.getElementById('poaAnchorTx');if(link){link.href='https://bscscan.com/tx/'+txHash;link.textContent=String(txHash).slice(0,18)+'…';link.style.display='inline'}try{const ledger=loadPOALedger();if(ledger[0]&&ledger[0].hash===currentPOA.poaHash){ledger[0].txHash=txHash;ledger[0].anchored=true;savePOALedger(ledger);renderPOALedger()}}catch(e){}}catch(e){const msg=(e&&(e.message||e.data||e.reason))||String(e);set('Anchor failed: '+msg);console.error('PRONOUS anchor POA',e)}}
(function initPoaAnchorField(){const el=document.getElementById('poaAnchorInput');if(el)el.value=getPoaAnchorAddress();const st=document.getElementById('poaAnchorStatus');if(st&&!st.textContent)st.textContent='Contract live on BSC. Create POA then Anchor — you pay BNB gas.';})();
['ticker','amount','maxSpend','fromTokenAddress'].forEach(id=>{const el=document.getElementById(id);if(el){el.addEventListener('input',resetOnExecutionInput);el.addEventListener('change',resetOnExecutionInput)}});resetExecutionState('initial state');
loadMarket();loadSkills();initMarketWatch();renderPOALedger();
