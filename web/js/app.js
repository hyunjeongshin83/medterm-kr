
(function(){
'use strict';
const mt = new MedTermCore.MedTerm(window.MEDTERM_DATA, window.MEDTERM_CLASSES);
const $ = (s, r=document) => r.querySelector(s), $$ = (s, r=document) => [...r.querySelectorAll(s)];
function el(tag, attrs={}, ...kids){ const e=document.createElement(tag); for(const [k,v] of Object.entries(attrs)){ if(k==='class')e.className=v; else if(k==='text')e.textContent=v; else if(k.startsWith('on'))e.addEventListener(k.slice(2),v); else e.setAttribute(k,v);} kids.flat().forEach(c=>e.append(c&&c.nodeType?c:document.createTextNode(c==null?'':c))); return e; }

// ---- 탭 ----
$$('nav button').forEach(b=>b.addEventListener('click',()=>{ $$('nav button').forEach(x=>x.setAttribute('aria-selected',x===b)); $$('main > section').forEach(s=>s.hidden = s.id!=='tab-'+b.dataset.tab); }));

// ---- 사전 검색 ----
const statusBadge = v => el('span',{class:'badge '+(v.review_status==='draft'?'draft':''),text:v.review_status==='draft'?'초안·약사 검수 전':'자동 수집'});
function renderHits(list){
  const box=$('#hits'); box.replaceChildren();
  if(!list.length){ box.append(el('div',{class:'card mut',text:'사전에 없습니다. (이 사전은 현재 '+mt.vtms.length+'개 성분만 수록 — 없다고 해서 존재하지 않는 약이라는 뜻은 아닙니다.)'})); return; }
  list.slice(0,12).forEach(h=>{ const v=h.vtm;
    box.append(el('div',{class:'hit',tabindex:'0',onclick:()=>selectVtm(v.id),onkeydown:e=>{if(e.key==='Enter')selectVtm(v.id)}},
      el('b',{text:v.label_ko}),' ',el('span',{class:'mut',text:v.label_en}),statusBadge(v),el('span',{class:'badge',text:h.via}),
      el('div',{class:'mut',text:'ATC '+(v.atc_codes.slice(0,3).join(', ')||'-')+(v.atc_codes.length>3?' 외 '+(v.atc_codes.length-3):'')+' · RxCUI '+v.rxcui})));
  });
  if(list.length===1 || list[0].score>=95) selectVtm(list[0].vtm.id,{open:false});   // 단일 후보이거나 이름·RxCUI가 정확히 일치하면 상세를 바로 연다
}
function showDetail(id){
  const d=mt.describe(id), v=d.vtm, box=$('#detail'); box.replaceChildren();
  const card=el('div',{class:'card'});
  card.append(el('h2',{style:'margin:0 0 4px'},v.label_ko,' ',el('small',{text:v.label_en}),statusBadge(v)));
  const names=[...(v.alt_ko||[]),...(v.alt_en||[])]; if(names.length) card.append(el('div',{class:'mut',text:'이명: '+names.join(', ')}));
  if((v.brands_ko||[]).length) card.append(el('div',{class:'mut',text:'국내 상품명(수기·미검증): '+v.brands_ko.join(', ')}));
  card.append(el('table',{},el('tbody',{},
    el('tr',{},el('th',{text:'식별자'}),el('td',{text:`${v.id} · RxCUI ${v.rxcui}`+(v.snomed_ct.length?` · SNOMED CT ${v.snomed_ct.join(', ')}`:'')})),
    el('tr',{},el('th',{text:'출처'}),el('td',{text:`RxNorm(NLM) ${v.provenance.rxnorm_retrieved} 수집 · 한글명 ${v.provenance.ko_label}`}))
  )));
  card.append(el('h3',{text:'ATC 분류 경로'}));
  d.atc.forEach(a=>{ const row=el('div',{class:'chips'}); a.path.forEach((p,i)=>{ if(i)row.append(el('span',{class:'sep',text:'›'})); row.append(el('span',{class:'chip',title:p.name||'',text:p.code+(p.name?' '+p.name:'')})); });
    row.append(el('span',{class:'sep',text:'›'}),el('span',{class:'chip leaf',text:a.code})); card.append(row); });
  if(!d.atc.length) card.append(el('div',{class:'mut',text:'ATC 코드 없음'}));
  card.append(el('h3',{text:`계층: VTM → VMP(성분·용량·제형) → AMP(제품)  · VMP ${d.vmps.length}개`}));
  card.append(el('div',{class:'mut',text:'VMP/AMP는 미국 RxNorm 기준입니다. 국내 허가 제품(MFDS)은 아직 연동되지 않았습니다.'}));
  Object.keys(d.byForm).sort().forEach(f=>{ const list=d.byForm[f]; const det=el('details',{}, el('summary',{},el('b',{text:f}),list[0].form_ko?el('span',{class:'mut',text:' · '+list[0].form_ko}):'',el('span',{class:'mut',text:` (${list.length})`})));
    list.forEach(m=>{ det.append(el('div',{class:'vmp',text:`${m.strength.raw}${m.release_tech?' · '+m.release_tech:''}${m.pack_or_duration?' · '+m.pack_or_duration:''}  [${m.id}]`}));
      m.amps.slice(0,6).forEach(a=>det.append(el('div',{class:'amp',text:`└ AMP ${a.brand_en} [${a.id}] (${a.market})`}))); });
    card.append(det); });
  box.append(card); box.scrollTop=0; $('#insp-title').textContent=v.label_ko+' · 상세'; renderGraph(id);
}
const doSearch=()=>renderHits(mt.search($('#q').value));
$('#q').addEventListener('input',doSearch);
$$('.ex').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();$('#q').value=a.textContent;doSearch();}));


