/* Live scanner panel (read-only). Data: https://174-138-87-89.sslip.io/scanner.json every 8s; fallback = last snapshot (localStorage / gist). */
(function(){
const LIVE="https://174-138-87-89.sslip.io/scanner.json", GIST_RAW="https://gist.githubusercontent.com/5ynwbg9yry-bit/7375a3557765665cd76ee433388403e3/raw/scanner.json", POLL=8000, LS="kalshi_scanner_last", TZ="America/New_York";
const card=document.getElementById("scanner-card"); if(!card) return;
const $=s=>card.querySelector(s); let snap=null, live=false, chart=null, cs=null, tl=null, segS={}, first=true, lastOk=0, busy=false;
const tzOff=()=>{const d=new Date();const f=new Date(d.toLocaleString("en-US",{timeZone:TZ}));return Math.round((f-new Date(d.toLocaleString("en-US",{timeZone:"UTC"})))/1000)};
const OFF=tzOff();
const tm=t=>new Date(t*1000).toLocaleTimeString("en-US",{timeZone:TZ,hour:"numeric",minute:"2-digit",second:"2-digit"});
const tmS=t=>new Date(t*1000).toLocaleTimeString("en-US",{timeZone:TZ,hour:"numeric",minute:"2-digit"});
const c$=x=>x==null?"--":Math.round(x*100)+"¢", n0=x=>x==null?"--":Number(x).toLocaleString("en-US",{maximumFractionDigits:0}), esc=s=>String(s??"").replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]));
const pill=(t,cls)=>`<span class="pill ${cls||""}">${esc(t)}</span>`;
card.innerHTML=`<h2>Live scanner · BTC 15-minute <span id="sc-age">connecting…</span></h2>
<div id="sc-banner" class="hidden" style="margin:0 0 10px;padding:8px 10px;border-radius:8px;background:var(--ybg);color:var(--yel);font-size:13px"></div>
<div id="sc-head" style="display:flex;gap:8px 14px;flex-wrap:wrap;align-items:center;margin-bottom:8px"></div>
<div id="sc-why" class="sub" style="margin-bottom:10px"></div>
<div id="sc-chart" style="height:340px;width:100%"></div>
<div class="sub" style="margin:6px 0 14px"><b style="color:#c2410c">━</b> resistance &nbsp;<b style="color:#1f8a4c">━</b> support &nbsp;<b style="color:#d4a017">━</b> TRAMA 15 &nbsp;▲/▼ volume-confirmed break (LuxAlgo defaults) &nbsp;● wick / low-volume (not valid)</div>
<div id="sc-nums" class="grid" style="margin-top:0"></div>
<div id="sc-mkt" style="margin-top:16px"></div>
<div id="sc-setups" style="margin-top:16px"></div>
<div id="sc-pos" style="margin-top:16px"></div>
<h2 style="margin-top:18px">Recent scanner decisions <span>state changes only</span></h2><div class="feed" id="sc-feed"></div>
<div class="sub" id="sc-foot" style="margin-top:10px"></div>`;
function ensureChart(){
  if(chart||!window.LightweightCharts) return !!chart;
  const dark=matchMedia("(prefers-color-scheme:dark)").matches, cssv=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  chart=LightweightCharts.createChart($("#sc-chart"),{autoSize:true,layout:{background:{color:"transparent"},textColor:cssv("--dim")||"#76746d"},grid:{vertLines:{color:cssv("--line")},horzLines:{color:cssv("--line")}},
    timeScale:{timeVisible:true,secondsVisible:false,borderColor:cssv("--line")},rightPriceScale:{borderColor:cssv("--line")},crosshair:{mode:0}});
  cs=chart.addCandlestickSeries({upColor:"#1f8a4c",downColor:"#c2410c",borderVisible:false,wickUpColor:"#1f8a4c",wickDownColor:"#c2410c"});
  tl=chart.addLineSeries({color:"#d4a017",lineWidth:2,priceLineVisible:false,lastValueVisible:true,title:"TRAMA15"});
  return true;
}
function drawChart(d){
  if(!ensureChart()){ $("#sc-chart").innerHTML='<div class="muted" style="padding:40px;text-align:center">chart library did not load (offline?) - numbers below are still live</div>'; return; }
  const ch=d.chart, T=t=>t+OFF;
  cs.setData(ch.candles.map(x=>({time:T(x.t),open:x.o,high:x.h,low:x.l,close:x.c})));
  tl.setData(ch.trama.map(x=>({time:T(x.t),value:x.v})));
  const mk=ch.marks.map(m=>{const up=m.kind.startsWith("up")||m.kind==="bull_wick", real=m.kind==="up"||m.kind==="down", wick=m.kind.endsWith("wick");
    return {time:T(m.t),position:up?"belowBar":"aboveBar",color:real?(up?"#1f8a4c":"#c2410c"):"#9a9890",shape:real?(up?"arrowUp":"arrowDown"):"circle",text:real?"B":(wick?"W":"b")}}).sort((a,b)=>a.time-b.time);
  cs.setMarkers(mk);
  const keep={};
  ch.segs.forEach(s=>{const k=s.kind+s.t0; keep[k]=1; let ls=segS[k];
    if(!ls){ls=segS[k]=chart.addLineSeries({color:s.kind==="res"?"#c2410c":"#1f8a4c",lineWidth:s.cur?2:1,lineStyle:s.cur?0:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false,autoscaleInfoProvider:()=>null})}
    const t1=Math.max(s.t1,s.t0+900); ls.setData([{time:T(s.t0),value:s.v},{time:T(Math.min(t1,ch.candles[ch.candles.length-1].t)),value:s.v}]);});
  Object.keys(segS).forEach(k=>{if(!keep[k]){chart.removeSeries(segS[k]);delete segS[k]}});
  if(first){chart.timeScale().setVisibleLogicalRange({from:Math.max(0,ch.candles.length-48),to:ch.candles.length+3});first=false}
}
const SC={TRIGGERED:"pos",PENDING:"warn",WATCHING:"",off:""};
function render(){
  const d=snap; if(!d||!d.ts){return}
  const r=d.regime, a=d.setups.find(s=>s.active&&["TRIGGERED","PENDING"].includes(s.state))||d.setups.find(s=>s.active);
  $("#sc-head").innerHTML=pill((r.regime==="trending"?"TRENDING "+(r.direction==="up"?"▲":"▼"):"RANGING"),r.regime==="trending"?"pos":"warn")+
    `<span style="font-size:22px;font-weight:650;font-variant-numeric:tabular-nums">$${n0(d.price)}</span>`+
    `<span class="sub">TRAMA15 $${n0(d.trama_now)} (${d.price_vs_trama>=0?"+":""}${n0(d.price_vs_trama)}, price ${d.price_vs_trama>=0?"above":"below"})</span>`+
    (a?pill((a.name.split(" (")[0])+": "+a.state+(a.side?" → buy "+a.side:""),SC[a.state]):pill("no setup armed"));
  $("#sc-why").textContent="Why "+r.regime+": "+r.why+(d.rules?.note?"  ·  ("+d.rules.note+")":"");
  const rs=d.dist.res, sp=d.dist.sup, bg=d.big, fp=d.forming_pct_of_trigger;
  const kv=(k,v,s)=>`<div class="kv"><div class="k">${k}</div><div class="v">${v}</div>${s?`<div class="sub">${s}</div>`:""}</div>`;
  $("#sc-nums").innerHTML=kv("Resistance",rs?"$"+n0(rs.level):"--",rs?`${rs.usd>=0?"$"+n0(rs.usd)+" above price":"price is $"+n0(-rs.usd)+" through it"} · ${rs.bp}bp · ${rs.atr} ATR`:"")+
    kv("Support",sp?"$"+n0(sp.level):"--",sp?`${sp.usd>=0?"$"+n0(sp.usd)+" below price":"price is $"+n0(-sp.usd)+" through it"} · ${sp.bp}bp · ${sp.atr} ATR`:"")+
    kv("Big-candle trigger",`${bg.ratio.toFixed(1)}× / 2.0×`,`last closed body $${n0(Math.abs(bg.body))} vs trigger $${n0(bg.thr)}`+(fp!=null?` · forming candle at ${fp}% of trigger`:""))+
    kv("Volume osc (need >20)",d.volosc,"LuxAlgo vol EMA5/EMA10 on last closed bar");
  const m=d.market, g=d.gate;
  if(m){const cap=d.cap*100, row=(lab,bid,ask)=>{const over=ask!=null&&ask*100>cap;return `<div class="wb" style="grid-template-columns:70px 1fr 150px"><span>${lab}</span><div class="t" style="height:14px"><i style="left:0;width:${Math.round((ask||0)*100)}%;background:${over?"var(--red)":"var(--accent)"};opacity:.55"></i><em style="left:${cap}%;width:2px;background:var(--txt)" title="75¢ cap"></em></div><span>bid ${c$(bid)} · ask <b class="${over?"dn":""}">${c$(ask)}</b>${over?" ✕":""}</span></div>`};
    $("#sc-mkt").innerHTML=`<h2>Kalshi BTC market <span>strike $${n0(m.strike)} · closes ${tmS(m.close_ts)} ET · <b id="sc-left"></b> left</span></h2>`+row("YES",m.yes_bid,m.yes_ask)+row("NO",m.no_bid,m.no_ask)+
      `<div class="sub" style="margin-top:6px">black tick = ${cap}¢ buy cap · no entries in the last ${d.no_entry_last_s}s · entry gate: `+(g.ok?`<b class="up">OPEN - would buy ${g.side} at ${c$(g.ask)}</b>`:`<b>blocked</b> - ${esc(g.reasons.join("; "))}`)+`</div>`}
  else $("#sc-mkt").innerHTML='<div class="muted">Kalshi market not available right now</div>';
  $("#sc-setups").innerHTML=`<h2>Setups <span>armed = matches the current regime</span></h2>`+d.setups.map(s=>`<div style="padding:8px 0;border-bottom:1px solid var(--line)"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b>${esc(s.name)}</b>${pill(s.state+(s.side?" → "+s.side:""),SC[s.state])}${s.active?pill("armed","pos"):""}</div><div class="sub">${esc(s.detail)}</div></div>`).join("");
  $("#sc-pos").innerHTML=`<h2>Open positions <span>cash-out 90¢ (95¢ when confident) · TRAMA exit</span></h2>`+(d.positions.length?`<div class="scroll"><table><thead><tr><th>Market</th><th>Strategy</th><th>Side</th><th class="r">Entry</th><th class="r">Qty</th><th class="r">Bid now</th><th>Cash-out</th><th>Early exit</th></tr></thead><tbody>${d.positions.map(p=>`<tr><td>${esc(p.ticker.replace("KX","").replace("15M-26",""))}</td><td>${esc(p.strategy)}</td><td>${esc(p.side.toUpperCase())}</td><td class="r">${c$(p.entry)}</td><td class="r">${(+p.count).toFixed(1)}</td><td class="r">${c$(p.bid)}</td><td>90¢ / 95¢</td><td>${esc(p.trama_exit)}${p.trama_against?" "+pill("TRAMA against","neg"):""}${p.settling?" "+pill("settling"):""}</td></tr>`).join("")}</tbody></table></div>`:'<div class="muted">No open position. The bot is flat and scanning.</div>');
  $("#sc-feed").innerHTML=(d.events||[]).slice(0,12).map(e=>`<div class="it"><div class="h"><span class="tag ${e.kind==="gate"&&/ALLOWED/.test(e.text)?"win":e.kind==="gate"?"warn":""}">${esc(e.kind)}</span><span class="t">${esc(e.text)}</span><span class="tm">${tm(e.ts)}</span></div></div>`).join("")||'<div class="muted">no decisions logged yet</div>';
  $("#sc-foot").textContent="Read-only: this panel and its server use public market data only and place no orders. Candles are Coinbase BTC-USD (Kalshi settles on CF Benchmarks, so the two can differ by a few dollars). Signals are what the chart rules WOULD do - no live chart trader is enabled yet.";
  drawChart(d); tick();
}
function tick(){
  if(!snap||!snap.ts) return; const now=Date.now()/1000, age=now-snap.ts;
  const st=live&&age<30; $("#sc-age").innerHTML=(st?'<b class="up">● live</b> ':'<b style="color:var(--yel)">● snapshot</b> ')+`updated ${tm(snap.ts)} ET (${Math.max(0,Math.round(age))}s ago) · refresh ~8s`;
  const b=$("#sc-banner"); if(!st){b.classList.remove("hidden");b.textContent=live?"Live feed is slow - data is "+Math.round(age)+"s old.":"Live feed unreachable - showing the last saved snapshot from "+tm(snap.ts)+" ET ("+Math.round(age/60)+" min ago)."}else b.classList.add("hidden");
  const l=$("#sc-left"); if(l&&snap.window){const s=Math.max(0,Math.round(snap.window.close_ts-now));l.textContent=Math.floor(s/60)+":"+String(s%60).padStart(2,"0")}
}
async function pull(url,ms){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url+(url.includes("?")?"&":"?")+"cb="+Date.now(),{cache:"no-store",signal:c.signal});if(!r.ok)throw 0;return await r.json()}finally{clearTimeout(t)}}
async function poll(){
  if(busy||document.hidden) return; busy=true;
  try{const d=await pull(LIVE,7000); if(!d.ok&&!d.ts) throw 0; snap=d; live=!!d.ok; lastOk=Date.now(); try{localStorage.setItem(LS,JSON.stringify(d))}catch(e){} render()}
  catch(e){live=false;
    if(!snap){try{snap=JSON.parse(localStorage.getItem(LS)||"null")}catch(_){} }
    if(!snap){try{snap=await pull(GIST_RAW,8000)}catch(_){} }
    if(snap) render(); else $("#sc-age").textContent="live feed unreachable and no saved snapshot yet"; }
  busy=false;
}
poll(); setInterval(poll,POLL); setInterval(tick,1000); document.addEventListener("visibilitychange",()=>{if(!document.hidden)poll()});
})();
