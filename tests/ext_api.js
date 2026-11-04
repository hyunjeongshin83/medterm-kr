// 확장 수록 API 점검(core.js) — node tests/ext_api.js
// ① 확장 자료를 주지 않거나 이상한 값을 줘도 핵심 사전만으로 이전과 똑같이 동작한다(핵심 API 결과가 같고 오류가 나지 않는다)
// ② searchExt  ③ describeExt/anyById  ④ graph  ⑤ verify(확장 이름·ATC·단위용량·모호한 이름·가짜 이름)  ⑥ contextFor/프롬프트/retrieve  ⑦ 분류  ⑧ 속도  ⑨ 출처·이용 조건(provenance·attribution)
// 실패가 있으면 종료 코드 1.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const { MedTerm } = require(path.join(root, 'web/js/core.js'));
const rd = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const data = rd('data/medterm.json'), cls = rd('data/class_lexicon.json'), ext = rd('data/medterm_ext.json');

let total = 0, bad = 0;
const ck = (name, ok, extra) => { total++; if (!ok) bad++; const show = extra !== undefined && extra !== null && !(Array.isArray(extra) && extra.length === 0); console.log((ok ? 'PASS ' : 'FAIL ') + name + (show || (!ok && extra !== undefined) ? '  → ' + JSON.stringify(extra) : '')); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const t0 = Date.now();
const A = new MedTerm(data, cls), B = new MedTerm(data, cls, ext);
const buildMs = Date.now() - t0;
const OME = 'MT:VTM:7646', ESO = 'MT:VTM:283742', PAN = 'MT:VTM:40790', ATV = 'MT:VTM:83367', EPE = 'MT:KRI:eperisone', AMB = 'MT:VTM:625';
const sr = (hits) => hits.map((h) => [h.vtm.id, h.score, h.via]);
const xr = (hits) => hits.map((h) => [h.ext.id, h.score, h.via, h.vtm ? h.vtm.id : null]);
const flagged = (r) => r.findings.filter((f) => f.severity === 'warn' || f.severity === 'error');
const types = (r) => r.findings.map((f) => `${f.severity}:${f.type}`);

// ── ① 확장 자료가 없을 때 ──
ck('확장 자료를 주지 않으면 확장 목록·메타가 비어 있음(extList 0 · extMeta null)', A.extList.length === 0 && A.extAll.length === 0 && A.extMeta === null && A.extById.size === 0);
ck('확장 자료를 주지 않으면 searchExt/describeExt 는 빈 결과/null', same(A.searchExt('에페리손'), []) && A.describeExt(EPE) === null && A.anyById(EPE) === null && A.hasId(EPE) === false);
for (const [label, bad_] of [['null', null], ['undefined', undefined], ['빈 객체 {}', {}], ['entities 가 문자열', { entities: 'x' }], ['entities 빈 배열', { entities: [] }]]) {
  let m = null, err = null; try { m = new MedTerm(data, cls, bad_); m.verify('오메프라졸 20mg'); m.search('PPI'); m.graph(OME); } catch (e) { err = String(e); }
  ck(`이상한 확장 자료(${label})를 줘도 오류 없이 핵심만으로 동작`, !err && m && m.extList.length === 0 && m.vtms.length === A.vtms.length, err);
}
const QS = ['오메프라졸', '오메프라졸 20mg', 'omeprazole', '로섹', '노바스크', 'PPI', '진통제', 'ACE 억제제', 'C10AA', 'A02BC01', 'MT:VTM:7646', 'RxCUI 7646', 'v-7646', 'ＰＰＩ', '에페리손', '리피토', '아세트', 'zzzxx', '스타틴', '항응고제', '베타차단제'];
ck('핵심 검색 search() 는 확장 자료를 줘도 결과가 같음(이름·상품명·분류·코드·ID·전각 등 21가지 입력)', QS.every((q) => same(sr(A.search(q)), sr(B.search(q)))), QS.filter((q) => !same(sr(A.search(q)), sr(B.search(q)))));
ck('핵심 성분 describe() 는 확장 자료를 줘도 같음(32개 성분 전부)', A.vtms.every((v) => same(A.describe(v.id).atc, B.describe(v.id).atc) && A.describe(v.id).vmps.length === B.describe(v.id).vmps.length));
const gA = A.graph(OME), gB = B.graph(OME);
const nonSib = (g) => g.nodes.filter((n) => n.kind !== 'sibling' && n.kind !== 'more').map((n) => n.id);
ck('핵심 성분 그래프: ATC·세부군·VMP·AMP 상자는 확장 자료를 줘도 같고, 같은 세부군 성분만 확장 수록이 이어 붙음', same(nonSib(gA), nonSib(gB)) && gB.totals.siblings >= gA.totals.siblings && gB.totals.atc === gA.totals.atc && gB.totals.vmp === gA.totals.vmp && gB.totals.amp === gA.totals.amp, { a: gA.totals, b: gB.totals });
const sibIds = (g) => g.nodes.filter((n) => n.kind === 'sibling').map((n) => n.id);
ck('핵심 성분 그래프: 같은 세부군 성분은 핵심이 먼저(핵심 → 확장 순서)', (() => { const ids = sibIds(gB); const isExt = ids.map((id) => !!B.extById.get(id) && !B.byId.has(id)); return isExt.every((x, i) => i === 0 || !(!x && isExt[i - 1])) && same(sibIds(gA), ids.slice(0, sibIds(gA).length)); })(), sibIds(gB));
ck('핵심만 쓰는 verify() 결과는 핵심 성분 문장에서 확장 자료를 줘도 같음(PPI 정상·ATC 오류·단위용량 오류 문장)', ['오메프라졸(Omeprazole)은 양성자펌프억제제이며 ATC 코드는 A02BC01입니다. 단위용량으로 20mg 캡슐이 있습니다.', '오메프라졸은 ATC 코드 A02BC05에 해당합니다.', '아토르바스타틴 37mg 정제가 있습니다.', '클로피도그렐(RxCUI 7646)은 항혈소판제입니다.'].every((t) => same(types(A.verify(t)), types(B.verify(t)))));

// ── ② searchExt ──
ck('searchExt("에페리손") → MT:KRI:eperisone 하나(이름 일치 100, 핵심 아님)', same(xr(B.searchExt('에페리손')), [[EPE, 100, '이름 일치', null]]), xr(B.searchExt('에페리손')));
ck('에페리손염산염·eperisone·Eperisone Hydrochloride·전각 입력도 같은 성분', ['에페리손염산염', 'eperisone', 'Eperisone Hydrochloride', 'ＥＰＥＲＩＳＯＮＥ'].every((q) => B.searchExt(q).some((h) => h.ext.id === EPE && h.score >= 95)), ['에페리손염산염', 'eperisone', 'Eperisone Hydrochloride', 'ＥＰＥＲＩＳＯＮＥ'].map((q) => B.searchExt(q)[0] && B.searchExt(q)[0].score));
ck('ATC 코드 검색 "M03BX09" → 에페리손(ATC 코드 70)', B.searchExt('M03BX09').some((h) => h.ext.id === EPE && h.via === 'ATC 코드' && h.score === 70));
ck('ID 입력 — MT:KRI:eperisone · [MT:KRI:eperisone] · #k-eperisone · k-eperisone → 에페리손 하나(ID 일치 95)', ['MT:KRI:eperisone', '[MT:KRI:eperisone]', '#k-eperisone', 'k-eperisone', 'mt:kri:eperisone'].every((q) => same(xr(B.searchExt(q)), [[EPE, 95, 'ID 일치', null]])), ['MT:KRI:eperisone', '#k-eperisone', 'k-eperisone'].map((q) => xr(B.searchExt(q))));
ck('ID/RxCUI 입력 — MT:VTM:625 · RxCUI 625 · rxcui:625 · #v-625 · v-625 → 암브록솔 하나(95)', ['MT:VTM:625', 'RxCUI 625', 'rxcui:625', '#v-625', 'v-625'].every((q) => { const r = B.searchExt(q); return r.length === 1 && r[0].ext.id === AMB && r[0].score === 95; }), ['MT:VTM:625', 'RxCUI 625', '#v-625'].map((q) => xr(B.searchExt(q))));
ck('두 글자 미만 입력은 이름 검색을 하지 않음("에" → 없음), 없는 이름은 빈 결과', B.searchExt('에').length === 0 && B.searchExt('zzzxx').length === 0 && B.searchExt('').length === 0 && B.searchExt('   ').length === 0);
{
  const dn = B.vtms.map((v) => ({ id: v.id, brand: (B.extOfCore.get(v.id) || { brands_ko: [] }).brands_ko.find((b) => !A.search(b).some((r) => r.vtm.id === v.id) && B.searchExt(b).some((h) => h.vtm && h.vtm.id === v.id)) })).find((x) => x.brand);
  const h = dn ? B.searchExt(dn.brand).find((x) => x.vtm && x.vtm.id === dn.id) : null;
  ck('핵심 성분이 확장 자료의 상품명으로 찾아지면 vtm 에 핵심 VTM 이 들어 있고 이유는 "상품명 일치"(점수는 이름 일치보다 1점 낮은 99)', !!h && h.ext.core === true && h.vtm === B.byId.get(dn.id) && h.via === '상품명 일치' && h.score === 99, dn);
}
ck('핵심 성분 이름(오메프라졸)은 확장 목록(extList)에 따로 나오지 않음 — core:true 는 extOfCore 에만', !B.extList.some((v) => v.id === OME) && B.extOfCore.has(OME) && B.extOfCore.size === ext.meta.counts.core_overlap, { n: B.extOfCore.size });
ck('분류 별칭: searchExt("ACE 억제제")는 분류 소속 확장 성분을 "분류: ACE 억제제"로 돌려줌(핵심 0개)', (() => { const r = B.searchExt('ACE 억제제'); return r.length >= 10 && r.every((h) => h.via === '분류: ACE 억제제' && !h.vtm) && A.searchClass('ACE 억제제')[0].members.length === 0; })(), B.searchExt('ACE 억제제').length);
ck('정렬: 점수 높은 순 → 같은 점수는 이름 순(안정적)', (() => { const r = B.searchExt('아세트'); return r.every((h, i) => i === 0 || r[i - 1].score > h.score || (r[i - 1].score === h.score && B._cmpName(r[i - 1].ext, h.ext) <= 0)); })());

// ── ③ describeExt / anyById ──
{
  const d = B.describeExt(EPE);
  ck('describeExt(에페리손): 한글 이름 후보(출처·건수) · 등급 d · 등급 설명 · ATC 경로 4단계 + 코드 근거 · 국내 등재 현황', d && d.names.length === 1 && d.names[0].n === '에페리손염산염' && d.names[0].s === 'H' && d.names[0].c > 0 && d.grade === 'd' && d.gradeText === ext.meta.grade_legend.d && d.atc.length === 1 && d.atc[0].code === 'M03BX09' && d.atc[0].src === 'H' && d.atc[0].path.length === 4 && d.kr && d.kr.items > 0, d && { names: d.names, grade: d.grade, atc: d.atc.map((a) => a.code) });
  const dc = B.describeExt(OME);
  ck('describeExt(오메프라졸, 핵심과 겹침): coreVtm 이 핵심 VTM 이고 국내 등재 현황이 있음', dc && dc.coreVtm === B.byId.get(OME) && dc.kr && dc.kr.items > 0);
  ck('describeExt(없는 ID) = null, anyById/hasId/nameOfId 는 핵심·확장 모두 찾음', B.describeExt('MT:KRI:nope') === null && B.anyById(OME).type === 'VTM' && B.anyById(EPE).ext === true && B.hasId(AMB) && !B.hasId('MT:VTM:99999999') && B.nameOfId(EPE) === '에페리손염산염' && B.nameOfId('MT:KRI:nope') === 'MT:KRI:nope');
  const v = B.extById.get(EPE);
  ck('확장 성분 뷰: label_ko/label_en/ko_base/atc_codes/brands_ko/grade/review_status=draft/rec(원본) 필드', v.label_ko === '에페리손염산염' && v.label_en === 'eperisone' && v.ko_base.includes('에페리손') && same(v.atc_codes, ['M03BX09']) && v.brands_ko.length > 0 && v.grade === 'd' && v.review_status === 'draft' && v.rec.id === EPE && v.ext === true && v.core === false);
}

// ── ④ graph(확장 성분 중심) ──
{
  const g = B.graph(EPE), L = B.layoutGraph(g);
  const kinds = new Set(g.nodes.map((n) => n.kind));
  ck('확장 성분 그래프: 상자 종류는 성분·ATC·세부군·같은 세부군 성분(·외 N개)뿐이고 VMP·AMP 는 없음', [...kinds].every((k) => ['vtm', 'atc', 'group', 'sibling', 'more'].includes(k)) && g.totals.vmp === 0 && g.totals.amp === 0 && g.shown.vmp === 0 && g.nodes[0].id === EPE && g.center === EPE, [...kinds]);
  ck('확장 성분 그래프: 같은 세부군 성분이 있고(M03BX) 핵심 성분이 있으면 먼저, 자기 자신은 빠짐', g.totals.siblings >= 1 && !sibIds(g).includes(EPE));
  ck('확장 성분 그래프: 레이아웃 열은 sibling·group·atc·vtm 네 개이고 상자가 모두 캔버스 안', same(L.headers.map((h) => h.col), ['sibling', 'group', 'atc', 'vtm']) && L.nodes.every((n) => n.x >= 0 && n.y >= 0 && n.x + n.w <= L.width && n.y + n.h <= L.height));
  ck('graph(없는 ID) = null, 분류 수준 ATC 코드만 있는 확장 성분도 그래프가 그려짐(오류 없음)', B.graph('MT:KRI:nope') === null && (() => { const x = B.extList.find((e) => !e.atc_codes.length && e.atc_class.length); try { return !x || !!B.layoutGraph(B.graph(x.id)); } catch (e) { return false; } })());
}

// ── ⑤ verify ──
{
  const r1 = B.verify('에페리손염산염은 ATC 코드 M03BX09에 속하는 근이완제입니다.');
  ck('verify: 확장 이름 + 맞는 ATC → ok(known_term_ext · atc_ok) 2건, 걸리는 것 없음, 불일치 없음 판정', same(types(r1), ['ok:known_term_ext', 'ok:atc_ok']) && r1.summary.verdict === 'no_conflict_found' && flagged(r1).length === 0, types(r1));
  const r2 = B.verify('에페리손은 ATC 코드 M03BX01에 해당합니다.');
  ck('verify: 확장 성분의 ATC 코드가 다르면 error 가 아니라 warn(atc_mismatch)이고 판정은 needs_review', r2.findings.some((f) => f.type === 'atc_mismatch' && f.severity === 'warn' && f.message.includes('확장 수록 자료(자동 수집·검수 전)')) && r2.summary.error === 0 && r2.summary.verdict === 'needs_review', types(r2));
  const r3 = B.verify('에페리손염산염 12345mg 정제가 있습니다.');
  ck('verify: 확장 성분에는 단위용량 검사를 하지 않음(strength_not_listed 없음)', !r3.findings.some((f) => f.type === 'strength_not_listed') && flagged(r3).length === 0, types(r3));
  const r4 = B.verify('오메프라졸은 ATC 코드 A02BC05에 해당합니다.');
  ck('verify: 핵심 성분의 ATC 오류는 확장 자료를 켜도 error(atc_mismatch)', r4.findings.some((f) => f.type === 'atc_mismatch' && f.severity === 'error') && r4.summary.verdict === 'inconsistent', types(r4));
  const r5 = B.verify('에페리손염산염은 갑상선호르몬제 계열 약물입니다.');
  ck('verify: 확장 성분이 다른 계열(갑상선호르몬제)로 설명되면 class_mismatch 가 error 가 아니라 warn', r5.findings.some((f) => f.type === 'class_mismatch' && f.severity === 'warn') && r5.summary.error === 0, types(r5));
  const r6 = B.verify('베르나스타틴은(는) 새로운 치료제로 알려져 있습니다.');
  ck('verify: 없는 가짜 약 이름("베르나스타틴")은 확장 자료를 켜도 걸림(unknown_drug 또는 near_miss)', flagged(r6).some((f) => ['unknown_drug', 'near_miss'].includes(f.type)) && r6.summary.verdict === 'needs_review', types(r6));
  const r7 = B.verify('에페리손염산염 에페리손 eperisone 을 설명합니다.');
  ck('verify: 확장 성분 이름을 찾아도 unknown_drug 로 걸지 않음(한글 이름·영문 이름 모두)', !r7.findings.some((f) => f.type === 'unknown_drug') && r7.findings.filter((f) => f.type === 'known_term_ext').length >= 2, types(r7));
  const dup = (() => { const idx = new Map(); for (const v of B.extList) for (const n of [v.label_ko, ...v.alt_ko, ...v.ko_base]) { if (!n || n.length < 3) continue; const k = n.toLowerCase(); if (!idx.has(k)) idx.set(k, new Set()); idx.get(k).add(v.id); } return [...idx].filter(([k, s]) => s.size > 1 && !B.knownNames.has(k)).map(([k]) => k); })();
  ck(`verify: 이름이 둘 이상의 확장 성분에 걸리는 모호한 이름(${dup.length}개)은 어느 성분인지 정할 수 없어 일치로 쓰지 않음`, dup.length >= 10 && dup.slice(0, 40).every((n) => !B.verify(`${n}을 설명합니다.`).findings.some((f) => f.type === 'known_term_ext')), dup.slice(0, 5));
  ck('verify: 핵심 이름이 우선 — 핵심 성분 이름은 known_term_ext 가 아니라 핵심 일치로 처리', !B.verify('오메프라졸은 양성자펌프억제제입니다.').findings.some((f) => f.type === 'known_term_ext'));
  const mm = B.findMentions('에페리손은 안전합니다. 에페리손염산염과 오메프라졸.', { ext: true });
  ck('findMentions(ext): 확장 이름은 ext:true 로, 핵심 이름은 ext 없이 나오고 겹치지 않음', mm.filter((m) => m.ext).length === 2 && mm.filter((m) => !m.ext).length === 1 && mm.every((m, i) => i === 0 || mm[i - 1].end <= m.start), mm.map((m) => [m.text, !!m.ext]));
  ck('findMentions: ext 옵션을 주지 않으면 확장 이름은 찾지 않음(예전 동작)', !B.findMentions('에페리손은 안전합니다.').length || B.findMentions('에페리손은 안전합니다.').every((m) => !m.ext));
}

// ── ⑥ contextFor / 프롬프트 / retrieve ──
{
  const c = B.contextFor([EPE, OME]);
  ck('contextFor: 확장 항목은 tier=ext · 후보 이름 · 상품명 5개 이하 · note · ATC · kr_listed(용법·용량 아님), 핵심 항목에는 tier 가 없음', c[0].tier === 'ext' && c[0].id === EPE && c[0].name_ko === '에페리손염산염' && c[0].brands_ko.length <= 5 && c[0].review_status === 'draft' && c[0].note.includes('확장 수록') && c[0].atc[0].code === 'M03BX09' && c[0].kr_listed && c[0].kr_listed.note.includes('용법·용량 아님') && !('tier' in c[1]) && c[1].id === OME, c);
  const pe = B.buildGroundedPrompt('에페리손?', [EPE]), pc = B.buildGroundedPrompt('오메프라졸?', [OME]);
  ck('buildGroundedPrompt: 확장 항목이 있을 때만 규칙 5)("확장 수록 자료 기준"이라고 밝히세요)가 붙음', pe.system.includes('규칙 5) tier 가 "ext"') && pe.system.includes('"확장 수록 자료 기준"이라고 밝히세요') && !pc.system.includes('규칙 5)'));
  ck('buildGroundedPrompt: 사전 항목이 없을 때 안내문에 핵심 32개 + 확장 수록 개수가 나옴(확장을 끄면 예전 문구)', B.buildGroundedPrompt('질문', []).user.includes(`핵심)과 확장 수록 ${B.extList.length}개 성분`) && !A.buildGroundedPrompt('질문', []).user.includes('확장'));
  ck('retrieve: 확장 성분 질문 → 확장 ID, 핵심 성분 질문 → 핵심 ID, 확장 자료가 없으면 못 찾음', same(B.retrieve('에페리손은 어떤 약인가요?'), [EPE]) && same(B.retrieve('오메프라졸 알려줘'), [OME]) && same(A.retrieve('에페리손은 어떤 약인가요?'), []), [B.retrieve('에페리손은 어떤 약인가요?'), B.retrieve('오메프라졸 알려줘')]);
  ck('retrieve: 핵심과 확장이 섞인 질문은 핵심·확장 ID 가 모두 나옴(최대 5개)', (() => { const r = B.retrieve('암브록솔과 오메프라졸 비교'); return r.includes(OME) && r.includes(AMB) && r.length <= 5; })());
}

// ── ⑦ 분류 ──
{
  const emptyA = A.classes.filter((c) => !(A.classMembers.get(c) || []).length).map((c) => c.label);
  const emptyB = B.classes.filter((c) => !(B.classMembers.get(c) || []).length && !(B.classMembersExt.get(c) || []).length).map((c) => c.label);
  ck('분류 33개 중 핵심만으로는 성분이 없는 분류가 있고(ACE 억제제·베타차단제), 확장 수록을 더하면 모든 분류에 성분이 있음', A.classes.length === 33 && emptyA.includes('ACE 억제제') && emptyA.includes('베타차단제') && emptyB.length === 0, { emptyA, emptyB });
  const k = B.searchClass('PPI')[0];
  ck('searchClass("PPI"): 핵심 3개(members) + 확장(extMembers) 따로 돌려줌, 확장 쪽에 핵심 성분이 섞이지 않음', k.members.length === 3 && k.extMembers.length >= 1 && k.extMembers.every((v) => !B.byId.has(v.id)) && [OME, ESO, PAN].every((id) => k.members.some((v) => v.id === id)));
}

// ── ⑨ 출처·이용 조건 (provenance · provenanceStats · attribution) ──
{
  const P = B.provenance(ATV), S = B.provenanceStats(), AT = B.attribution();
  const NLM = 'This product uses publicly available data from the U.S. National Library of Medicine (NLM), National Institutes of Health, Department of Health and Human Services; NLM is not responsible for the product and does not endorse or recommend this or any other product.';
  ck('provenance: 확장 자료가 없으면 null · 확장에 없는 ID 도 null · provenanceStats 도 null', A.provenance(ATV) === null && B.provenance('MT:VTM:0') === null && B.provenance('') === null && A.provenanceStats() === null);
  ck('provenance(아토르바스타틴): 출처 R·H·W·A 와 식별자(RxCUI · 심평원 일반명코드 전체 · Wikidata)', same(P.sources.map((s) => s.id), ['R', 'H', 'W', 'A']) && P.ids.rxcui === '83367' && P.ids.hira_codes.length > 0 && P.ids.hira_codes.every((c) => /^[0-9A-Z]{6}[A-Z]{3}$/.test(c)) && /^Q\d+$/.test(P.ids.wd), P.ids);
  ck('provenance: 이용 조건 태그 3종이 구분되고 ATC 만 재배포 미결정(pending)', P.license_tags.includes('NLM 공개(표기 필요)') && P.license_tags.includes('공공누리 제1유형') && P.license_tags.includes('CC0') && P.pending.join() === 'A', [P.license_tags, P.pending]);
  ck('provenance: 원자료 주소(RxNav 속성 JSON · data.go.kr 두 파일 · Wikidata 항목)', P.urls.includes('https://rxnav.nlm.nih.gov/REST/rxcui/83367/properties.json') && P.urls.includes('https://www.data.go.kr/data/15067461/fileData.do') && P.urls.includes('https://www.data.go.kr/data/15067462/fileData.do') && P.urls.some((u) => u.startsWith('https://www.wikidata.org/wiki/Q')), P.urls);
  ck('provenance: 받은 날 형식 · review_status=draft · 누락 없음', /^\d{4}-\d{2}-\d{2}$/.test(P.retrieved_at) && P.review_status === 'draft' && P.missing.length === 0, [P.retrieved_at, P.missing]);
  ck('provenance: 심평원 자료 시점 두 개가 따로 적힘(의약품주성분 2025-10-31 · 의약품표준코드 2026-08-31)', (() => { const h = P.sources.find((s) => s.id === 'H'); return h.asof.length === 2 && h.asof[0].endsWith('2025-10-31') && h.asof[1].endsWith('2026-08-31'); })());
  ck('provenance(에페리손, 심평원 전용): RxCUI·Wikidata 출처 없이 H 와 A 만, 누락 없음, 일반명코드가 식별자', (() => { const q = B.provenance(EPE); return same(q.sources.map((s) => s.id), ['H', 'A']) && q.ids.rxcui === null && q.ids.hira_codes.length > 0 && q.missing.length === 0; })());
  ck('provenance: 핵심 사전과 겹치는 항목(오메프라졸)도 확장 쪽 기록의 출처를 돌려줌', (() => { const q = B.provenance(OME); return q && q.ids.rxcui === '7646' && q.sources.length >= 2 && q.missing.length === 0; })());
  ck('provenanceStats: 전체 항목 수 · 누락 0 · 출처별 건수가 레코드의 src 글자와 같음 · 일반명코드 항목 수가 meta 와 같음', S.total === ext.entities.length && S.missing === 0 && S.bySource.R === ext.entities.filter((e) => /R/.test(e.src)).length && S.bySource.H === ext.entities.filter((e) => /H/.test(e.src)).length && S.bySource.W === ext.entities.filter((e) => /W/.test(e.src)).length && S.withHiraCodes === ext.meta.counts.with_hira_codes, S);
  ck('provenanceStats: 두 번 불러도 같은 결과(캐시)', B.provenanceStats() === S);
  ck('attribution: NLM 영문 고지문이 NLM 약관이 요청한 문장 그대로이고, 한국어 풀이는 공식 문구가 아니라고 밝힘', AT.nlm_en === NLM && AT.nlm_ko.includes('공식 문구는 영문'));
  ck('attribution: 공공누리 제1유형 표기에 기관 · 자료명 · 자료 날짜 · 내려받는 곳이 있음', /건강보험심사평가원/.test(AT.kogl) && /의약품주성분/.test(AT.kogl) && /2025-10-31/.test(AT.kogl) && /2026-08-31/.test(AT.kogl) && /data\.go\.kr/.test(AT.kogl) && AT.sources.length === 3 && /CC0/.test(AT.wikidata), AT.kogl);
  ck('attribution: 확장 자료가 없으면 NLM 문구만(공공누리 표기 없음)', A.attribution().kogl === null && A.attribution().nlm_en === NLM && same(A.attribution().sources, ['미국 NLM RxNorm(RxNav)']));
  ck('attribution: NLM 이름을 보증처럼 쓰지 않음(NLM 로고·후원 표현 없음)', !/sponsor|endorsed by NLM|official NLM/i.test(JSON.stringify(AT)));
}

// ── ⑧ 속도(넉넉한 한도) ──
{
  const t1 = Date.now(); for (let i = 0; i < 200; i++) B.searchExt(['에페리손', '암브록솔', 'PPI', 'M03BX09', '리피토'][i % 5]); const sMs = Date.now() - t1;
  const t2 = Date.now(); for (let i = 0; i < 20; i++) B.verify('오메프라졸과 에페리손염산염을 함께 쓰면 안전합니다. ATC 코드는 M03BX09입니다. 암브록솔과 아토르바스타틴 20mg도 있습니다.'); const vMs = Date.now() - t2;
  ck(`속도: 사전 만들기 ${buildMs}ms(한도 10초) · 확장 검색 200회 ${sMs}ms(한도 5초) · 검증 20회 ${vMs}ms(한도 5초)`, buildMs < 10000 && sMs < 5000 && vMs < 5000);
}

console.log(`\n${total}개 중 ${total - bad}개 통과` + (bad ? `, ${bad}개 실패` : ' — 모두 통과'));
process.exit(bad ? 1 : 0);