// ---- 관계 그래프 (선택한 성분 중심, 순수 SVG) ----
const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); kids.flat().forEach(c => e.append(c && c.nodeType ? c : document.createTextNode(c == null ? '' : c))); return e; };
const ZOOMS = [0.75, 1, 1.25, 1.5, 2]; let graphZoom = 'fit', graphLayout = null;
function graphAction(a){
  if(!a) return;
  if(a.type === 'select'){ selectVtm(a.id, { open: false }); const c = $('#graph-wrap .gn-vtm'); if(c) c.focus({ preventScroll: true }); }
  else if(a.type === 'filter'){ $('[data-seg=atc]').click(); const f = $('#tree-filter'); f.value = a.value; f.dispatchEvent(new Event('input', { bubbles: true })); if(mqPhone()) setNav(true, false); }
}
function applyGraphZoom(){
  const svg = $('#graph-wrap svg.graph'); $('#graph-zoom-label').textContent = graphZoom === 'fit' ? '맞춤' : Math.round(graphZoom * 100) + '%';
  if(!svg || !graphLayout) return;
  if(graphZoom === 'fit'){ svg.style.width = '100%'; svg.style.minWidth = '520px'; } else { svg.style.width = Math.round(graphLayout.width * graphZoom) + 'px'; svg.style.minWidth = '0'; }
}
function centerGraph(){
  const wrap = $('#graph-wrap'), svg = $('#graph-wrap svg.graph'); if(!svg || !graphLayout) return;
  const c = graphLayout.nodes.find(n => n.id === graphLayout.center), k = svg.clientWidth / graphLayout.width;
  wrap.scrollLeft = k ? Math.max(0, (c.x + c.w / 2) * k - wrap.clientWidth / 2) : 0;
}
function renderGraph(id){
  const wrap = $('#graph-wrap'); wrap.replaceChildren(); const g = id ? mt.graph(id) : null;
  if(!g){ graphLayout = null; $('#graph-title').textContent = '관계 그래프'; $('#graph-note').textContent = ''; wrap.append(el('div', { class: 'empty', text: '왼쪽 분류 트리나 검색에서 성분을 고르면 관계가 표시됩니다.' })); return; }
  const L = mt.layoutGraph(g); graphLayout = L; const v = mt.byId.get(id), T = g.totals, S = g.shown;
  $('#graph-title').textContent = v.label_ko + ' · 관계 그래프';
  $('#graph-note').textContent = `ATC 코드 ${S.atc}/${T.atc} · 같은 세부군 성분 ${S.siblings}/${T.siblings} · 제형·용량(VMP) ${S.vmp}/${T.vmp} · 제품(AMP) ${S.amp}/${T.amp} (표시/전체)`;
  const svg = sv('svg', { class: 'graph', viewBox: `0 0 ${L.width} ${L.height}`, role: 'group', 'aria-label': `${v.label_ko}의 관계 그래프: ${$('#graph-note').textContent}` });
  L.edges.forEach(e => svg.append(sv('path', { class: 'ge ge-' + e.rel, d: e.d })));
  L.headers.forEach(h => svg.append(sv('text', { class: 'gh', x: h.x, y: h.y }, h.text)));
  L.nodes.forEach(n => {
    const gn = sv('g', { class: `gn gn-${n.kind}${n.action ? ' clickable' : ''}`, transform: `translate(${n.x},${n.y})`, 'data-node': n.id });
    gn.append(sv('title', {}, n.title), sv('rect', { width: n.w, height: n.h, rx: 6 }));
    gn.append(sv('text', { class: 'l1', x: n.w / 2, y: n.t2 ? 14 : n.h / 2 + 4, 'text-anchor': 'middle' }, n.t1));
    if(n.t2) gn.append(sv('text', { class: 'l2', x: n.w / 2, y: 27, 'text-anchor': 'middle' }, n.t2));
    if(n.action){ const go = () => graphAction(n.action); gn.setAttribute('role', 'button'); gn.setAttribute('tabindex', '0'); gn.setAttribute('aria-label', n.title);
      gn.addEventListener('click', go); gn.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } }); }
    else { gn.setAttribute('role', 'img'); gn.setAttribute('aria-label', n.title); if(n.kind === 'vtm') gn.setAttribute('tabindex', '-1'); }
    svg.append(gn);
  });
  wrap.append(svg); applyGraphZoom(); centerGraph();
}
$('#graph-zoom-in').addEventListener('click', () => { const i = graphZoom === 'fit' ? 1 : ZOOMS.indexOf(graphZoom) + 1; graphZoom = graphZoom === 'fit' ? 1 : ZOOMS[Math.min(ZOOMS.length - 1, i)]; applyGraphZoom(); centerGraph(); });
$('#graph-zoom-out').addEventListener('click', () => { graphZoom = graphZoom === 'fit' ? 0.75 : ZOOMS[Math.max(0, ZOOMS.indexOf(graphZoom) - 1)]; applyGraphZoom(); centerGraph(); });
$('#graph-zoom-fit').addEventListener('click', () => { graphZoom = 'fit'; applyGraphZoom(); centerGraph(); });
document.querySelector('[data-tab=graph]').addEventListener('click', centerGraph);


