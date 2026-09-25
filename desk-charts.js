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
  const rows=chartRows().slice(0,12);
  if(label) label.textContent=rows.length?rows.length+' actionable gaps':'No actionable gaps';
  if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const w=canvas.width, h=canvas.height;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#101419'; ctx.fillRect(0,0,w,h);
  if(!rows.length) return;
  const mid=h/2, barW=Math.max(10,(w-24)/rows.length-8);
  const maxAbs=Math.max(...rows.map(x=>Math.abs(Number(x.spreadPct))),0.01);
  rows.forEach((x,i)=>{
    const v=Number(x.spreadPct);
    const bh=Math.max(4,(Math.abs(v)/maxAbs)*(mid-28));
    const x0=16+i*((w-24)/rows.length);
    ctx.fillStyle=v>=0?'#2fbf8f':'#e8604c';
    ctx.fillRect(x0, v>=0?mid-bh:mid, barW, bh);
    ctx.fillStyle='#a79c88';
    ctx.font='10px IBM Plex Mono, monospace';
    ctx.save(); ctx.translate(x0+barW/2,h-8); ctx.rotate(-Math.PI/2); ctx.fillText(String(x.ticker).slice(0,5),0,0); ctx.restore();
  });
  ctx.strokeStyle='#352c1e'; ctx.beginPath(); ctx.moveTo(8,mid); ctx.lineTo(w-8,mid); ctx.stroke();
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
