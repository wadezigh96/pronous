(function(){
  let timer = null;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(4) : '—';

  function ensurePanel(){
    if(document.getElementById('rwaParityCard')) return document.getElementById('rwaParity');
    const section=document.getElementById('radar-section');
    if(!section) return null;
    const card=document.createElement('section');
    card.id='rwaParityCard';
    card.className='card terminal-card section-anchor';
    card.innerHTML='<div class="terminal-head"><div><h2>RWA Parity</h2><small>ONDO · bSTOCKS · xSTOCKS</small></div><span id="rwaParityMeta" class="muted small">WAITING</span></div>'+
      '<div class="row" style="margin-bottom:10px"><input id="rwaParityTicker" value="NVDA" maxlength="20" aria-label="RWA parity ticker"><button class="secondary" type="button" id="rwaParityRefresh">Compare</button></div>'+
      '<div id="rwaParity" class="result" style="padding:0;overflow:auto;white-space:normal">Compare live tokenised representations of the same equity.</div>';
    section.insertAdjacentElement('afterend',card);
    document.getElementById('rwaParityRefresh')?.addEventListener('click',loadParity);
    document.getElementById('rwaParityTicker')?.addEventListener('keydown',e=>{if(e.key==='Enter')loadParity();});
    return document.getElementById('rwaParity');
  }

  function render(j){
    const el=document.getElementById('rwaParity');
    const meta=document.getElementById('rwaParityMeta');
    if(!el) return;
    const c=j.comparison||{};
    const rows=(c.platforms||[]).map((x)=>{
      if(!x.available) return '<div class="rwa-parity-row"><b>'+esc(x.platformId)+'</b><span class="muted">NOT IN LIVE UNIVERSE</span><span>—</span><span>—</span></div>';
      const q=x.dataQuality==='ok'?'OK':String(x.dataQuality||'UNKNOWN').toUpperCase();
      return '<div class="rwa-parity-row"><b>'+esc(x.platformId)+'</b><span>'+esc(x.tokenSymbol||'—')+'</span><span>'+fmt(x.tokenPrice)+'</span><span>'+fmt(x.referencePrice)+'</span><span class="'+(Number(x.spreadPct)>=0?'pos':'neg')+'">'+(Number(x.spreadPct)>0?'+':'')+fmt(x.spreadPct)+'%</span><em>'+esc(q)+'</em></div>';
    }).join('');
    el.innerHTML='<div class="rwa-parity-row head"><span>Platform</span><span>Token</span><span>Token px</span><span>Ref px</span><span>Gap</span><span>Data</span></div>'+rows+
      '<div class="muted small" style="padding:10px 12px">'+(c.comparable?'Cross-platform gap: <b>'+esc(c.crossPlatformGapPct)+'%</b> · '+esc(c.platformCount)+' live representations':'Cross-platform comparison requires at least two live representations.')+'</div>';
    if(meta) meta.textContent='BSC · '+esc(j.ticker||'')+' · LIVE';
  }

  async function loadParity(){
    const el=ensurePanel();
    const input=document.getElementById('rwaParityTicker');
    const ticker=String(input?.value||document.getElementById('ticker')?.value||'NVDA').trim().toUpperCase();
    if(!el||!ticker) return;
    el.textContent='Loading live parity…';
    try{
      const r=await fetch('/api/rwa-compare?ticker='+encodeURIComponent(ticker),{cache:'no-store'});
      const j=await r.json();
      if(!r.ok) throw new Error(j.error||'RWA comparison unavailable');
      render(j);
    }catch(e){
      el.innerHTML='<div class="muted small" style="padding:12px">RWA parity unavailable: '+esc(e.message)+'</div>';
      const meta=document.getElementById('rwaParityMeta'); if(meta) meta.textContent='UNAVAILABLE';
    }
  }

  function start(){
    ensurePanel();
    loadParity();
    if(timer) clearInterval(timer);
    timer=setInterval(()=>{if(!document.hidden)loadParity();},30000);
  }
  window.loadRwaParity=function(ticker){const input=document.getElementById('rwaParityTicker');if(input&&ticker)input.value=String(ticker).trim().toUpperCase();return loadParity();};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