// ---- 3단 레이아웃: 분류 트리 · 서랍(좁은 화면) · 선택 ----
const mqNarrow = () => !!(window.matchMedia && window.matchMedia('(max-width: 1099px)').matches);
const mqPhone = () => !!(window.matchMedia && window.matchMedia('(max-width: 699px)').matches);
const body = document.body; let lastOpener = null;
function syncBackdrop(){ $('#backdrop').hidden = !(body.classList.contains('insp-open') || body.classList.contains('nav-open')); }
function openInspector(){ body.classList.add('insp-open'); syncBackdrop(); $('#insp-close').focus(); }
function closeInspector(){ if(!body.classList.contains('insp-open')) return; body.classList.remove('insp-open'); syncBackdrop(); try{ if(lastOpener && lastOpener.focus) lastOpener.focus(); }catch(e){} }
function setNav(open, focus=true){ body.classList.toggle('nav-open', open); $('#nav-toggle').setAttribute('aria-expanded', String(open)); syncBackdrop(); if(focus){ (open?$('#tree-filter'):$('#nav-toggle')).focus(); } }
$('#insp-close').addEventListener('click', closeInspector);
$('#nav-toggle').addEventListener('click', () => setNav(!body.classList.contains('nav-open')));
$('#backdrop').addEventListener('click', () => { closeInspector(); if(body.classList.contains('nav-open')) setNav(false); });
document.addEventListener('keydown', e => { if(e.key==='Escape'){ if(body.classList.contains('insp-open')) closeInspector(); else if(body.classList.contains('nav-open')) setNav(false); } });
window.addEventListener('resize', () => { if(!mqNarrow()) body.classList.remove('insp-open'); if(!mqPhone()){ body.classList.remove('nav-open'); $('#nav-toggle').setAttribute('aria-expanded','false'); } syncBackdrop(); });

