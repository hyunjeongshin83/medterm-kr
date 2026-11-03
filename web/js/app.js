
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
  if(!list.length){ box.append(el('div',{class:'card mut',text:'사전에 없습니다. (이 프로토타입은 약 '+mt.vtms.length+'개 성분만 수록 — 없다고 해서 존재하지 않는 약이라는 뜻은 아닙니다.)'})); return; }
  list.slice(0,12).forEach(h=>{ const v=h.vtm;
    box.append(el('div',{class:'hit',tabindex:'0',onclick:()=>showDetail(v.id),onkeydown:e=>{if(e.key==='Enter')showDetail(v.id)}},
      el('b',{text:v.label_ko}),' ',el('span',{class:'mut',text:v.label_en}),statusBadge(v),el('span',{class:'badge',text:h.via}),
      el('div',{class:'mut',text:'ATC '+(v.atc_codes.slice(0,3).join(', ')||'-')+(v.atc_codes.length>3?' 외 '+(v.atc_codes.length-3):'')+' · RxCUI '+v.rxcui})));
  });
  if(list.length===1 || list[0].score>=95) showDetail(list[0].vtm.id);   // 단일 후보이거나 이름·RxCUI가 정확히 일치하면 상세를 바로 연다
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
  box.append(card); box.scrollIntoView({behavior:'smooth',block:'nearest'});
}
const doSearch=()=>renderHits(mt.search($('#q').value));
$('#q').addEventListener('input',doSearch);
$$('.ex').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();$('#q').value=a.textContent;doSearch();}));

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
  sel.forEach(id=>{const v=mt.byId.get(id); out.append(el('div',{class:'hit',onclick:()=>{$$('nav button')[0].click();$('#q').value=v.label_ko;doSearch();}},el('b',{text:v.label_ko}),' ',el('span',{class:'mut',text:v.label_en+' · '+id})));});
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
