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
  if(label) label.textContent=rows.length?rows.length+' live divergence signals':'No live signals';
  if(!canvas)return;
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
async function loadAssetChart(asset){
  const src=document.getElementById('assetChartSrc');
  const canvas=document.getElementById('assetChart');
  if(!canvas) return;
  try{
    const token=asset.tokenContractAddress||'';
    const urls=[
      token?'/api/candles?token='+encodeURIComponent(token)+'&bar=1h&limit=72':null,
      '/api/agent?action=candles&ticker='+encodeURIComponent(asset.ticker||'')+'&bar=1h&limit=72'
    ].filter(Boolean);
    let candles=[]; let source='SNAPSHOT';
    for (const url of urls){
      const r=await fetch(url); const j=await r.json();
      candles=(j.candles||[]).filter(c=>Number.isFinite(Number(c.close)));
      if(candles.length){ source=j.source||'LIVE'; break; }
    }
    if(src) src.textContent=source;
    if(candles.length){
      const up=Number(candles[candles.length-1].close)>=Number(candles[0].close);
      drawLineChart(canvas, candles.map(c=>({y:Number(c.close)})), up?'#2fbf8f':'#e8604c');
    } else {
      const tokenPx=Number(asset.tokenPrice), ref=Number(asset.referencePrice);
      drawLineChart(canvas, Number.isFinite(tokenPx)&&Number.isFinite(ref)?[{y:ref},{y:tokenPx}]:[{y:0},{y:1}], '#f0b90b');
    }
  }catch(e){
    if(src) src.textContent='UNAVAILABLE';
  }
}

let signalTimer=null;
function startLiveSignal(){if(signalTimer)return;signalTimer=setInterval(()=>{if(document.hidden)return;loadMarket();},20000)}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadMarket()});
startLiveSignal();
