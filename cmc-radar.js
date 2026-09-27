let cmcRadarTimer=null;
function cmcEsc(s){return String(s??'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]))}
function cmcFmtPrice(v){const n=Number(v);if(!Number.isFinite(n))return '—';if(Math.abs(n)>=1000)return '$'+n.toLocaleString(undefined,{maximumFractionDigits:2});if(Math.abs(n)>=1)return '$'+n.toFixed(2);return '$'+n.toPrecision(4)}
function cmcFmtPct(v){const n=Number(v);if(!Number.isFinite(n))return '—';return (n>0?'+':'')+n.toFixed(2)+'%'}
function ensureCMCRadarPanel(){
  if(document.getElementById('cmcRadarCard'))return document.getElementById('cmcRadar');
  const section=document.getElementById('radar-section');if(!section)return null;
  const card=document.createElement('section');card.id='cmcRadarCard';card.className='card terminal-card';
  card.innerHTML='<div class="terminal-head"><div><h2>CMC Market Radar</h2><small>COINMARKETCAP · 60S FEED</small></div><span id="cmcRadarMeta" class="muted small">LOADING</span></div><div id="cmcRadar" class="result" style="padding:0;overflow:hidden"></div>';
  section.appendChild(card);
  const style=document.createElement('style');style.textContent='#cmcRadarCard{grid-column:1/-1}.cmc-radar-row{display:grid;grid-template-columns:1.1fr .9fr .8fr .9fr;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(245,197,66,.1);align-items:center}.cmc-radar-row:last-child{border-bottom:0}@media(max-width:700px){.cmc-radar-row{grid-template-columns:1fr 1fr}.cmc-radar-row>:nth-child(4){display:none}}';document.head.appendChild(style);
  return document.getElementById('cmcRadar');
}
function cmcRow(x){const c=Number(x.change1h);return '<div class="cmc-radar-row"><div><b>'+cmcEsc(x.symbol)+'</b><span class="muted small"> '+cmcEsc(x.name)+'</span></div><div>'+cmcFmtPrice(x.price)+'</div><div class="'+(c>=0?'pos':'neg')+'">'+cmcFmtPct(c)+'</div><div class="muted small">$'+(Number(x.volume24h)||0).toLocaleString(undefined,{notation:'compact',maximumFractionDigits:1})+'</div></div>'}
async function loadCMCRadar(){
  const el=ensureCMCRadarPanel(),meta=document.getElementById('cmcRadarMeta');if(!el)return;
  try{const r=await fetch('/api/cmc-radar?limit=8',{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.message||j.error||'CMC unavailable');el.innerHTML=(j.radar||[]).slice(0,12).map(cmcRow).join('')||'<div class="muted small">No CMC market movers returned.</div>';if(meta)meta.textContent='COINMARKETCAP · '+(j.sourceMode==='authenticated'?'API KEY':'PUBLIC API')+' · '+new Date(j.timestamp||Date.now()).toLocaleTimeString()}catch(e){el.innerHTML='<div class="muted small" style="padding:12px">CMC radar unavailable: '+cmcEsc(e.message||e)+'</div>';if(meta)meta.textContent='CMC OFFLINE'}}
function startCMCRadar(){if(cmcRadarTimer)return;loadCMCRadar();cmcRadarTimer=setInterval(()=>{if(!document.hidden)loadCMCRadar()},60000)}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadCMCRadar()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startCMCRadar,{once:true});else startCMCRadar();