function selectVtm(id, opts={}){
  const open = opts.open !== false;
  showDetail(id);
  $$('[data-id]').forEach(b => { if(b.dataset.id===id) b.setAttribute('aria-current','true'); else b.removeAttribute('aria-current'); });
  try{ location.replace('#'+encodeURIComponent(id)); }catch(e){}   // file://에서는 history.replaceState가 보안 오류를 내므로 location.replace를 쓴다(기록을 쌓지 않음)
  if(open){ lastOpener = mqPhone() ? $('#nav-toggle') : document.activeElement; if(mqPhone()) setNav(false,false); if(mqNarrow()) openInspector(); }
}

// ATC 분류 트리(성분은 가진 ATC 코드마다 해당 분류 아래에 나타난다) + 가나다순 목록
const treeModel = [];
function buildTree(){
  const roots = new Map(), orphan = [];
  const ensure = (map, code) => { if(!map.has(code)) map.set(code, { code, name: mt.atcLabel(code) || '', kids: new Map(), leaves: [], ids: new Set() }); return map.get(code); };
  mt.vtms.forEach(v => { const codes = v.atc_codes || []; if(!codes.length) orphan.push({ v, code: '' });
    codes.forEach(code => { const path = (v.atc_paths || {})[code] || []; let map = roots, node = null; const chain = [];
      path.forEach(c => { node = ensure(map, c); chain.push(node); map = node.kids; });
      chain.forEach(n => n.ids.add(v.id)); if(node) node.leaves.push({ v, code }); else orphan.push({ v, code }); }); });
  return { roots, orphan };
}
const leafText = (v, code) => [v.label_ko, v.label_en, code, ...(v.brands_ko||[]), ...(v.alt_ko||[]), ...(v.alt_en||[])].join(' ').toLowerCase();
function leafItem(v, code){
  const b = el('button', { class:'leaf', type:'button', 'data-id':v.id, onclick:() => selectVtm(v.id) }, el('span',{class:'ko',text:v.label_ko}), el('small',{text:`${code || 'ATC 없음'} · ${v.label_en}`}));
  return { el: el('li', {}, b), text: leafText(v, code) };
}
function renderNode(n){
  const det = el('details', {}, el('summary', {}, el('span',{class:'code',text:n.code}), el('span',{class:'nm',title:n.name,text:n.name}), el('span',{class:'n',title:'이 분류의 성분 수',text:String(n.ids.size)})));
  const ul = el('ul'); const kids = [...n.kids.values()].sort((x,y) => x.code.localeCompare(y.code)).map(renderNode); kids.forEach(k => ul.append(k.el));
  const leaves = n.leaves.sort((x,y) => x.code.localeCompare(y.code)).map(l => leafItem(l.v, l.code)); leaves.forEach(l => ul.append(l.el)); det.append(ul);
  return { el: el('li', {}, det), det, code: n.code, name: n.name, kids, leaves };
}
(function(){
  const { roots, orphan } = buildTree(); const top = el('ul');
  [...roots.values()].sort((x,y) => x.code.localeCompare(y.code)).map(renderNode).forEach(m => { treeModel.push(m); top.append(m.el); });
  if(orphan.length){ const leaves = orphan.map(o => leafItem(o.v, o.code)); const det = el('details', {}, el('summary', {}, el('span',{class:'code',text:'ATC 없음'}), el('span',{class:'n',text:String(orphan.length)})), el('ul',{}, leaves.map(l => l.el)));
    const m = { el: el('li',{},det), det, code:'atc 없음', name:'', kids:[], leaves }; treeModel.push(m); top.append(m.el); }
  $('#tree').append(top);
  const azul = el('ul'); [...mt.vtms].sort((x,y) => x.label_ko.localeCompare(y.label_ko,'ko')).forEach(v => { const it = leafItem(v, (v.atc_codes||[])[0] || ''); it.el.dataset.text = it.text; azul.append(it.el); });
  $('#az').append(azul);
})();
function filterTree(q){
  q = q.trim().toLowerCase();
  const walk = n => { const self = !q || n.code.toLowerCase().includes(q) || n.name.toLowerCase().includes(q); let any = false;
    n.leaves.forEach(l => { const m = !q || self || l.text.includes(q); l.el.hidden = !m; any = any || m; });
    n.kids.forEach(k => { if(walk(k)) any = true; });
    n.el.hidden = !any; n.det.open = !!q && any; return any; };
  treeModel.forEach(walk);
  $$('#az li').forEach(li => { li.hidden = !!q && !li.dataset.text.includes(q); });
}
$('#tree-filter').addEventListener('input', e => filterTree(e.target.value));
$$('[data-seg]').forEach(b => b.addEventListener('click', () => { $$('[data-seg]').forEach(x => x.setAttribute('aria-selected', String(x===b))); const atc = b.dataset.seg === 'atc'; $('#tree').hidden = !atc; $('#az').hidden = atc; }));
(function(){ try{ const h = decodeURIComponent(location.hash.slice(1)); const v = h && mt.byId.get(h); if(v && v.type === 'VTM') selectVtm(h, { open:false }); }catch(e){} })();


