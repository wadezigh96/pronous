let cmcRadarTimer=null;
function cmcFmtPrice(v){const n=Number(v);if(!Number.isFinite(n))return '—';if(Math.abs(n)>=1000)return '$'+n.toLocaleString(undefined,{maximumFractionDigits:2});if(Math.abs(n)>=1)return '$'+n.toFixed(2);return '$'+n.toPrecision(4)}
function cmcFmtPct(v){const n=Number(v);if(!Number.isFinite(n))return '—';return (n>0?'+':'')+n.toFixed(2)+'%'}
function cmcRow(x){const c=Number(x.change1h);return '<div class="cmc-radar-row"><div><b>'+String(x.symbol||'').replace(/[&<>]/g,'')+'</b><span class="muted small"> '+String(x.name||'').replace(/[&<>]/g,'')+'</span></div><div>'+cmcFmtPrice(x.price)+'</div><div class="'+(c>=0?'pos':'neg')+'">'+cmcFmtPct(c)+'</div><div class="muted small">$'+(Number(x.volume24h)||0).toLocaleString(undefined,{notation:'compact',maximumFractionDigits:1})+'</div></div>'}
async function loadCMCRadar(){
  const el=document.getElementById('cmcRadar');
  const meta=document.getElementById('cmcRadarMeta');
  if(!el)return;
  try{
    const r=await fetch('/api/cmc-radar?limit=8',{cache:'no-store'}); const j=await r.json();
    if(!r.ok)throw new Error(j.message||j.error||'CMC unavailable');
    const rows=(j.radar||[]).slice(0,12);
    el.innerHTML=rows.length?rows.map(cmcRow).join(''):'No CMC market movers returned.';
    if(meta)meta.textContent='COINMARKETCAP · '+(j.sourceMode==='authenticated'?'API KEY':'PUBLIC API')+' · '+new Date(j.timestamp||Date.now()).toLocaleTimeString();
  }catch(e){
    el.innerHTML='<div class="muted small">CMC radar unavailable: '+String(e.message||e).replace(/[&<>]/g,'')+'</div>';
    if(meta)meta.textContent='CMC OFFLINE';
  }
}
function startCMCRadar(){if(cmcRadarTimer)return;loadCMCRadar();cmcRadarTimer=setInterval(()=>{if(!document.hidden)loadCMCRadar()},60000)}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadCMCRadar()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startCMCRadar,{once:true});else startCMCRadar();
