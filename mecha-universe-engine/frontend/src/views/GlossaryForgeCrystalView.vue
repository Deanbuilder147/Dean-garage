<template>
  <div class="hb-root">
    <header class="hb-head">
      <div>
        <div class="hb-title">词条锻造 · 六边形编排</div>
        <div class="hb-sub">六相流场 · 中心蜂巢 · ROLL 分叉</div>
      </div>
        <span class="hb-sub">⚙ 保存 · ▶ 模拟 · 完整度 <b id="scoreTop" style="color:var(--gold)">0</b>/100</span>
      </header>
    <div class="hb-body">
      <aside class="hb-col">
        <h3>词条库</h3>
        <div class="hb-entries" id="entries"></div>
      </aside>
      <section class="hb-col hb-board-wrap">
        <h3>六段编排 <em style="font-style:normal;font-size:10px;opacity:.7">流变场 · 蜂巢</em></h3>
        <div class="hb-zoom">
          <button id="zin" title="放大">＋</button>
          <span id="zpct">100%</span>
          <button id="zout" title="缩小">－</button>
          <button id="zreset" title="重置">⤢</button>
        </div>
        <svg class="hb-board" id="board" xmlns="http://www.w3.org/2000/svg"></svg>
        <p class="hb-hint">外圈=六段流向（WHEN→IF→ROLL→DO→AFTER→COST）· 中心=蜂巢 · 点相位高亮 / 点原子或枝尾「＋」增改 · 两指拖拽=平移、捏合=缩放</p>
        <div id="skillWarn" class="hb-warn"></div>
        <div id="popAnchor"></div>
      </section>
      <aside class="hb-col">
        <h3>技能说明书 <em style="font-style:normal;font-size:10px;opacity:.7">实时</em></h3>
        <div class="hb-readout" id="readout"></div>
      </aside>
    </div>
  </div>