// ---- 답변 검증 ----
const SAMPLES=[
 ['① 일치하는 답변','오메프라졸(Omeprazole)은 양성자펌프억제제이며 ATC 코드는 A02BC01입니다. 단위용량으로 20mg 캡슐이 있습니다. 복용 방법은 의사·약사와 상담하세요.'],
 ['② 계열·코드·철자 오류 섞임','메트포르민은 항고혈압제로 분류되며 ATC 코드 C09CA01에 해당합니다. 오메프라졸린 20mg을 하루 한 번 복용하고, 베르나스타틴과 병용할 수 있습니다.'],
 ['③ 단위용량 불일치','아토르바스타틴 37mg 정제와 로수바스타틴 10mg 정제가 있습니다. 아토르바스타틴은 스타틴 계열입니다.'],
 ['④ RxCUI 혼동','클로피도그렐(RxCUI 7646)은 항혈소판제입니다. ATC 코드는 B01AC04입니다.'],
 ['⑤ 영문 혼합·상품명','Omeprazol and esomeprazole are PPIs (ATC A02BC05). 타이레놀은 아세트아미노펜 성분의 해열진통제이며 500mg 정제가 있습니다. 하루 최대 4,000mg을 넘기지 마세요.']
];
SAMPLES.forEach((s,i)=>$('#sample').append(el('option',{value:i,text:s[0]})));
$('#sample').addEventListener('change',e=>{ if(e.target.value!=='') $('#vtext').value=SAMPLES[e.target.value][1]; });
const SEV={error:'오류(사전과 불일치)',warn:'확인 필요',info:'정보',ok:'일치'};
const VERDICT={inconsistent:'사전 기준 불일치가 발견되었습니다 — 이 답변을 그대로 신뢰하지 마세요.',needs_review:'사전으로 확인되지 않는 항목이 있습니다 — 사람(약사)의 확인이 필요합니다.',no_conflict_found:'사전에 수록된 범위에서는 불일치가 발견되지 않았습니다. (사전에 없는 내용은 검증되지 않았으며, 정확성을 보증하는 것이 아닙니다.)'};
function renderVerify(text, out){
  out.replaceChildren(); const r=mt.verify(text);
  out.append(el('div',{class:'verdict '+r.summary.verdict,text:VERDICT[r.summary.verdict]}));
  const sum=el('div',{class:'sum'});
  [['error','err'],['warn','draft'],['info',''],['ok','ok']].forEach(([k,c])=>sum.append(el('span',{class:'badge '+c,text:`${SEV[k]} ${r.summary[k]}`})));
  out.append(sum);
  const ann=el('div',{class:'ann'}); mt.annotate(text,r.findings).forEach(seg=>{ ann.append(seg.severity?el('span',{class:'s-'+seg.severity,title:seg.findings.map(f=>f.message).join('\n'),text:seg.text}):document.createTextNode(seg.text)); });
  out.append(ann);
  const rows=r.findings.filter(f=>f.severity!=='ok'); const tb=el('tbody');
  rows.forEach(f=>tb.append(el('tr',{},el('td',{},el('span',{class:'sev '+f.severity,text:SEV[f.severity]})),el('td',{text:f.text}),el('td',{text:f.message}))));
  if(rows.length) out.append(el('div',{class:'card',style:'margin-top:12px'},el('table',{},el('thead',{},el('tr',{},el('th',{text:'판정'}),el('th',{text:'구간'}),el('th',{text:'근거/설명'}))),tb)));
  return r;
}
$('#run-verify').addEventListener('click',()=>renderVerify($('#vtext').value,$('#vresult')));

