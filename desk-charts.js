function chartRows(){
  return [...(window.marketAssets||[])].filter(x=>x.actionable!==false && Number.isFinite(Number(x.spreadPct))).sort((a,b)=>Math.abs(Number(b.spreadPct))-Math.abs(Number(a.spreadPct)));
}
function drawLineChart(canvas, points, color){
  if(!canvas || !points.length) return;
  const ctx=canvas.getContext('2d');
  const w=canvas.width, h=canvas.height;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#101419'; ctx.fillRect(0,0,w,h);
  const vals=points.map(p=>p.y).filter(Number.isFinite);
  if(!vals.length) return;
  const min=Math.min(...vals), max=Math.max(...vals), pad=(max-min)*0.08 || 1;
  const lo=min-pad, hi=max+pad;
  ctx.strokeStyle='#2a2418'; ctx.lineWidth=1;
  for(let i=1;i<4;i++){const y=h*i/4; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();}
  ctx.beginPath();
  points.forEach((p,i)=>{
    const x=points.length===1?w/2:(i/(points.length-1))*w;
    const y=h-((p.y-lo)/(hi-lo))*h;
    i?ctx.lineTo(x,y):ctx.moveTo(x,y);
  });
  ctx.strokeStyle=color||'#f0b90b'; ctx.lineWidth=2; ctx.stroke();
  const last=points[points.length-1];
  const ly=h-((last.y-lo)/(hi-lo))*h;
  ctx.fillStyle=color||'#f0b90b'; ctx.beginPath(); ctx.arc(w-2,ly,3,0,Math.PI*2); ctx.fill();
}
function drawGapChart(){
  const canvas=document.getElementById('gapChart');
  const label=document.getElementById('tapeLabel');
  const rows=chartRows().slice(0,10);
  if(label && !window.__pronousSelectedAsset) label.textContent=rows.length?rows.length+' live divergence signals':'No live signals';
  if(!canvas)return;
  if(window.__pronousSelectedAsset && typeof loadAssetChart==='function'){
    loadAssetChart(window.__pronousSelectedAsset, window.__pronousChartBar||'1h');
    return;
  }
  const ctx=canvas.getContext('2d'), w=canvas.width, h=canvas.height;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#070a10';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='rgba(35,52,78,.55)';ctx.lineWidth=1;
  for(let y=22;y<h-28;y+=42){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  if(!rows.length)return;
  const maxAbs=Math.max(...rows.map(x=>Math.abs(Number(x.spreadPct))),0.01);
  const mid=h/2, slot=w/rows.length;
  rows.forEach((x,i)=>{
    const v=Number(x.spreadPct), ratio=Math.min(1,Math.abs(v)/maxAbs);
    const bar=Math.max(6,ratio*(mid-30)), x0=i*slot+slot*.16, bw=slot*.68;
    const grad=ctx.createLinearGradient(0,mid-bar,0,mid+bar);
    grad.addColorStop(0,'#ffe27a');grad.addColorStop(.45,'#f5c542');grad.addColorStop(1,'#9b6b0c');
    ctx.fillStyle=grad;ctx.globalAlpha=.9;ctx.fillRect(x0,v>=0?mid-bar:mid,bw,bar);ctx.globalAlpha=1;
    ctx.fillStyle='#f5c542';ctx.font='600 10px IBM Plex Mono,monospace';ctx.textAlign='center';ctx.fillText(String(x.ticker).slice(0,6),x0+bw/2,h-12);
    ctx.fillStyle='#d8d1c0';ctx.font='9px IBM Plex Mono,monospace';ctx.fillText((v>0?'+':'')+v.toFixed(2)+'%',x0+bw/2,v>=0?mid-bar-7:mid+bar+12);
  });
  ctx.strokeStyle='rgba(245,197,66,.55)';ctx.beginPath();ctx.moveTo(0,mid);ctx.lineTo(w,mid);ctx.stroke();
}
function drawCandleChart(canvas,candles){if(!canvas||!candles.length)return;const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#070a10';ctx.fillRect(0,0,w,h);const vals=candles.flatMap(c=>[Number(c.high),Number(c.low)]).filter(Number.isFinite);if(!vals.length)return;const min=Math.min(...vals),max=Math.max(...vals),pad=(max-min)*.08||1,lo=min-pad,hi=max+pad;ctx.strokeStyle='rgba(120,130,145,.16)';ctx.lineWidth=1;for(let i=1;i<5;i++){const y=18+(i/5)*(h-38);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}const left=10,right=10,top=12,bottom=26,plotW=w-left-right,plotH=h-top-bottom;const step=plotW/candles.length;const bodyW=Math.max(2,Math.min(10,step*.62));candles.forEach((c,i)=>{const o=Number(c.open),cl=Number(c.close),hiC=Number(c.high),loV=Number(c.low);if(![o,cl,hiC,loV].every(Number.isFinite))return;const x=left+i*step+step/2;const y=v=>top+((hi-v)/(hi-lo))*plotH;const up=cl>=o;ctx.strokeStyle=up?'#2fbf8f':'#e8604c';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y(hiC));ctx.lineTo(x,y(loV));ctx.stroke();const yo=y(o),yc=y(cl),bodyTop=Math.min(yo,yc),bodyH=Math.max(1,Math.abs(yc-yo));ctx.fillRect(x-bodyW/2,bodyTop,bodyW,bodyH)});const last=candles[candles.length-1];ctx.fillStyle='#d8d1c0';ctx.font='10px IBM Plex Mono,monospace';ctx.textAlign='right';ctx.fillText(Number(last.close).toFixed(4),w-8,12);}
async function loadAssetChart(asset,bar='1h'){
  if(!asset)return;
  window.__pronousSelectedAsset=asset;
  window.__pronousChartBar=bar;
  const src=document.getElementById('assetChartSrc');
  const label=document.getElementById('tapeLabel');
  const canvases=['gapChart','assetChart'].map(id=>document.getElementById(id)).filter(Boolean);
  if(!canvases.length)return;
  try{
    const token=asset.tokenContractAddress||'';
    const ticker=asset.ticker||'';
    const urls=[token?'/api/candles?token='+encodeURIComponent(token)+'&bar='+encodeURIComponent(bar)+'&limit=72':null,'/api/agent?action=candles&ticker='+encodeURIComponent(ticker)+'&bar='+encodeURIComponent(bar)+'&limit=72'].filter(Boolean);
    let candles=[],source='SNAPSHOT';
    for(const url of urls){
      const r=await fetch(url);
      const j=await r.json();
      candles=(j.candles||[]).filter(c=>[c.open,c.high,c.low,c.close].every(v=>Number.isFinite(Number(v))));
      if(candles.length){source=(j.source||'LIVE')+' · '+String(bar).toUpperCase();break;}
    }
    if(src)src.textContent=source;
    if(label)label.textContent=(ticker||'ASSET')+'/USDT · '+String(bar).toUpperCase()+' · '+source;
    canvases.forEach(canvas=>{
      if(candles.length)drawCandleChart(canvas,candles);
      else{
        const tokenPx=Number(asset.tokenPrice),ref=Number(asset.referencePrice);
        drawLineChart(canvas,Number.isFinite(tokenPx)&&Number.isFinite(ref)?[{y:ref},{y:tokenPx}]:[{y:Number.isFinite(tokenPx)?tokenPx:1}],'#f0b90b');
      }
    });
  }catch(e){
    if(src)src.textContent='UNAVAILABLE';
    if(label)label.textContent=(asset.ticker||'ASSET')+' · chart unavailable';
  }
}
function hookLiveDeskDom(){
  if(!document.querySelector('link[href="/desk-responsive.css"]')){
    const l=document.createElement('link');
    l.rel='stylesheet';
    l.href='/desk-responsive.css';
    document.head.appendChild(l);
  }
  const tape=document.querySelector('.ticker-wrap .ticker');
  if(tape && !tape.id) tape.id='liveGapTape';
  const head=document.querySelector('#radar-section .terminal-head');
  if(head && !document.getElementById('radarPulse')){
    const h2=head.querySelector('h2');
    const small=head.querySelector('small');
    if(h2) h2.textContent='Radar RWA';
    if(small) small.textContent='TOKENIZED STOCKS GAP';
    const pulse=document.createElement('span');
    pulse.id='radarPulse';
    pulse.className='tag live';
    pulse.textContent='LIVE';
    head.appendChild(pulse);
  }
}
let signalTimer=null;
function startLiveSignal(){
  if(signalTimer)return;
  hookLiveDeskDom();
  signalTimer=setInterval(()=>{if(document.hidden)return;if(typeof loadMarket==='function')loadMarket({silent:true});},15000);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden && typeof loadMarket==='function')loadMarket({silent:true})});
startLiveSignal();
(function(){
  [['/desk-live.js?v=rwa1',false],['/desk-onchain.js?v=abc1',false],['/desk-exec.js?v=amt2',false],['/cmc-radar.js?v=rwa1',true],['/desk-parity.js?v=parity1',true]].forEach(([src,defer])=>{
    if(document.querySelector('script[src^="'+src.split('?')[0]+'"]')) return;
    const s=document.createElement('script');
    s.src=src; if(defer) s.defer=true;
    document.head.appendChild(s);
  });
})();
