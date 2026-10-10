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
  const executeBtn=document.getElementById('executeOnchainBtn');
  if(executeBtn)executeBtn.disabled=true;
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
window.PRONOUS_SET_MARKET_ASSETS=function(rows){
  marketAssets=Array.isArray(rows)?rows:[];
  window.marketAssets=marketAssets;
  updateGapKpi();
  renderMarket();
  renderRadar();
  if(typeof window.renderPronousSignals==='function')window.renderPronousSignals();
  if(typeof window.drawGapChart==='function')window.drawGapChart();
  if(!marketAssets.length){
    const chartLast=document.getElementById('chartLast');
    const chartChange=document.getElementById('chartChange');
    const chartSource=document.getElementById('assetChartSrc');
    if(chartLast)chartLast.textContent='—';
    if(chartChange)chartChange.textContent='Live chart data unavailable';
    if(chartSource)chartSource.textContent='UNAVAILABLE';
  }
};
window.PRONOUS_RENDER_MARKET_ROWS=function(rows){
  const original=marketAssets;
  const originalWindow=window.marketAssets;
  marketAssets=Array.isArray(rows)?rows:[];
  window.marketAssets=marketAssets;
  try { renderMarket(); }
  finally { marketAssets=original; window.marketAssets=originalWindow; }
};
function shortAddress(a){a=String(a||'');return a&&a.length>12?a.slice(0,6)+'…'+a.slice(-4):a||'Not connected'}
function setWalletUI(address,source,chainId){const next=address||null;const changed=String(walletAddress||'').toLowerCase()!==String(next||'').toLowerCase()||String(walletSource||'')!==String(source||'')||Number(walletChainId||0)!==Number(chainId||0);walletAddress=next;walletSource=source||null;walletChainId=chainId||null;if(changed)resetExecutionState(next?'wallet changed':'wallet disconnected');const label=document.getElementById('walletStatus'),addr=document.getElementById('walletAddress'),addrTop=document.getElementById('walletAddressTop'),src=document.getElementById('walletSource'),btn=document.getElementById('connectWalletBtn'),kpi=document.getElementById('kpiExec');if(label)label.textContent=next?(Number(chainId)===56?(source==='privy'?'PRIVY WALLET · BSC':'BROWSER WALLET · BSC'):'WALLET CONNECTED · WRONG CHAIN'):'WALLET NOT CONNECTED';if(addr)addr.textContent=next?shortAddress(next):'Not connected';if(addrTop)addrTop.textContent=next?shortAddress(next):'Not connected';if(src)src.textContent=next?(source==='privy'?'PRIVY':'BROWSER WALLET'):'NO WALLET';if(btn){btn.disabled=false;btn.textContent=next?(Number(chainId)===56?'Disconnect':'Switch to BSC'):'Connect Wallet'}if(kpi)kpi.textContent=next?(Number(chainId)===56?'ARMED':'WRONG CHAIN'):'LOCKED'}
window.addEventListener('pronous:privy-wallet-connected',e=>{const d=e.detail||{};const same=String(walletAddress||'').toLowerCase()===String(d.address||'').toLowerCase()&&String(walletSource||'')===String(d.source||'')&&Number(walletChainId||0)===Number(d.chainId||0);if(!same)resetExecutionState(d.source==='privy'?'Privy wallet connected':'Browser wallet connected');setWalletUI(d.address||null,d.source||'privy',d.chainId||null)});
async function syncDeskWallet(){const api=window.PRONOUS_WALLET;if(api&&typeof api.sync==='function'){try{await api.sync()}catch(e){}}if(!api||typeof api.getAddress!=='function')return walletAddress||null;const address=api.getAddress();if(!address)return null;setWalletUI(address,typeof api.getSource==='function'?api.getSource():walletSource,typeof api.getChainId==='function'?api.getChainId():walletChainId);return address}
window.dispatchEvent(new CustomEvent('pronous:wallet-replay-request'));
window.addEventListener('pronous:privy-wallet-disconnected',e=>{resetExecutionState((e.detail&&e.detail.source||'wallet')+' disconnected');setWalletUI(null,null,null)});
function esc(s){return String(s??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]))}
function setExecutionStep(step,status){const order=['preflight','quote','simulation','confirmation','execution'];const idx=order.indexOf(step);document.querySelectorAll('.exec-step').forEach((el,i)=>{const active=i===idx,done=i<idx;el.classList.toggle('active',active);el.classList.toggle('done',done);const em=el.querySelector('em');if(em)em.textContent=active?status:(done?'PASS':(i>idx?'LOCKED':em.textContent))})}
function toggleMarketWatch(force){const body=document.getElementById('marketWatchBody'),btn=document.getElementById('marketToggle');if(!body||!btn)return;const open=force!==undefined?force:!body.classList.contains('open');body.classList.toggle('open',open);btn.setAttribute('aria-expanded',String(open));btn.textContent=open?'− Collapse':'＋ Expand'}
function initMarketWatch(){toggleMarketWatch(false)}
function setFilter(f){marketFilter=f;renderMarket()}
function closeAsset(){const d=document.getElementById('assetDrawer');if(d){d.classList.remove('open');d.setAttribute('aria-hidden','true')}}
function renderClock(x){const el=document.getElementById('clock');if(!el)return;el.innerHTML=x?'<div class="metric">'+esc(x.marketStatus||x.openState||'—')+'</div><div class="muted small">'+esc(x.ticker)+' · '+esc(x.platformId)+'</div>':'Select an asset.'}
function updateGapKpi(){const el=document.getElementById('kpiGap');if(!el)return;const scored=marketAssets.filter(x=>x.dataQuality==='ok'&&x.adjustedSpreadPct!=null&&Number.isFinite(Number(x.adjustedSpreadPct)));if(!scored.length){el.textContent='—';return}const best=scored.slice().sort((a,b)=>Math.abs(Number(b.adjustedSpreadPct))-Math.abs(Number(a.adjustedSpreadPct)))[0];const gap=Number(best.adjustedSpreadPct);el.textContent=(gap>0?'+':'')+gap.toFixed(2)+'%'}
function renderRadar(){const rows=marketAssets.filter(x=>x.dataQuality==='ok'&&x.adjustedSpreadPct!=null&&Number.isFinite(Number(x.adjustedSpreadPct))).sort((a,b)=>Math.abs(Number(b.adjustedSpreadPct))-Math.abs(Number(a.adjustedSpreadPct))).slice(0,5);const el=document.getElementById('radar');if(!el)return;el.innerHTML=rows.length?rows.map(x=>'<div style="margin:0 0 10px"><b>'+esc(x.ticker)+'</b> · '+esc(x.platformId)+' · <span class="'+(Number(x.adjustedSpreadPct)>=0?'pos':'neg')+'">'+(Number(x.adjustedSpreadPct)>0?'+':'')+Number(x.adjustedSpreadPct).toFixed(3)+'%</span> <small>adjusted · ratio '+esc(x.shareRatio??x.tokenToShareRatio??'—')+'</small></div>').join(''):'No valid ratio-adjusted spread data available.'}
function renderMarket(){const q=(document.getElementById('marketSearch')&&document.getElementById('marketSearch').value||'').trim().toUpperCase();const rows=marketAssets.filter(x=>(marketFilter==='all'||String(x.platformId).toLowerCase().includes(marketFilter))&&(String(x.ticker||'').toUpperCase().includes(q)||String(x.companyName||'').toUpperCase().includes(q)));const box=document.getElementById('marketTable');const count=document.getElementById('marketCount');if(count)count.textContent=String(rows.length);if(!box)return;if(!rows.length){box.textContent='No matching assets.';return}box.innerHTML='<div class="market-wrap"><table class="market compact-market"><thead><tr><th>Asset</th><th>Token</th><th>Adj. gap</th><th>Data</th></tr></thead><tbody>'+rows.slice(0,80).map(x=>{const gap=x.adjustedSpreadPct==null?null:Number(x.adjustedSpreadPct);const gapText=x.dataQuality==='missing_ratio'?'MISSING RATIO':gap==null?'—':(gap>0?'+':'')+gap.toFixed(3)+'%';return '<tr onclick="openAsset('+JSON.stringify(x.ticker)+','+JSON.stringify(x.platformId||'')+')"><td><b>'+esc(x.ticker)+'</b> <span class="muted small">'+esc(x.platformId||'')+'</span></td><td><b>'+esc(x.tokenPrice??'—')+'</b></td><td class="'+(gap==null?'':gap>=0?'pos':'neg')+'">'+gapText+'</td><td><span class="tag">'+esc(x.dataQuality||x.marketStatus||x.openState||'—')+'</span></td></tr>'}).join('')+'</tbody></table></div>'}
function openAsset(ticker,platform){const x=marketAssets.find(a=>String(a.ticker).toUpperCase()===String(ticker).toUpperCase()&&(!platform||String(a.platformId)===String(platform)))||marketAssets.find(a=>String(a.ticker).toUpperCase()===String(ticker).toUpperCase());if(!x)return;document.getElementById('ticker').value=x.ticker;window.__pronousSelectedAsset=x;renderClock(x);loadOnchain(x);if(typeof window.loadRwaParity==='function')window.loadRwaParity(x.ticker);const gap=x.adjustedSpreadPct==null?null:Number(x.adjustedSpreadPct);const gapClass=gap==null?'':(gap>=0?'pos':'neg');const gapText=x.dataQuality==='missing_ratio'?'MISSING RATIO':gap==null?'—':((gap>0?'+':'')+gap.toFixed(3)+'%');const drawer=document.getElementById('assetDrawer');const content=document.getElementById('drawerContent');if(content)content.innerHTML='<div class="drawer-kicker">TOKENIZED EQUITY</div><div class="drawer-title">'+esc(x.ticker)+'</div><div class="drawer-sub">'+esc(x.companyName||'')+' · '+esc(x.platformId||'')+'</div><div class="drawer-price"><div class="drawer-stat"><label>Token</label><strong>'+esc(x.tokenPrice??'—')+'</strong></div><div class="drawer-stat"><label>Reference</label><strong>'+esc(x.referencePrice??'—')+'</strong></div></div><div class="drawer-gap"><label class="muted small">ADJUSTED SPREAD</label><div class="metric '+gapClass+'">'+gapText+'</div><small class="muted">Raw spread: '+(x.rawSpreadPct==null?'—':Number(x.rawSpreadPct).toFixed(3)+'%')+' · Share ratio: '+esc(x.shareRatio??x.tokenToShareRatio??'missing')+' · Quality: '+esc(x.dataQuality||'unknown')+'</small></div><div class="drawer-actions"><button class="secondary" onclick="closeAsset();scan()">Scan</button><button onclick="closeAsset();preflight()">Preflight</button></div>';if(drawer){drawer.classList.add('open');drawer.setAttribute('aria-hidden','false');}if(typeof loadAssetChart==='function')loadAssetChart(x,'1h')}
async function loadSkills(){try{const r=await fetch('/api/skills?action=list');const j=await r.json();document.getElementById('skills').innerHTML=(j.skills||[]).map(s=>'<div><b>'+esc(s.icon)+' '+esc(s.name)+'</b><span class="muted small">'+esc(s.purpose)+'</span></div>').join('')}catch(e){const el=document.getElementById('skills');if(el)el.textContent='Skills unavailable.'}}
async function loadMarket(){const box=document.getElementById('marketTable');if(box)box.textContent='Loading…';try{const r=await fetch('/api/agent?action=assets');const j=await r.json();marketAssets=j.assets||[];window.marketAssets=marketAssets;const mode=document.getElementById('marketMode');if(mode){mode.textContent=(j.mode||'unknown').toUpperCase();mode.className='tag '+(j.mode==='live-data'?'live':'demo')}const kpiMode=document.getElementById('kpiMode');if(kpiMode)kpiMode.textContent=(j.mode||'—').replace('live-data','LIVE');const kpiAssets=document.getElementById('kpiAssets');if(kpiAssets)kpiAssets.textContent=String((j.summary&&j.summary.total)||marketAssets.length);updateGapKpi();renderMarket();renderRadar();renderClock(marketAssets[0]);if(window.drawGapChart)drawGapChart()}catch(e){if(box)box.textContent='Market data error: '+e.message}}
async function scan(){const t=(document.getElementById('ticker').value||'').trim().toUpperCase();if(!t)return;document.getElementById('scan').textContent='Scanning…';try{const r=await fetch('/api/agent?action=scan&ticker='+encodeURIComponent(t));const j=await r.json().catch(()=>({}));if(!r.ok){if(r.status===429)throw new Error('Rate limited. Wait 60 seconds before retrying.');if(r.status>=500)throw new Error('Market API unavailable ('+(j.error||r.status)+'). Retry shortly.');throw new Error(j.message||j.error||('Scan failed (HTTP '+r.status+').'))}last=j;document.getElementById('scan').textContent=JSON.stringify(j,null,2);document.getElementById('plan').textContent=JSON.stringify(j.plan||'No plan returned.',null,2);if(j.asset){loadOnchain(j.asset);if(typeof window.loadRwaParity==='function')window.loadRwaParity(j.asset.ticker||t)}}catch(e){document.getElementById('scan').textContent='Scan unavailable: '+e.message+'. No demo price was substituted.'}}
async function preflight(){
  resetExecutionState('preflight changed');
  const t=(document.getElementById('ticker').value||'NVDA').trim().toUpperCase();
  const box=document.getElementById('preflight');
  const ackOffHours=Boolean(document.getElementById('ackOffHours')?.checked);
  const params=new URLSearchParams({action:'preflight',ticker:t,amount:document.getElementById('amount').value,maxSpend:document.getElementById('maxSpend').value,ackOffHours:String(ackOffHours)});
  box.textContent='Running deterministic checks…';
  try{
    const r=await fetch('/api/agent?'+params.toString());
    const j=await r.json().catch(()=>({}));
    if(!r.ok){
      preflightReady=false;
      if(r.status===429)throw new Error('Rate limited. Wait 60 seconds before retrying.');
      if(r.status>=500)throw new Error('Market API unavailable ('+(j.error||r.status)+'). Retry shortly.');
      throw new Error(j.message||j.error||('Preflight failed (HTTP '+r.status+').'));
    }
    const pf=j.preflight||{};
    preflightReady=pf.status==='READY_FOR_SIMULATION'&&pf.warning!=='ACK_REQUIRED';
    setExecutionStep('preflight',preflightReady?pf.status:(pf.warning||pf.status||'BLOCKED'));
    const notes=[];
    box.innerHTML='<b>'+esc(pf.status||'UNKNOWN')+'</b>'+
      (pf.signal?'<div class="muted small">Signal: '+esc(pf.signal)+' · actionable: '+String(pf.actionable===true)+'</div>':'')+
      (pf.warning?'<div class="muted small">Warning: '+esc(pf.warning)+' · '+esc(pf.referenceWarning||'Acknowledge explicitly if you want to continue reviewing.')+'</div>':'')+
      notes.map(note=>'<div class="muted small">'+esc(note)+'</div>').join('');
    if(!preflightReady)box.innerHTML+='<div class="muted small">Resolve failed checks and acknowledge any market-hours warning before requesting a quote or simulation. Closed-market data remains non-actionable.</div>';
  }catch(e){
    preflightReady=false;
    box.textContent='Preflight unavailable: '+e.message+'. Retry when the API is available.';
  }
}
function bnbOnlyGuard(){const from=(document.getElementById('fromTokenAddress')?.value||'').trim().toLowerCase();if(from==='0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'||from==='0x0000000000000000000000000000000000000000'){const box=document.getElementById('quoteResult');if(box)box.textContent='Native BNB → NVDAon is not available in the current Binance route. Keep BNB for gas; use simulation/demo until a supported stablecoin balance exists.';return false}return true}
async function loadPancakeQuotePreview(ticker,fromTokenAddress,toTokenAddress,amount,maxSpend){
  const p=new URLSearchParams({action:'pancakeQuote',ticker,fromTokenAddress,toTokenAddress,amount,maxSpend});
  const r=await fetch('/api/agent?'+p.toString());
  const j=await r.json();
  window.__pronousPancakeQuote=j;
  return {httpOk:r.ok,status:r.status,data:j};
}
async function requestQuote(){
  const box=document.getElementById('quoteResult');
  if(!bnbOnlyGuard())return;
  if(!preflightReady){box.textContent='Run the read-only preflight before quote preview.';return}
  await syncDeskWallet();
  const walletReady=!!walletAddress&&Number(walletChainId)===56;
  const wrongChain=!!walletAddress&&!walletReady;
  const fromToken=(document.getElementById('fromTokenAddress').value||'').trim();
  if(!/^0x[a-fA-F0-9]{40}$/.test(fromToken)){box.textContent='Enter a supported spend token (USDT/USDC for the PancakeSwap preview), not the stock token.';return}
  const t=(document.getElementById('ticker').value||'NVDA').trim().toUpperCase();
  const asset=(marketAssets||[]).find(a=>String(a.ticker).toUpperCase()===t)||(last&&last.asset)||null;
  const toToken=asset&&asset.tokenContractAddress?String(asset.tokenContractAddress).trim():'';
  if(!toToken){box.textContent='No verified live contract address for this RWA asset.';return}
  if(fromToken.toLowerCase()===toToken.toLowerCase()){box.textContent='from and to token addresses must differ.';return}
  const amount=(document.getElementById('amount').value||'').trim();
  const maxSpend=(document.getElementById('maxSpend')?.value||'').trim();
  box.textContent='Checking read-only quote sources…';
  const requestBinance=async()=>{
    if(!walletReady) throw new Error(wrongChain?'Wrong wallet chain: switch to BSC Mainnet (chain ID 56) for a wallet-specific Binance quote.':'Wallet not connected: Binance wallet-specific quote skipped; PancakeSwap read-only preview is still available.');
    const p=new URLSearchParams({action:'quote',ticker:t,fromTokenAddress:fromToken,amount,userWalletAddress:walletAddress,toTokenAddress:toToken});
    const r=await fetch('/api/agent?'+p.toString());
    const j=await r.json().catch(()=>({}));
    return {httpOk:r.ok,status:r.status,data:j};
  };
  const [binanceResult,pancakeResult]=await Promise.allSettled([
    requestBinance(),
    loadPancakeQuotePreview(t,fromToken,toToken,amount,maxSpend)
  ]);
  let html='';
  let binanceLive=false;
  if(binanceResult.status==='fulfilled'){
    const result=binanceResult.value,j=result.data||{};
    if(result.httpOk && j.mode==='live-quote' && j.quote){
      binanceLive=true;latestQuote=j;html+='<div><b>BINANCE DEX LIVE QUOTE</b></div>';
    }else{
      let reason=String(j.error||j.status||j.mode||'quote unavailable');
      if(result.status===429)reason='Rate limited. Wait 60 seconds before retrying.';
      else if(result.status>=500)reason='Market API unavailable. Retry shortly.';
      html+='<div><b>Binance DEX quote unavailable</b> · '+esc(reason)+'</div>';
    }
  }else{
    html+='<div><b>Binance DEX quote error</b> · '+esc(binanceResult.reason?.message||'unknown')+'</div>';
  }
  if(pancakeResult.status==='fulfilled'){
    const result=pancakeResult.value,j=result.data||{};
    if(result.httpOk && j.quote){
      html+='<div><b>PANCAKESWAP READ-ONLY PREVIEW</b></div><div class="muted small">Expected output: '+esc(j.quote.expectedOutput||j.quote.amountOut||'—')+'</div>';
    }else{
      html+='<div><b>PancakeSwap preview unavailable</b> · '+esc(j.error||'no quote')+'</div>';
    }
  }
  box.innerHTML=html||'No quote data.';
}
function setSpendToken(addr){const el=document.getElementById('fromTokenAddress');if(el)el.value=addr;resetOnExecutionInput();}
async function simulate(){
  const planBox=document.getElementById('plan');
  const quoteBox=document.getElementById('quoteResult');
  const gate=document.getElementById('poaGateStatus');
  const ticker=(document.getElementById('ticker')?.value||'NVDA').trim().toUpperCase();
  const keepPreflightReady=preflightReady;
  resetExecutionState('simulation starting');
  preflightReady=keepPreflightReady;
  setExecutionStep('simulation','RUNNING');
  if(planBox)planBox.textContent='Building unsigned transaction and running BSC chain simulation…';
  try{
    if(!(await syncDeskWallet()))throw new Error('Connect a wallet before simulation.');
    if(Number(walletChainId)!==56)throw new Error('Switch the connected wallet to BNB Smart Chain Mainnet (chain ID 56).');
    if(!preflightReady)throw new Error('Run preflight and resolve its warning before simulation.');
    const fromToken=(document.getElementById('fromTokenAddress')?.value||'').trim();
    if(!/^0x[a-fA-F0-9]{40}$/.test(fromToken))throw new Error('Select a supported ERC-20 spend token (USDT, USDC, or WBNB).');
    const amount=(document.getElementById('amount')?.value||'').trim();
    const maxSpend=(document.getElementById('maxSpend')?.value||'').trim();
    const amountNumber=Number(amount), capNumber=Number(maxSpend);
    if(!Number.isFinite(amountNumber)||amountNumber<=0||!Number.isFinite(capNumber)||capNumber<=0||amountNumber>capNumber)throw new Error('Amount must be positive and must not exceed max spend.');
    const asset=(marketAssets||[]).find(a=>String(a.ticker).toUpperCase()===ticker)||(last&&last.asset)||null;
    if(!asset||asset.demo===true)throw new Error('A verified live RWA asset is required; demo data cannot be simulated.');
    if(asset.dataQuality!=='ok'||asset.actionable!==true)throw new Error('This asset is not actionable under the current data-quality, spread, or risk guardrails.');
    const marketStatus=String(asset.marketStatus||'').trim();
    if(!/^(open|trading|market[ _]open|regular|regular[ _]session)$/i.test(marketStatus)||asset.openState===false||String(asset.openState||'').toLowerCase()==='false')throw new Error('Underlying equity market is closed or unconfirmed. Simulation is locked to prevent stale-reference execution.');
    const toToken=String(asset.tokenContractAddress||'').trim();
    if(!/^0x[a-fA-F0-9]{40}$/.test(toToken))throw new Error('A verified RWA token contract address is required.');
    if(fromToken.toLowerCase()===toToken.toLowerCase())throw new Error('Spend token and RWA token must differ.');
    const walletAddressForSim=String(walletAddress||'').trim();
    if(!/^0x[a-fA-F0-9]{40}$/.test(walletAddressForSim))throw new Error('Connected wallet address is invalid.');
    const gates=window.PRONOUS_EXECUTION_GATES;
    const policy=window.PRONOUS_TX_POLICY;
    if(!gates||typeof gates.canonicalJson!=='function')throw new Error('Execution security module is not loaded. Reload after the dashboard update.');
    if(!policy||typeof policy.validateBroadcastTx!=='function')throw new Error('BSC transaction allowlist is not loaded. Execution remains blocked.');
    const paramsSnapshot=window.__pronousExecutionParams?window.__pronousExecutionParams():{ticker,amount,maxSpend,fromTokenAddress:fromToken,wallet:walletAddressForSim};
    const buildParams=new URLSearchParams({
      action:'quoteBuild',ticker,fromTokenAddress:fromToken,toTokenAddress:toToken,amount,maxSpend,
      userWalletAddress:walletAddressForSim,vendor:'LiquidMesh',slippagePercent:'0.5',
      approveTransaction:'true',ackOffHours:String(Boolean(document.getElementById('ackOffHours')?.checked))
    });
    const buildResponse=await fetch('/api/agent?'+buildParams.toString(),{cache:'no-store'});
    const built=await buildResponse.json().catch(()=>({}));
    if(!buildResponse.ok)throw new Error(built.error||built.message||('Live transaction build failed (HTTP '+buildResponse.status+').'));
    if(built.mode!=='live-quote-build'||built.broadcast!==false)throw new Error('The API did not return a verified live transaction build. Demo/unavailable responses cannot pass simulation.');
    const buildRoot=built.built||built;
    const buildData=buildRoot.data||buildRoot;
    const rawTx=buildData.tx||buildData.evmTx||buildData.swapTransaction||buildData.transaction||buildRoot.tx||null;
    if(!rawTx||typeof rawTx!=='object')throw new Error('The live builder returned no supported unsigned transaction. No simulation was marked passed.');
    const txTo=String(rawTx.to||'').trim();
    const txData=String(rawTx.data||rawTx.input||'').trim();
    if(!/^0x[a-fA-F0-9]{40}$/.test(txTo)||!/^0x[0-9a-fA-F]{8,}$/.test(txData))throw new Error('Unsigned transaction is missing a valid contract target or calldata.');
    if(rawTx.from&&String(rawTx.from).toLowerCase()!==walletAddressForSim.toLowerCase())throw new Error('Built transaction wallet does not match the connected wallet.');
    const rawValue=rawTx.value;
    if(rawValue!=null&&rawValue!==''&&rawValue!==0&&rawValue!=='0'&&String(rawValue).toLowerCase()!=='0x0'&&String(rawValue).toLowerCase()!=='0x00')throw new Error('Native BNB value is not supported for this execution route; use a supported ERC-20 spend token.');
    const tx={from:walletAddressForSim,to:txTo,data:txData,value:'0x0'};
    if(rawTx.gas!=null)tx.gas=rawTx.gas;
    if(rawTx.gasLimit!=null)tx.gasLimit=rawTx.gasLimit;
    if(rawTx.gasPrice!=null)tx.gasPrice=rawTx.gasPrice;
    if(rawTx.maxFeePerGas!=null)tx.maxFeePerGas=rawTx.maxFeePerGas;
    if(rawTx.maxPriorityFeePerGas!=null)tx.maxPriorityFeePerGas=rawTx.maxPriorityFeePerGas;
    const allowed=policy.validateBroadcastTx(tx,56);
    if(!allowed.ok)throw new Error('BSC transaction policy blocked this build: '+allowed.error);
    if(window.__pronousExecutionParams&&gates.canonicalJson(window.__pronousExecutionParams())!==gates.canonicalJson(paramsSnapshot))throw new Error('Execution inputs changed while the transaction was being built. Start again.');
    if(quoteBox)quoteBox.textContent='Live Binance transaction build received. Checking BSC eth_call simulation…';
    const simParams=new URLSearchParams({action:'simulateTx',ticker,userWalletAddress:walletAddressForSim,evmTx:JSON.stringify(tx)});
    const simResponse=await fetch('/api/agent?'+simParams.toString(),{cache:'no-store'});
    const simResult=await simResponse.json().catch(()=>({}));
    if(!simResponse.ok||simResult.status!=='PASSED'||!simResult.simulation||simResult.simulation.status!=='PASSED')throw new Error(simResult.reason||simResult.error||'BSC eth_call simulation did not pass.');
    if(window.__pronousExecutionParams&&gates.canonicalJson(window.__pronousExecutionParams())!==gates.canonicalJson(paramsSnapshot))throw new Error('Execution inputs changed while simulation was running. Start again.');
    const paramsHash=await hashExecutionValue({params:paramsSnapshot,tx});
    window.__pronousBuiltTx=tx;
    window.__pronousSimulation=simResult.simulation;
    window.__pronousSimTxHash=paramsHash;
    window.__pronousParamsHash=paramsHash;
    window.__pronousSimulated=true;
    window.__pronousConfirmed=false;
    latestQuote=built;
    window.latestQuote=built;
    setExecutionStep('quote','LIVE BUILD');
    setExecutionStep('simulation','BSC ETH_CALL PASSED');
    if(planBox)planBox.textContent='BSC chain simulation passed (eth_call at latest block). No transaction has been signed or sent. Review the quote, then explicitly confirm before opening the wallet signing prompt.';
    if(quoteBox)quoteBox.textContent='LIVE QUOTE/BUILD · BSC eth_call PASSED · broadcast=false · nothing signed or sent.';
    if(gate)gate.textContent='Simulation passed. Review the quote, then confirm explicitly.';
    const confirmBtn=document.getElementById('confirmActionBtn');
    if(confirmBtn)confirmBtn.disabled=false;
    window.dispatchEvent(new CustomEvent('pronous:simulation-passed'));
  }catch(e){
    resetExecutionState('simulation failed');
    setExecutionStep('simulation','BLOCKED');
    const message=e?.message||String(e);
    if(planBox)planBox.textContent='Simulation blocked: '+message;
    if(quoteBox)quoteBox.textContent='No executable quote approved. '+message;
    if(gate)gate.textContent='Execution remains locked. '+message;
  }
}
function confirmAction(){if(!window.__pronousSimulated){return}window.__pronousConfirmed=true;setExecutionStep('confirmation','CONFIRMED');const gate=document.getElementById('poaGateStatus');if(gate)gate.textContent='Confirmed. You may create POA or execute.';const execBtn=document.getElementById('executeOnchainBtn');if(execBtn)execBtn.disabled=false;}
async function createCurrentPOA(){const box=document.getElementById('poaCurrent');box.textContent='Creating POA…';try{const r=await fetch('/api/poa',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create',wallet:walletAddress,ticker:document.getElementById('ticker').value})});const j=await r.json();currentPOA=j;box.textContent=JSON.stringify(j,null,2);document.getElementById('poaStaticHash').textContent=j.hash||'No session proof';}catch(e){box.textContent='POA create failed: '+e.message;}}
async function anchorCurrentPOA(){const box=document.getElementById('poaAnchorStatus');if(!currentPOA){box.textContent='Create POA first.';return}box.textContent='Anchoring…';try{const r=await fetch('/api/poa',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'anchor',poa:currentPOA,anchor:document.getElementById('poaAnchorInput').value})});const j=await r.json();box.textContent=j.txHash?'Anchored: '+j.txHash:'Anchor result: '+JSON.stringify(j);if(j.txHash){const a=document.getElementById('poaAnchorTx');a.href='https://bscscan.com/tx/'+j.txHash;a.textContent='View on BscScan';a.style.display='inline';}}catch(e){box.textContent='Anchor failed: '+e.message;}}
function savePoaAnchorFromInput(){localStorage.setItem('pronous.poa.anchor',document.getElementById('poaAnchorInput').value);document.getElementById('poaAnchorStatus').textContent='Anchor address saved.';}
window.addEventListener('DOMContentLoaded',()=>{loadMarket();loadSkills();if(localStorage.getItem('pronous.poa.anchor'))document.getElementById('poaAnchorInput').value=localStorage.getItem('pronous.poa.anchor');});