// ---- 근거 기반 질의 ----
let lastPrompt=null;
$('#rag-go').addEventListener('click',()=>{
  const q=$('#rq').value.trim(); const out=$('#rag-out'); out.replaceChildren(); if(!q) return;
  const sel=mt.retrieve(q,5);
  if(!sel.length){ out.append(el('p',{class:'mut',text:'질문에서 사전 항목을 찾지 못했습니다. 이 경우 LLM에는 "사전에 없어 확인 불가"로 답하도록 지시하는 프롬프트만 생성됩니다.'})); }
  lastPrompt=mt.buildGroundedPrompt(q,sel);
  out.append(el('h3',{text:'검색된 사전 항목 ('+sel.length+')'}));
  sel.forEach(id=>{const v=mt.byId.get(id); out.append(el('div',{class:'hit',onclick:()=>selectVtm(id)},el('b',{text:v.label_ko}),' ',el('span',{class:'mut',text:v.label_en+' · '+id})));});
  out.append(el('h3',{text:'LLM에 전달할 프롬프트'}),el('pre',{text:'[system]\n'+lastPrompt.system+'\n\n[user]\n'+lastPrompt.user}));
  out.append(el('button',{class:'btn sec',onclick:()=>navigator.clipboard&&navigator.clipboard.writeText(lastPrompt.system+'\n\n'+lastPrompt.user)},'프롬프트 복사'));
  $('#rag-llm').hidden=false;
});
$('#llm-mock').addEventListener('click',()=>{ $('#rag-answer').value='오메프라졸은 ATC 코드 A02BC05에 해당하는 양성자펌프억제제이며, 10mg·20mg·40mg·200mg 캡슐이 있습니다. 에스오메프라졸린은 그 이성질체입니다.'; });
$('#llm-call').addEventListener('click',async()=>{
  const url=$('#proxy').value.trim(); if(!url||!lastPrompt){ alert('프록시 URL을 입력하고 먼저 근거를 찾으세요.'); return; }
  try{ const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({system:lastPrompt.system,user:lastPrompt.user})});
    if(!r.ok) throw new Error('HTTP '+r.status); const j=await r.json(); $('#rag-answer').value=j.text||''; renderVerify($('#rag-answer').value,$('#rag-verify-out')); }
  catch(e){ alert('호출 실패: '+e.message); }
});
$('#rag-verify').addEventListener('click',()=>renderVerify($('#rag-answer').value,$('#rag-verify-out')));