</template>
<style>
.hb-root{ --gold:#ffb000; --gold-2:#ffd597; --bg:#0a1628; --panel:rgba(14,22,40,.72); --line:rgba(255,176,0,.20); }
.hb-root *{box-sizing:border-box}
.hb-root{margin:0;min-height:100vh;background:radial-gradient(1200px 700px at 50% -10%,#16233c 0%,#0a1628 60%),#0a1628;color:#cfe6ff;font-family:-apple-system,"PingFang SC",system-ui,sans-serif;}
.hb-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 18px;border-radius:14px;margin:14px;background:linear-gradient(180deg,rgba(255,176,0,.10),rgba(10,22,40,.6));border:1px solid rgba(255,176,0,.32);}
.hb-title{font-size:18px;color:#fff;letter-spacing:1px;}
.hb-title small{font-size:11px;color:var(--gold-2);opacity:.7;margin-left:6px;}
.hb-sub{font-size:11.5px;color:var(--gold-2);opacity:.85;}
.hb-body{display:grid;grid-template-columns:200px minmax(420px,1fr) 300px;gap:12px;align-items:start;padding:0 14px 40px;}
.hb-col{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:12px;}
.hb-col h3{font-size:12px;color:var(--gold);margin:0 0 9px;border-bottom:1px solid rgba(255,176,0,.22);padding-bottom:7px;}
.hb-hint{font-size:10.5px;color:#7fa8c8;line-height:1.6;margin:8px 0;text-align:center;}
.hb-zoom{position:absolute;top:34px;right:10px;display:flex;gap:4px;align-items:center;background:rgba(14,22,40,.82);border:1px solid rgba(255,176,0,.28);border-radius:10px;padding:5px 7px;z-index:6;}
.hb-zoom button{width:24px;height:24px;border-radius:6px;border:1px solid rgba(255,176,0,.32);background:#0e1824;color:#ffd597;cursor:pointer;font-size:13px;line-height:1;}
.hb-zoom button:hover{border-color:var(--gold);background:rgba(255,176,0,.15);}
.hb-zoom #zpct{font-size:10px;color:#9fb0c4;min-width:40px;text-align:center;}
.hb-entries{display:flex;flex-direction:column;gap:5px;}
.hb-entry{display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:8px;cursor:pointer;background:rgba(255,255,255,.03);border:1px solid transparent;text-align:left;}
.hb-entry.on{background:rgba(255,176,0,.18);border-color:var(--gold);}
.hb-gem{width:11px;height:13px;flex:none;background:linear-gradient(150deg,var(--gold),#8a5e00);clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);}
.hb-name{font-size:11.5px;flex:1;}
.hb-board-wrap{display:flex;flex-direction:column;align-items:center;position:relative;}
.hb-board{width:100%;max-width:680px;}
.hb-hex{cursor:pointer;transition:filter .18s;}
.hb-hex:hover .hb-hexfill{filter:brightness(1.18);}
.hb-hex.sel .hb-hexfill{stroke:#fff;stroke-width:3;}
.hb-hexlabel{font-size:11px;font-weight:800;text-anchor:middle;fill:#0a1628;pointer-events:none;}
.hb-hexcn{font-size:8px;text-anchor:middle;fill:#0a1620;opacity:.85;pointer-events:none;}
.hb-hexcount{font-size:7.5px;text-anchor:middle;fill:#0a1620;opacity:.75;pointer-events:none;}
.hb-hexrepl{font-size:7px;font-weight:700;text-anchor:middle;fill:#0a1620;opacity:.85;pointer-events:none;}
.hb-atomlabel{font-size:8px;font-weight:700;text-anchor:middle;fill:#0a1620;pointer-events:none;}
.hb-branchlabel{font-size:11px;font-weight:800;text-anchor:middle;fill:#0a1628;pointer-events:none;}
.hb-branchsub{font-size:7px;text-anchor:middle;fill:#0a1620;opacity:.8;pointer-events:none;}
.hb-center-name{font-size:13px;font-weight:800;text-anchor:middle;fill:#fff;pointer-events:none;}
.hb-center-score{font-size:9.5px;text-anchor:middle;fill:var(--gold-2);pointer-events:none;}
.hb-addhex{font-size:16px;font-weight:800;text-anchor:middle;fill:var(--gold-2);pointer-events:none;}
.hb-flowlabel{font-size:10px;font-weight:700;text-anchor:middle;fill:#cfe6ff;pointer-events:none;}
.hb-readout{font-size:10px;color:#9fb0c4;line-height:1.6;background:#0e1824;border:1px solid #2b3a4a;border-radius:8px;padding:9px;margin-top:8px;white-space:pre-wrap;}
.hb-pop{position:absolute;z-index:80;width:240px;background:#0e1824;border:1px solid rgba(255,176,0,.55);border-radius:12px;padding:10px;box-shadow:0 14px 36px rgba(0,0,0,.55);}
.hb-pop.purple{border-color:rgba(160,107,255,.6);}
.hb-pop:after{content:'';position:absolute;width:12px;height:12px;background:#0e1824;border-left:1px solid rgba(255,176,0,.55);border-bottom:1px solid rgba(255,176,0,.55);transform:rotate(45deg);}
.hb-pop.purple:after{border-color:rgba(160,107,255,.6);}
.hb-pop.left:after{right:-7px;top:var(--arrow,20px);transform:rotate(-45deg);}
.hb-pop.right:after{left:-7px;top:var(--arrow,20px);transform:rotate(135deg);}
.hb-pop h4{margin:0 0 8px;font-size:13px;color:#fff;display:flex;align-items:center;gap:8px;}
.hb-pop .dot{width:11px;height:11px;border-radius:3px;}
.hb-pop .x{margin-left:auto;background:none;border:none;color:#9fb0c4;cursor:pointer;font-size:13px;}
.hb-fields{display:grid;grid-template-columns:62px 1fr;gap:6px 7px;align-items:center;}
.hb-fields label{font-size:11px;color:#9fb0c4;}
.hb-fields input,.hb-fields select,.hb-fields textarea{width:100%;background:#0a1322;border:1px solid #2b3a4a;border-radius:6px;color:#dfeaf5;font-size:12px;padding:4px 6px;}
.hb-fields textarea{resize:vertical;min-height:44px;}
.hb-actions{display:flex;gap:6px;margin-top:9px;flex-wrap:wrap;}
.hb-actions button{flex:1;min-width:64px;font-size:11.5px;padding:6px 8px;border-radius:8px;cursor:pointer;border:1px solid #2b3a4a;background:#13243b;color:#e7f0f7;}
.hb-actions button:hover{border-color:var(--gold);background:rgba(255,176,0,.12);}
.hb-actions .del{background:#2a1320;border-color:#5a2233;color:#ffb0b0;}
.hb-actions .del:hover{border-color:#ff6b4a;}
.hb-mini{font-size:10.5px;color:#8aa0b4;margin:6px 0 2px;}
.hb-warn{display:none;margin-top:10px;padding:9px 11px;border-radius:10px;font-size:11px;line-height:1.6;background:rgba(255,138,0,.12);border:1px solid rgba(255,138,0,.5);color:#ffce8a;}
.hb-warn.show{display:block;}
.hb-warn b{color:#fff;}
.hb-warn button{margin-top:8px;font-size:10.5px;padding:4px 9px;border-radius:7px;cursor:pointer;border:1px solid rgba(255,138,0,.6);background:rgba(255,138,0,.18);color:#ffd9a8;}
.hb-warn button:hover{background:rgba(255,138,0,.3);}
</style>
<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
const root = ref(null)
let cleanup = () => {}
onMounted(() => {
const S = 38;
const ORDER = ['WHEN','IF','ROLL','DO','AFTER','COST'];
const PHASES = [
  {key:'IF', cn:'条件门槛', color:'#36c5f0', q:0, r:-1},
  {key:'WHEN', cn:'触发时机', color:'#ffb000', q:-1, r:0},
  {key:'COST', cn:'代价', color:'#ff6b4a', q:-1, r:1},
  {key:'AFTER', cn:'后效', color:'#ff7eb0', q:0, r:1},
  {key:'DO', cn:'效果执行', color:'#37e0a0', q:1, r:0},
  {key:'ROLL', cn:'掷骰判定', color:'#a06bff', q:1, r:-1},
];
const PHASE_CN = Object.fromEntries(PHASES.map(p=>[p.key,p.cn]));
const PHASE_COLOR = Object.fromEntries(PHASES.map(p=>[p.key,p.color]));
const EFFECT_CATALOG = [
  {label:'造成 X 伤害',grp:'dmg'},{label:'伤害加成',grp:'dmg_bonus'},{label:'治疗 Y',grp:'heal'},
  {label:'附加灼烧',grp:'buff'},{label:'击退 1 格',grp:'ctrl'},{label:'命中修正',grp:'acc'},{label:'机动修正',grp:'mob'},
];
const ATOM_CATALOG = {
  WHEN:[{label:'战斗开始时',grp:'trig'},{label:'回合开始时',grp:'trig'},{label:'受到攻击时',grp:'trig'}],
  IF:[{label:'目标为敌方',grp:'cond'},{label:'自身血量>50%',grp:'cond'},{label:'冷却就绪',grp:'cond'}],
  DO:[{label:'造成 X 伤害',grp:'dmg'},{label:'附加灼烧',grp:'buff'},{label:'击退 1 格',grp:'ctrl'},{label:'治疗 Y',grp:'heal'}],
  AFTER:[{label:'回合结束结算',grp:'tick'},{label:'触发连锁',grp:'chain'}],
  COST:[{label:'消耗 2 能量',grp:'cost'},{label:'冷却 1 回合',grp:'cost'}],
};
function mkRoll(sides,aon,segs){ return {sides,aon,segments:segs}; }
const SKILLS = {
  'particle_cannon': {name:'粒子炮', atoms:{
    WHEN:[{label:'战斗开始时',grp:'trig'}], IF:[{label:'目标为敌方',grp:'cond'}],
    DO:[{label:'造成 X 伤害',grp:'dmg'},{label:'附加灼烧',grp:'buff'}],
    AFTER:[], COST:[{label:'消耗 2 能量',grp:'cost'}] },
    roll: mkRoll(6,false,[ {id:'b0',points:[6],color:'#ff6b4a',miss:false,atoms:[{label:'造成 30 伤害',grp:'dmg',side:'u'},{label:'灼烧 2 层',grp:'buff',side:'u'},{label:'击退 1 格',grp:'ctrl',side:'l'}]},
      {id:'b1',points:[1,2,3,4,5],color:'#ffb000',miss:false,atoms:[{label:'造成 8 伤害',grp:'dmg',side:'u'},{label:'附加灼烧',grp:'buff',side:'l'}]} ]) },
  'shield_strike': {name:'盾击', atoms:{
    WHEN:[{label:'格挡成功后',grp:'trig'}], IF:[], DO:[{label:'造成 12 伤害',grp:'dmg'}], AFTER:[{label:'自身获得护盾',grp:'buff'}], COST:[{label:'消耗 1 能量',grp:'cost'}] }, roll: mkRoll(6,false,[]) },
  'sweep': {name:'扫射', atoms:{
    WHEN:[{label:'主动发动',grp:'trig'}], IF:[], DO:[{label:'单体 -2',grp:'dmg'},{label:'范围 -6',grp:'dmg'}], AFTER:[], COST:[] },
    roll: mkRoll(6,false,[ {id:'b0',points:[1,2,3],color:'#a06bff',miss:false,atoms:[{label:'精准单体 -2',grp:'dmg',side:'u'}]},
      {id:'b1',points:[4,5,6],color:'#a06bff',miss:false,atoms:[{label:'范围均摊 -6',grp:'dmg',side:'u'}]} ]) },
};
let curKey='particle_cannon';
let selPhase=null;
const board=document.getElementById('board');
const wrap=document.querySelector('.hb-board-wrap');
const anchor=document.getElementById('popAnchor');
let baseVB={x:0,y:0,w:360,h:400};
let curVB={x:0,y:0,w:360,h:400};
const view={z:1, cx:0, cy:0};
function cellXY(q,r){ return { x:1.5*S*q, y:Math.sqrt(3)*S*(r+q/2) }; }
function hexPoints(cx,cy,s){ const p=[]; for(let i=0;i<6;i++){ const a=Math.PI/180*(60*i-90); p.push((cx+s*Math.cos(a)).toFixed(1)+','+(cy+s*Math.sin(a)).toFixed(1)); } return p.join(' '); }
function short(s,n=4){ s=String(s); return s.length>n? s.slice(0,n-1)+'…': s; }
function getSkill(){ return SKILLS[curKey]; }
function collectNodes(){
  const sk=getSkill();
  const nodes=[];
  const occ=new Map();
  nodes.push({type:'center',x:0,y:0});
  PHASES.forEach(p=>{ const c=cellXY(p.q,p.r); occ.set(K(p.q,p.r),true); nodes.push({type:'phase',phase:p,q:p.q,r:p.r,x:c.x,y:c.y,replaced:false}); });
  const rollReplace = !!(sk.roll && sk.roll.segments.length);
  PHASES.forEach(p=>{
    if(p.key==='ROLL'){
      const roll=sk.roll;
      roll.segments.forEach((s,i)=>{
        const bq=p.q+1+i, br=p.r;
        occ.set(K(bq,br),true);
        const bc=cellXY(bq,br);
        nodes.push({type:'bnode',phase:p,q:bq,r:br,x:bc.x,y:bc.y,seg:s,idx:i});
        const placed={};
        const placeCol=(prefR)=>{ for(let d=1; d<20; d++){ const q=bq, r=br+prefR*d; if(!occ.has(K(q,r))){ occ.set(K(q,r),true); placed[prefR]=cellXY(q,r); return {x:placed[prefR].x,y:placed[prefR].y}; } } return null; };
        let n=0;
        s.atoms.forEach(a=>{ const st=a.side==='l'?1:-1; const pos=placeCol(st); if(pos) nodes.push({type:'batom',phase:p,q:bq,r:br+st*(n+1),x:pos.x,y:pos.y,seg:s,idx:n,atom:a}); n++; });
        ['u','l'].forEach(side=>{ const st=side==='l'?1:-1; const pos=placeCol(st); if(pos) nodes.push({type:'badd',phase:p,q:bq,r:br+st*(n+1),x:pos.x,y:pos.y,seg:s,side:side}); });
      });
      const ti=roll.segments.length, tq=p.q+1+ti, tr=p.r;
      if(!occ.has(K(tq,tr))){ const pt=cellXY(tq,tr); nodes.push({type:'bnew',phase:p,q:tq,r:tr,x:pt.x,y:pt.y}); }
    } else {
      const replaced = rollReplace && (p.key==='DO'||p.key==='AFTER'||p.key==='COST');
      const atoms = replaced? [] : (sk.atoms[p.key]||[]);
      let n=0;
      atoms.forEach(a=>{ const q=p.q*(n+2), r=p.r*(n+2); const pt=cellXY(q,r); occ.set(K(q,r),true); nodes.push({type:'atom',phase:p,q,r,x:pt.x,y:pt.y,idx:n,atom:a}); n++; });
      let aq=p.q*(atoms.length+2), ar=p.r*(atoms.length+2); while(occ.has(K(aq,ar))){ aq+=p.q; ar+=p.r; }
      if(!replaced && !occ.has(K(aq,ar))){ const pt=cellXY(aq,ar); nodes.push({type:'add',phase:p,q:aq,r:ar,x:pt.x,y:pt.y}); }
    }
  });
  return nodes;
}
function renderBoard(){
  const nodes=collectNodes();
  const sk=getSkill();
  let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
  nodes.forEach(c=>{ minX=Math.min(minX,c.x);maxX=Math.max(maxX,c.x);minY=Math.min(minY,c.y);maxY=Math.max(maxY,c.y); });
  const padX=S*1.4, padY=S*1.2;
  const maxDist=Math.max(Math.hypot(maxX,maxY),Math.hypot(minX,minY),Math.hypot(maxX,minY),Math.hypot(minX,maxY));
  const ringR=maxDist+34, hexR=ringR+18, vbPad=ringR+64;
  baseVB={x:-(vbPad),y:-(vbPad),w:vbPad*2,h:vbPad*2};
  const z=view.z;
  curVB={ x: view.cx - baseVB.w/(2*z), y: view.cy - baseVB.h/(2*z), w: baseVB.w/z, h: baseVB.h/z };
  board.setAttribute('viewBox',`${curVB.x} ${curVB.y} ${curVB.w} ${curVB.h}`);
  document.getElementById('zpct').textContent=Math.round(z*100)+'%';
  let defs='<defs>';
  PHASES.forEach(p=>{ defs+=`<radialGradient id="glow_${p.key}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${p.color}" stop-opacity="0.55"/><stop offset="100%" stop-color="${p.color}" stop-opacity="0"/></radialGradient>`; });
  defs+='<marker id="arrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#ffd597"/></marker>';
  defs+='</defs>';
  let field='';
  PHASES.forEach(p=>{ const c=cellXY(p.q,p.r); const ang=Math.atan2(c.y,c.x); const gx=Math.cos(ang)*ringR*0.72, gy=Math.sin(ang)*ringR*0.72;
    field+=`<circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="${(ringR*0.5).toFixed(1)}" fill="url(#glow_${p.key})"><animate attributeName="r" values="${(ringR*0.42).toFixed(1)};${(ringR*0.56).toFixed(1)};${(ringR*0.42).toFixed(1)}" dur="4s" repeatCount="indefinite"/></circle>`; });
  field+=`<polygon points="${hexPoints(0,0,hexR)}" fill="none" stroke="rgba(255,176,0,.28)" stroke-width="2"/>`;
  field+=`<circle cx="0" cy="0" r="${ringR.toFixed(1)}" fill="none" stroke="rgba(255,213,151,.5)" stroke-width="2.5" stroke-dasharray="10 14"><animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="26s" repeatCount="indefinite"/></circle>`;
  const angOf={}; PHASES.forEach(p=>{ const c=cellXY(p.q,p.r); angOf[p.key]=Math.atan2(c.y,c.x); });
  for(let i=0;i<ORDER.length;i++){ const a0=angOf[ORDER[i]], a1=angOf[ORDER[(i+1)%ORDER.length]];
    const x0=Math.cos(a0)*ringR, y0=Math.sin(a0)*ringR, x1=Math.cos(a1)*ringR, y1=Math.sin(a1)*ringR;
    field+=`<path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${ringR.toFixed(1)} ${ringR.toFixed(1)} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="rgba(255,213,151,.35)" stroke-width="1.5" marker-end="url(#arrow)"/>`;
  }
  let conn='';
  PHASES.forEach(p=>{
    const c=cellXY(p.q,p.r);
    if(p.key==='ROLL'){
      const roll=sk.roll; let prevNode={x:c.x,y:c.y};
      roll.segments.forEach((s,i)=>{ const b=nodes.find(n=>n.type==='bnode'&&n.seg===s); conn+=line(prevNode,b,p.color); prevNode=b;
        const uA=nodes.filter(n=>n.type==='batom'&&n.seg===s&&n.side==='u').sort((a,b)=>a.idx-b.idx); let prev=b; uA.forEach(at=>{ conn+=line(prev,at,p.color); prev=at; });
        const uAdd=nodes.find(n=>n.type==='badd'&&n.seg===s&&n.side==='u'); if(uAdd) conn+=line(prev,uAdd,p.color);
        const lA=nodes.filter(n=>n.type==='batom'&&n.seg===s&&n.side==='l').sort((a,b)=>a.idx-b.idx); prev=b; lA.forEach(at=>{ conn+=line(prev,at,p.color); prev=at; });
        const lAdd=nodes.find(n=>n.type==='badd'&&n.seg===s&&n.side==='l'); if(lAdd) conn+=line(prev,lAdd,p.color);
      });
      const tail=nodes.find(n=>n.type==='bnew'); if(tail) conn+=line(prevNode,tail,p.color);
    } else { const atoms=sk.atoms[p.key]||[]; let prev={x:c.x,y:c.y};
      atoms.forEach((a,i)=>{ const pt=cellXY(p.q*(i+2),p.r*(i+2)); conn+=line(prev,{x:pt.x,y:pt.y},p.color); prev={x:pt.x,y:pt.y}; });
      const pt=cellXY(p.q*(atoms.length+2),p.r*(atoms.length+2)); conn+=line(prev,{x:pt.x,y:pt.y},p.color);
    }
  });
  let hex='';
  nodes.forEach(c=>{
    if(c.type==='center'){ const score=computeScore();
      hex+=`<g class="hb-hex"><polygon class="hb-hexfill" points="${hexPoints(0,0,S*0.9)}" fill="#0e1824" stroke="rgba(255,176,0,.6)" stroke-width="2"/>
        <text class="hb-center-name" x="0" y="-4">${sk.name}</text><text class="hb-center-score" x="0" y="13">完整度 ${score}/100</text></g>`;
    } else if(c.type==='phase'){ const n = sk.atoms[c.phase.key]||[];
      const sel=c.phase.key===selPhase?'sel':'';
      if(c.replaced){
        hex+=`<g class="hb-hex ${sel}" data-id="phase:${c.phase.key}" data-x="${c.x.toFixed(1)}" data-y="${c.y.toFixed(1)}" opacity="0.5">
          <polygon class="hb-hexfill" points="${hexPoints(c.x,c.y,S*0.94)}" fill="${c.phase.color}" fill-opacity="0.35" stroke="rgba(10,22,40,.6)" stroke-width="2" stroke-dasharray="4 3"/>
          <text class="hb-hexlabel" x="${c.x}" y="${c.y-5}">${c.phase.key}</text><text class="hb-hexcn" x="${c.x}" y="${c.y+8}">${c.phase.cn}</text>
          <text class="hb-hexrepl" x="${c.x}" y="${c.y+21}">ROLL取代</text></g>`;
      } else {
        hex+=`<g class="hb-hex ${sel}" data-id="phase:${c.phase.key}" data-x="${c.x.toFixed(1)}" data-y="${c.y.toFixed(1)}">
          <polygon class="hb-hexfill" points="${hexPoints(c.x,c.y,S*0.94)}" fill="${c.phase.color}" fill-opacity="0.85" stroke="rgba(10,22,40,.6)" stroke-width="2"/>
          <text class="hb-hexlabel" x="${c.x}" y="${c.y-5}">${c.phase.key}</text><text class="hb-hexcn" x="${c.x}" y="${c.y+8}">${c.phase.cn}</text>
          <text class="hb-hexcount" x="${c.x}" y="${c.y+21}">${n.length}</text></g>`;
      }
    } else if(c.type==='atom'){ const id=`atom:${c.phase.key}#${c.idx}`;
      hex+=`<g class="hb-hex" data-id="${id}" data-x="${c.x.toFixed(1)}" data-y="${c.y.toFixed(1)}"><polygon class="hb-hexfill" points="${hexPoints(c.x,c.y,S*0.88)}" fill="${c.phase.color}" fill-opacity="0.6" stroke="${c.phase.color}" stroke-width="1.5"/>
        <text class="hb-atomlabel" x="${c.x}" y="${c.y+3}">${short(c.atom.label,5)}</text></g>`;
    } else if(c.type==='add'){ const id=`add:${c.phase.key}`;
      hex+=`<g class="hb-hex" data-id="${id}" data-x="${c.x.toFixed(1)}" data-y="${c.y.toFixed(1)}"><polygon class="hb-hexfill" points="${hexPoints(c.x,c.y,S*0.8)}" fill="none" stroke="${c.phase.color}" stroke-opacity="0.7" stroke-width="2" stroke-dasharray="4 3"/>
        <text class="hb-addhex" x="${c.x}" y="${c.y+5}">＋</text></g>`;
    } else if(c.type==='bnode'){
      const label=c.seg.miss?'未命中':(Array.isArray(c.seg.points)?c.seg.points.join(','):c.seg.points);
      const isFirst=c.idx===0; const id=`bnode:${c.seg.id}`;
      hex+=`<g class="hb-hex" data-id="${id}" data-x="${c.x.toFixed(1)}" data-y="${c.y.toFixed(1)}">
        <polygon class="hb-hexfill" points="${hexPoints(c.x,c.y,S*1.0)}" fill="${c.phase.color}" fill-opacity="${c.seg.miss?0.45:0.85}" stroke="rgba(10,22,40,.6)" stroke-width="2"/>
        ${isFirst?`<text class="hb-hexcn" x="${c.x}" y="${c.y-12}" fill="#fff" opacity="0.9">ROLL</text>`:''}
        <text class="hb-branchlabel" x="${c.x}" y="${c.y-2}">${label}</text>
        <text class="hb-branchsub" x="${c.x}" y="${c.y+11}">${c.seg.atoms.length} 原子</text></g>`;
    } else if(c.type==='batom'){ const id=`batom:${c.seg.id}#${c.idx}`;
      hex+=`<g class="hb-hex" data-id="${id}" data-x="${c.x.toFixed(1)}" data-y="${c.y.toFixed(1)}">
        <polygon class="hb-hexfill" points="${hexPoints(c.x,c.y,S*0.86)}" fill="${c.phase.color}" fill-opacity="0.6" stroke="${c.phase.color}" stroke-width="1.5"/>
        <text class="hb-atomlabel" x="${c.x}" y="${c.y+3}">${short(c.atom.label,5)}</text></g>`;
    } else if(c.type==='badd'){ const id=`badd:${c.seg.id}:${c.side}`;
      hex+=`<g class="hb-hex" data-id="${id}" data-x="${c.x.toFixed(1)}" data-y="${c.y.toFixed(1)}">
        <polygon class="hb-hexfill" points="${hexPoints(c.x,c.y,S*0.78)}" fill="none" stroke="${c.phase.color}" stroke-opacity="0.8" stroke-width="2" stroke-dasharray="4 3"/>
        <text class="hb-addhex" x="${c.x}" y="${c.y+5}">＋</text></g>`;
    } else if(c.type==='bnew'){ const id=`bnew:`;
      hex+=`<g class="hb-hex" data-id="${id}" data-x="${c.x.toFixed(1)}" data-y="${c.y.toFixed(1)}">
        <polygon class="hb-hexfill" points="${hexPoints(c.x,c.y,S*0.96)}" fill="none" stroke="#a06bff" stroke-opacity="0.85" stroke-width="2" stroke-dasharray="4 3"/>
        <text class="hb-addhex" x="${c.x}" y="${c.y+5}">＋</text></g>`;
    }
  });
  let labels=''; PHASES.forEach(p=>{ const c=cellXY(p.q,p.r); const ang=Math.atan2(c.y,c.x); const lx=Math.cos(ang)*(ringR+34), ly=Math.sin(ang)*(ringR+34);
    labels+=`<text class="hb-flowlabel" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="${p.color}">${p.key}</text>`; });
  board.innerHTML = defs + `<g opacity="0.95">${field}</g>` + `<g>${conn}</g>` + `<g>${hex}</g>` + `<g>${labels}</g>`;
  board.querySelectorAll('.hb-hex').forEach(g=>g.addEventListener('click',ev=>{ ev.stopPropagation(); if(window.__panMoved){window.__panMoved=false;return;} onHexClick(g.dataset.id); }));
  document.getElementById('scoreTop').textContent=computeScore();
  renderWarn();
}
function line(a,b,color){ return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${color}" stroke-opacity="0.4" stroke-width="2"/>`; }
function onHexClick(id){
  const [type,rest]=id.split(':');
  if(type==='phase'){
    if((rest==='DO'||rest==='AFTER'||rest==='COST') && !!(getSkill().roll?.segments?.length)) return;
    selPhase=rest; renderBoard();
    if(rest==='ROLL') focusRollView(); else resetView();
  }
  else if(type==='add'){ openAdd(rest); }
  else if(type==='atom'){ const [pk,idx]=rest.split('#'); openAtom(pk,+idx); }
  else if(type==='bnode'){ openBranch(rest); focusRollView(); }
  else if(type==='batom'){ const [sid,idx]=rest.split('#'); openRAtom(sid,+idx); focusRollView(); }
  else if(type==='badd'){ const [sid,side]=rest.split('#'); openRAdd(sid,side); focusRollView(); }
  else if(type==='bnew'){ addRollBranch(); focusRollView(); }
}
function viewBoxToScreen(vx,vy){ const sr=board.getBoundingClientRect(),wr=wrap.getBoundingClientRect(); const sx=sr.width/curVB.w,sy=sr.height/curVB.h; return {x:sr.left-wr.left+(vx-curVB.x)*sx,y:sr.top-wr.top+(vy-curVB.y)*sy}; }
function positionPop(pop,id){
  const el=document.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if(!el){ anchor.innerHTML=''; return; }
  const d=el.getBoundingClientRect(), wr=wrap.getBoundingClientRect();
  const vx=+el.dataset.x, vy=+el.dataset.y;
  const sc=viewBoxToScreen(vx,vy);
  const left=sc.x, top=sc.y;
  const pw=pop.offsetWidth||240, ph=pop.offsetHeight||140;
  pop.style.left=Math.max(8,Math.min(left, wr.width-pw-8))+'px';
  pop.style.top=Math.max(8, top+20)+'px';
  pop.style.setProperty('--arrow', Math.max(14, Math.min(top, ph-14))+'px');
}
function closePopover(){ anchor.innerHTML=''; selPhase=null; resetView(); renderBoard(); }
const docClick=(e)=>{ if(anchor.firstElementChild && !anchor.contains(e.target) && !e.target.closest('.hb-hex')) closePopover(); };
document.addEventListener('click', docClick);
function openAdd(phase){
  const cat=(ATOM_CATALOG[phase]||EFFECT_CATALOG).map(e=>`<option value="${e.grp}">${e.label} · ${e.grp}</option>`).join('');
  anchor.innerHTML=`<div class="hb-pop" style="--arrow:20px"><h4><span class="dot" style="background:${PHASE_COLOR[phase]}"></span>${phase} · 新增原子<button class="x">✕</button></h4>
    <div class="hb-fields"><label>标签</label><input id="f_label" placeholder="效果文字"/>
      <label>类型</label><select id="f_grp">${cat}</select></div>
    <div class="hb-actions"><button id="f_save">添加</button></div></div>`;
  anchor.querySelector('.x').onclick=closePopover;
  anchor.querySelector('#f_save').onclick=()=>{ const label=anchor.querySelector('#f_label').value.trim(); const grp=anchor.querySelector('#f_grp').value; if(!label) return;
    getSkill().atoms[phase].push({label,grp}); closePopover(); renderBoard(); renderReadout(); };
  positionPop(anchor.firstElementChild, `add:${phase}`);
}
function openAtom(phase,idx){
  const a=getSkill().atoms[phase][idx];
  const cat=(ATOM_CATALOG[phase]||EFFECT_CATALOG).map(e=>`<option value="${e.grp}" ${e.grp===a.grp?'selected':''}>${e.label} · ${e.grp}</option>`).join('');
  anchor.innerHTML=`<div class="hb-pop" style="--arrow:20px"><h4><span class="dot" style="background:${PHASE_COLOR[phase]}"></span>${phase} · 原子<button class="x">✕</button></h4>
    <div class="hb-fields"><label>标签</label><input id="f_label" value="${a.label}"/>
      <label>类型</label><select id="f_grp">${cat}</select></div>
    <div class="hb-actions"><button id="f_save">保存</button><button class="del" id="f_del">删除</button></div></div>`;
  anchor.querySelector('.x').onclick=closePopover;
  anchor.querySelector('#f_save').onclick=()=>{ const label=anchor.querySelector('#f_label').value.trim(); const grp=anchor.querySelector('#f_grp').value; if(!label) return;
    a.label=label; a.grp=grp; closePopover(); renderBoard(); renderReadout(); };
  anchor.querySelector('#f_del').onclick=()=>{ getSkill().atoms[phase].splice(idx,1); closePopover(); renderBoard(); renderReadout(); };
  positionPop(anchor.firstElementChild, `atom:${phase}#${idx}`);
}
function openRollHub(){
  const r=getSkill().roll;
  anchor.innerHTML=`<div class="hb-pop purple" style="--arrow:20px"><h4><span class="dot" style="background:#a06bff"></span>ROLL · 掷骰判定<button class="x">✕</button></h4>
    <div class="hb-fields"><label>骰面数</label><input id="f_sides" type="number" min="2" max="100" value="${r.sides}"/>
      <label>判定点</label><input id="f_aon" value="${r.aon||''}" placeholder="如 6 或 4+"/></div>
    <p class="hb-mini">ROLL 取代式：命中分支后，主干 DO / AFTER / COST 被整段跳过。</p>
    <div class="hb-actions"><button id="f_save">保存</button></div></div>`;
  anchor.querySelector('.x').onclick=closePopover;
  anchor.querySelector('#f_save').onclick=()=>{ r.sides=+anchor.querySelector('#f_sides').value||6; r.aon=anchor.querySelector('#f_aon').value.trim(); closePopover(); renderBoard(); };
  positionPop(anchor.firstElementChild, `phase:ROLL`);
}
function openBranch(segId){
  const seg=getSkill().roll.segments.find(s=>s.id===segId);
  anchor.innerHTML=`<div class="hb-pop purple" style="--arrow:20px"><h4><span class="dot" style="background:#a06bff"></span>ROLL 分支<button class="x">✕</button></h4>
    <div class="hb-fields"><label>骰点</label><input id="f_points" value="${(seg.points||[]).join(',')}" placeholder="如 6 或 4,5,6"/>
      <label>未命中</label><select id="f_miss"><option value="0" ${!seg.miss?'selected':''}>否</option><option value="1" ${seg.miss?'selected':''}>是</option></select></div>
    <p class="hb-mini">分支下原子可分别放在上柱 / 下柱（side=u/l）。</p>
    <div class="hb-actions"><button id="f_save">保存</button><button class="del" id="f_del">删除分支</button></div></div>`;
  anchor.querySelector('.x').onclick=closePopover;
  anchor.querySelector('#f_save').onclick=()=>{ const p=anchor.querySelector('#f_points').value.split(',').map(s=>s.trim()).filter(Boolean); seg.points=p; seg.miss=anchor.querySelector('#f_miss').value==='1'; closePopover(); renderBoard(); renderReadout(); };
  anchor.querySelector('#f_del').onclick=()=>{ const arr=getSkill().roll.segments; arr.splice(arr.indexOf(seg),1); closePopover(); renderBoard(); renderReadout(); };
  positionPop(anchor.firstElementChild, `bnode:${segId}`);
}
function openRAdd(segId,side){
  const seg=getSkill().roll.segments.find(s=>s.id===segId);
  const cat=EFFECT_CATALOG.map(e=>`<option value="${e.grp}">${e.label} · ${e.grp}</option>`).join('');
  anchor.innerHTML=`<div class="hb-pop purple" style="--arrow:20px"><h4><span class="dot" style="background:#a06bff"></span>分支原子（${side==='l'?'下柱':'上柱'}）<button class="x">✕</button></h4>
    <div class="hb-fields"><label>标签</label><input id="f_label" placeholder="效果文字"/>
      <label>类型</label><select id="f_grp">${cat}</select></div>
    <div class="hb-actions"><button id="f_save">添加</button></div></div>`;
  anchor.querySelector('.x').onclick=closePopover;
  anchor.querySelector('#f_save').onclick=()=>{ const label=anchor.querySelector('#f_label').value.trim(); const grp=anchor.querySelector('#f_grp').value; if(!label) return;
    seg.atoms.push({label,grp,side}); closePopover(); renderBoard(); renderReadout(); };
  positionPop(anchor.firstElementChild, `badd:${segId}:${side}`);
}
function openRAtom(segId,idx){
  const seg=getSkill().roll.segments.find(s=>s.id===segId); const a=seg.atoms[idx];
  const cat=EFFECT_CATALOG.map(e=>`<option value="${e.grp}" ${e.grp===a.grp?'selected':''}>${e.label} · ${e.grp}</option>`).join('');
  anchor.innerHTML=`<div class="hb-pop purple" style="--arrow:20px"><h4><span class="dot" style="background:#a06bff"></span>分支原子<button class="x">✕</button></h4>
    <div class="hb-fields"><label>标签</label><input id="f_label" value="${a.label}"/>
      <label>类型</label><select id="f_grp">${cat}</select>
      <label>位置</label><select id="f_side"><option value="u" ${a.side!=='l'?'selected':''}>上柱</option><option value="l" ${a.side==='l'?'selected':''}>下柱</option></select></div>
    <div class="hb-actions"><button id="f_save">保存</button><button class="del" id="f_del">删除</button></div></div>`;
  anchor.querySelector('.x').onclick=closePopover;
  anchor.querySelector('#f_save').onclick=()=>{ const label=anchor.querySelector('#f_label').value.trim(); const grp=anchor.querySelector('#f_grp').value; if(!label) return;
    a.label=label; a.grp=grp; a.side=anchor.querySelector('#f_side').value; closePopover(); renderBoard(); renderReadout(); };
  anchor.querySelector('#f_del').onclick=()=>{ seg.atoms.splice(idx,1); closePopover(); renderBoard(); renderReadout(); };
  positionPop(anchor.firstElementChild, `batom:${segId}#${idx}`);
}
function addRollBranch(){
  const r=getSkill().roll; const id='b'+(Date.now()%100000);
  r.segments.push({id,points:[r.segments.length+1],color:'#a06bff',miss:false,atoms:[]});
}
function computeScore(){
  const sk=getSkill(); let s=0;
  ['WHEN','IF','DO','AFTER','COST'].forEach(k=>{ s+=Math.min(20,(sk.atoms[k]||[]).length*4); });
  s+=Math.min(20, (sk.roll?.segments||[]).length*9);
  return Math.min(100,Math.round(s));
}
function renderEntries(){
  const wrap=document.getElementById('entries');
  wrap.innerHTML=Object.entries(SKILLS).map(([k,v])=>`<button class="hb-entry ${k===curKey?'on':''}" data-k="${k}"><span class="hb-gem"></span><span class="hb-name">${v.name}</span></button>`).join('');
  wrap.querySelectorAll('.hb-entry').forEach(b=>b.onclick=()=>{ curKey=b.dataset.k; closePopover(); renderEntries(); renderBoard(); renderReadout(); });
}
function renderReadout(){
  const sk=getSkill(); let out='【'+sk.name+'】\n';
  const order=ORDER;
  order.forEach(k=>{ const p=PHASES.find(x=>x.key===k); out+=`\n◆ ${k} · ${p.cn}\n`;
    if(k==='ROLL'){ (sk.roll?.segments||[]).forEach(s=>{ const pts=Array.isArray(s.points)?s.points.join('/'):s.points; const atoms=s.atoms.map(a=>`${a.label}[${a.grp}]`).join('、')||'（无）'; out+=`   · ${pts}${s.miss?'（未命中）':''}：${atoms}\n`; }); }
    else { const a=sk.atoms[k]||[]; out+= a.length? a.map(x=>`   · ${x.label}[${x.grp}]`).join('\n')+'\n' : '   · （空）\n'; }
  });
  out+=`\n完整度：${computeScore()}/100`;
  document.getElementById('readout').textContent=out;
}
function validateSkill(sk){
  const warns=[];
  const rollActive=!!(sk.roll&&sk.roll.segments&&sk.roll.segments.length);
  if(rollActive){
    ['DO','AFTER','COST'].forEach(k=>{ if((sk.atoms[k]||[]).length) warns.push(k); });
    if(sk.roll.segments.length<2) warns.push('BRANCHES');
  }
  return warns;
}
function renderWarn(){
  const sk=getSkill(); const w=validateSkill(sk);
  const el=document.getElementById('skillWarn');
  if(!w.length){ el.className='hb-warn'; el.innerHTML=''; return; }
  const stray=w.filter(x=>x!=='BRANCHES');
  let msg='';
  if(stray.length) msg+=`⚠ ROLL 取代式冲突：ROLL 已配置分支，但主干 ${stray.join(' / ')} 仍含原子。引擎命中分支时会静默丢弃主干效果，应清空。`;
  if(w.includes('BRANCHES')) msg+=`⚠ ROLL 非空时走向应至少 2 种（当前仅 ${sk.roll.segments.length} 个分支）。`;
  el.innerHTML=`<div>${msg}</div>`+(stray.length?`<button id="fixWarn">一键清空主干 ${stray.join('/')}</button>`:'');
  el.className='hb-warn show';
  const fb=el.querySelector('#fixWarn');
  if(fb) fb.onclick=()=>{ stray.forEach(k=>{ getSkill().atoms[k]=[]; }); closePopover(); renderBoard(); renderReadout(); };
}
renderEntries(); renderBoard(); renderReadout();
let animating=false;
function animateView(targetZ,targetCX,targetCY,duration=420){
  if(animating){ animating=false; }
  const startZ=view.z,startCX=view.cx,startCY=view.cy;
  const t0=performance.now(); animating=true;
  function step(t){ if(!animating) return; const p=Math.min(1,(t-t0)/duration); const e=p*(2-p);
    view.z=startZ+(targetZ-startZ)*e; view.cx=startCX+(targetCX-startCX)*e; view.cy=startCY+(targetCY-startCY)*e;
    renderBoard(); if(p<1) requestAnimationFrame(step); else animating=false; }
  requestAnimationFrame(step);
}
function focusRollView(){ const z=2.44; const padX=0.20, padY=0.20; const vw=baseVB.w/z, vh=baseVB.h/z; const vx=-padX*vw; const vy=-(1-padY)*vh; animateView(z, vx+vw/2, vy+vh/2); }
function resetView(){ animateView(1,0,0); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function applyZoom(factor, clientX, clientY){
  const rect=board.getBoundingClientRect();
  const mx=clientX-rect.left, my=clientY-rect.top;
  const vxBefore=curVB.x+(mx/rect.width)*curVB.w;
  const vyBefore=curVB.y+(my/rect.height)*curVB.h;
  view.z=clamp(view.z*factor,0.6,4);
  const vw=baseVB.w/view.z, vh=baseVB.h/view.z;
  view.cx=vxBefore-(mx/rect.width)*vw+vw/2;
  view.cy=vyBefore-(my/rect.height)*vh+vh/2;
  renderBoard();
}
document.getElementById('zin').onclick=()=>{ view.z=clamp(view.z*1.2,0.6,4); renderBoard(); };
document.getElementById('zout').onclick=()=>{ view.z=clamp(view.z/1.2,0.6,4); renderBoard(); };
document.getElementById('zreset').onclick=()=>{ resetView(); };
board.addEventListener('wheel',e=>{ e.preventDefault(); animating=false;
  const rect=board.getBoundingClientRect();
  if(e.ctrlKey){ applyZoom(e.deltaY<0?1.15:1/1.15, e.clientX, e.clientY); }
  else { view.cx -= e.deltaX/rect.width*curVB.w; view.cy -= e.deltaY/rect.height*curVB.h; renderBoard(); }
},{passive:false});
let dragging=false;
board.addEventListener('mousedown',e=>{ dragging=true; animating=false; window.__panMoved=false; board._lp={x:e.clientX,y:e.clientY}; });
const winMove=(e)=>{ if(!dragging) return; const dx=e.clientX-board._lp.x, dy=e.clientY-board._lp.y; board._lp={x:e.clientX,y:e.clientY}; if(Math.abs(dx)+Math.abs(dy)>4) window.__panMoved=true; const rect=board.getBoundingClientRect(); view.cx-=dx/rect.width*curVB.w; view.cy-=dy/rect.height*curVB.h; renderBoard(); };
const winUp=()=>{ dragging=false; board._lp=null; };
window.addEventListener('mousemove', winMove);
window.addEventListener('mouseup', winUp);

cleanup=()=>{ document.removeEventListener('click',docClick); window.removeEventListener('mousemove',winMove); window.removeEventListener('mouseup',winUp); };
});
onUnmounted(()=>cleanup());
</script>