// ---- 데이터·한계 ----
(function(){
  const m=window.MEDTERM_DATA.meta, b=window.MEDTERM_BENCH, box=$('#about');
  const pct=o=>`${o.k}/${o.n} (${Math.round(o.k/o.n*100)}%, 95% CI ${Math.round(o.lo*100)}–${Math.round(o.hi*100)}%)`;
  const sumCat=(d,pref)=>{let k=0,n=0,lo;Object.entries(d).forEach(([c,o])=>{if(c.startsWith(pref)){k+=o.k;n+=o.n}});return {k,n}};
  const neg=sumCat(b.dev,'N_'), pos=sumCat(b.dev,'E_'), h2=b.heldout2.HELDOUT2_real, h1=b.heldout1.HELDOUT_real;
  box.append(el('div',{class:'card'},el('h3',{style:'margin-top:0',text:'수록 데이터'}),
    el('p',{text:`성분(VTM) ${m.counts.VTM} · 제형·용량(VMP) ${m.counts.VMP} · 제품(AMP, 미국 브랜드) ${m.counts.AMP}. 생성일 ${m.built_at}, RxNav ${m.rxnav_version||''}.`}),
    el('ul',{},m.sources.map(s=>el('li',{text:s}))),el('p',{class:'mut',text:m.notice})));
  box.append(el('div',{class:'card'},el('h3',{style:'margin-top:0',text:'검증기 점검 결과 (자동 테스트)'}),
    el('p',{class:'mut',text:'개발 세트는 이 사전에서 합성한 문장이라 사실상 단위 테스트이며 실제 LLM 답변의 성능이 아닙니다.'}),
    el('table',{},el('tbody',{},
      el('tr',{},el('th',{text:'개발 세트·정상 문장에서 오탐 없음'}),el('td',{text:`${neg.k}/${neg.n}`})),
      el('tr',{},el('th',{text:'개발 세트·주입 오류 탐지(ATC·RxCUI·계열·용량·철자·가짜 이름)'}),el('td',{text:`${pos.k}/${pos.n}`})),
      el('tr',{},el('th',{text:'보류 세트 1 — 사전 밖 실존 약물명 탐지(수정 전, 독립)'}),el('td',{text:'27/34 (79%, 95% CI 63–90%)'})),
      el('tr',{},el('th',{text:'보류 세트 2 — 사전 밖 실존 약물명 탐지(수정 후 새로 평가, 독립)'}),el('td',{text:pct(h2)})))),
    el('p',{text:'해석: 사전에 수록된 약물에 대한 코드·계열·용량 불일치는 잘 잡지만, 사전에 없는 약물명은 어간 규칙만으로는 놓치는 경우가 많습니다. 전수 성분 목록(MFDS) 연동이 필요합니다.'})));
  box.append(el('div',{class:'card'},el('h3',{style:'margin-top:0',text:'한계'}),el('ul',{class:'lim'},
    ['"사전에 없음"은 환각의 증거가 아니라 확인 필요 신호입니다(수록 성분 32개).',
     '단위용량 검사는 "미국 RxNorm에 있는 단위 규격인가"만 봅니다. 적정 용량·안전성 판단이 아닙니다.',
     '계열 용어(한글)와 상품명(국내)은 수기 초안이며 약사 검수·MFDS 대조가 필요합니다.',
     '상호작용·금기·병용·용법 등 임상 내용은 다루지 않습니다(MFDS DUR 등 별도 근거 필요).',
     'ATC 코드는 성분당 여러 개일 수 있어 일치 여부는 "어느 하나와 일치"로 판단합니다.'].map(t=>el('li',{text:t})))));
})();
})();
