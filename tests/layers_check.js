// MedTerm-KR 추가 자료 점검(읽기 전용) — node tests/layers_check.js
// ① data/medterm_new.json (최신 승인·임상·화합물 연결)  ② data/medterm_kr_products.json (국내 제품 계층)  ③ web/js/layers.js (두 층을 읽는 API)
// 두 자료는 핵심·확장 사전 위에 얹는 별도 층이다. 자료가 없거나 이상해도 core.js 는 이전과 똑같이 동작해야 한다.
// 실패가 있으면 종료 코드 1. 실패가 아닌 "주의"는 끝에 따로 적는다.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const rj = (p) => JSON.parse(rd(p));
const { MedTerm } = require(path.join(root, 'web/js/core.js'));
const { Layers, PHASE_RANK } = require(path.join(root, 'web/js/layers.js'));

let pass = 0, fail = 0; const warns = [];
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log('FAIL', m, extra ?? ''); } };
const warn = (m) => warns.push(m);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameObj = (a, b) => { const k = (o) => JSON.stringify(Object.keys(o).sort().map((x) => [x, o[x]])); return k(a) === k(b); };   // 키 순서와 무관하게 같은 객체인지

const core = rj('data/medterm.json'), cls = rj('data/class_lexicon.json'), ext = rj('data/medterm_ext.json');
const N = rj('data/medterm_new.json'), P = rj('data/medterm_kr_products.json'), LEX = rj('data/product_lexicon.json');
const mt = new MedTerm(core, cls, ext);
const allIds = new Set([...core.concepts.map((c) => c.id), ...ext.entities.map((e) => e.id)]);

// ───────────── ① 최신 승인·임상·화합물 ─────────────
const NM = N.meta, NC = NM.counts;
ok(['meta', 'novel', 'tr', 'ch', 'sk', 'sim', 'ent'].every((k) => k in N), '새 자료 최상위 키(meta·novel·tr·ch·sk·sim·ent)');
ok(NM.review_status === 'draft' && typeof NM.notice === 'string' && NM.notice.includes('초안'), '새 자료는 초안 표시와 안내문을 가짐');
ok(NM.sources.length === 3 && NM.sources.every((s) => s.id && s.name && s.license && s.license_tag && s.license_class && s.credit && s.url), '출처 3곳(FDA·ClinicalTrials.gov·PubChem)에 이용 조건·출처 표기·주소가 있음');
ok(same(NM.sources.map((s) => s.id), ['F', 'T', 'P']), '출처 식별자 F·T·P');
ok(NC.novel === N.novel.length && NC.trials === Object.keys(N.tr).length && NC.chem === Object.keys(N.ch).length && NC.skeleton_groups === Object.keys(N.sk).length && NC.sim === Object.keys(N.sim).length && NC.linked_names === Object.keys(N.ent).length, 'meta.counts 가 실제 건수와 같음', NC);
ok(NC.novel_linked === N.novel.filter((x) => x.e).length && NC.novel_with_trials === N.novel.filter((x) => N.tr[x.k]).length, '신약의 사전 연결·임상 있음 건수가 같음');
ok(NC.trials_capped === Object.values(N.tr).filter((t) => t.cap).length, '임상 상한 도달 건수가 같음');
ok(sameObj(NC.chem_how, Object.values(N.ch).reduce((o, c) => { o[c.how] = (o[c.how] || 0) + 1; return o; }, {})), '화합물 연결 방식별 건수가 같음');

// FDA 신약
ok(N.novel.length >= 200, `FDA 신약 승인 항목이 충분함(2021년~): ${N.novel.length}`);
ok(N.novel.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.d) && x.d.slice(0, 4) === String(x.y) && x.y >= 2021 && x.b && x.g && x.u && x.k && Number.isInteger(x.no)), '신약 항목: 승인일(YYYY-MM-DD)·연도·상표·성분·용도·열쇠·번호');
ok(N.novel.every((x) => x.k === x.k.toLowerCase()), '신약 열쇠는 소문자');
ok(N.novel.every((x) => !x.e || allIds.has(x.e)), '신약의 사전 연결 ID 가 실제 사전 항목');
ok(N.novel.every((x, i) => i === 0 || (N.novel[i - 1].d > x.d) || (N.novel[i - 1].d === x.d && N.novel[i - 1].no >= x.no)), '신약 목록이 승인일 내림차순');
ok(new Set(N.novel.map((x) => x.y + '#' + x.no)).size === N.novel.length, '같은 연도·번호가 두 번 나오지 않음');
ok(Math.max(...N.novel.map((x) => x.y)) >= 2026, '가장 최근 승인 연도가 2026 이상(받은 날 기준 최신)');

// 임상 요약
const PH = new Set(Object.keys(NM.phase_legend)), ST = new Set(Object.keys(NM.status_legend));
const trs = Object.entries(N.tr);
ok(trs.every(([k, t]) => k === k.toLowerCase() && t.n > 0 && typeof t.cap === 'boolean'), '임상 요약: 열쇠 소문자·건수 양수·cap 불리언');
ok(trs.every(([, t]) => Object.keys(t.ph).every((p) => PH.has(p)) && Object.keys(t.st).every((s) => ST.has(s))), '임상 단계·상태 값이 범례 안에 있음');
ok(trs.every(([, t]) => Object.values(t.st).reduce((a, b) => a + b, 0) === Math.min(t.n, 1000) && Object.values(t.ph).reduce((a, b) => a + b, 0) === Math.min(t.n, 1000)), '상태별·단계별 건수의 합이 가져온 시험 수(상한 1,000)와 같음(겹쳐 세지 않음)');
ok(trs.every(([, t]) => (t.ex || []).every((e) => /^NCT\d{8}$/.test(e.id) && e.t && e.ph && e.st)), '예시 시험은 NCT 번호·제목·단계·상태가 있음');
ok(trs.every(([, t]) => (t.ex || []).length <= 5), '예시 시험은 최대 5건');
ok(trs.every(([, t]) => !t.cap || t.n >= 1000 || Object.values(t.st).reduce((a, b) => a + b, 0) === t.n), '상한 도달(cap)이면 건수가 1,000 이상이거나(이름이 너무 흔한 낱말이라 검색이 넓어 쪽 상한에서 멈춘 드문 경우) 요약한 건수와 같은 하한값');
ok(trs.filter(([, t]) => t.cap && t.n < 1000).length <= 5, '쪽 상한에서 멈춘 하한값(cap 인데 1,000 미만)은 드묾(5개 이하)');
ok(trs.every(([, t]) => !t.ls || /^\d{4}-\d{2}$/.test(t.ls)) && trs.every(([, t]) => !t.np || /^\d{4}-\d{2}$/.test(t.np)), '시기 값은 YYYY-MM');
ok(trs.every(([, t]) => t.ind <= t.n), '산업체 주관 건수가 총 건수 이하');
ok(Math.max(...trs.map(([, t]) => t.n)) >= 1000, '등록이 매우 많은 성분(상한 도달)이 실제로 있음');

// 화합물
const chs = Object.entries(N.ch);
ok(chs.every(([k, c]) => k === k.toLowerCase() && Number.isInteger(c.cid) && c.cid > 0 && /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/.test(c.ik) && (c.how === 'exact' || c.how === 'single')), '화합물: 열쇠·CID·InChIKey 형식·연결 방식');
ok(chs.every(([, c]) => !c.mw || Number(c.mw) > 0), '분자량은 양수');
const skOk = Object.entries(N.sk).every(([ik, ks]) => ks.length >= 2 && ks.every((k) => N.ch[k] && N.ch[k].ik.slice(0, 14) === ik));
ok(skOk, '같은 골격 묶음: 2개 이상이며 모두 InChIKey 앞 14자가 같음');
ok(Object.entries(N.sim).every(([k, nb]) => N.ch[k] && nb.length > 0 && nb.length <= 6 && nb.every((o) => N.ch[o] && N.ch[o].ik.slice(0, 14) !== N.ch[k].ik.slice(0, 14) && o !== k)), '구조 유사 이웃: 자기 자신·같은 골격이 아니며 모두 화합물 연결이 있음');
ok(Object.entries(N.ent).every(([k, id]) => k === k.toLowerCase() && allIds.has(id)), '이름→사전 항목 연결(ent): 모두 실제 항목');
// 이름 연결은 정확 일치만: 연결된 항목의 영문 이름(또는 별칭)이 열쇠와 같아야 한다
const byIdAny = (id) => mt.anyById(id);
const labelOk = Object.entries(N.ent).every(([k, id]) => { const v = byIdAny(id); if (!v) return false; const names = [v.label_en, ...(v.alt_en || [])].map((s) => String(s || '').toLowerCase()); return names.includes(k); });
ok(labelOk, '이름 연결은 영문 이름·별칭이 열쇠와 정확히 같을 때만', Object.entries(N.ent).filter(([k, id]) => { const v = byIdAny(id); return !v || ![v.label_en, ...(v.alt_en || [])].map((s) => String(s || '').toLowerCase()).includes(k); }).slice(0, 5));
ok(N.novel.filter((x) => x.e).every((x) => N.ent[x.k] === x.e || Object.values(N.ent).includes(x.e)), '신약의 사전 연결이 ent 와 어긋나지 않음');
if (N.unq) warn(`임상·화합물 조회가 끝나지 않은 이름이 있음(임상 ${N.unq.tr.length} · 화합물 ${N.unq.ch.length}) — 수집이 끝난 뒤 다시 만드세요`);
else ok(NC.trials_queried === NC.names && NC.chem_queried === NC.names, '모든 성분 이름을 조회함(임상·화합물)', [NC.trials_queried, NC.chem_queried, NC.names]);
if (NC.sim === 0) warn('구조 유사 이웃(sim)이 비어 있음 — new_fetch.py --only sim 을 돌린 뒤 다시 만드세요');

// ───────────── ② 국내 제품 ─────────────
const PM = P.meta, PC = PM.counts, rows = P.p;
ok(['meta', 'co', 'atc', 'sp', 'fm', 'un', 'ing', 'ing_ent', 'cd', 'cmp', 'p'].every((k) => k in P), '제품 자료 최상위 키');
ok(PM.review_status === 'draft' && PM.notice.includes('대체조제') && PM.notice.includes('약사법 제27조'), '제품 자료는 초안 표시와 대체조제 비판정 안내를 가짐');
ok(PM.sources.length === 1 && PM.sources[0].license_tag === '공공누리 제1유형' && PM.sources[0].credit === '건강보험심사평가원', '제품 출처는 심평원(공공누리 제1유형)');
ok(PM.files.hira_std && PM.files.hira_std.file_date && PM.files.hira_ing && PM.files.hira_ing.portal, '두 원자료의 기준일(파일명·포털 자료명)이 기록됨');
ok(rows.length === PC.products, '제품 수가 meta.counts.products 와 같음', [rows.length, PC.products]);
ok(rows.every((r) => r.length === 10), '제품 한 줄은 10칸');
ok(rows.every((r) => typeof r[0] === 'string' && /^\d{9}$/.test(r[0]) && typeof r[1] === 'string' && r[1].length > 0), '품목기준코드 9자리 숫자 문자열과 품목명');
ok(rows.every((r) => Number.isInteger(r[2]) && r[2] >= 0 && r[2] < P.co.length), '업체 색인이 범위 안');
ok(rows.every((r) => r[3] === 0 || r[3] === 1), '구분은 0(전문)·1(일반)');
const codeOk = (g) => g === -1 || (Number.isInteger(g) && g >= 0 && g < P.cd.length);
ok(rows.every((r) => Array.isArray(r[4]) ? r[4].length >= 2 && r[4].every((g) => codeOk(g) && g !== -1) : codeOk(r[4])), '일반명코드 색인(-1·정수·정수 배열)이 범위 안');
ok(rows.every((r) => r[5] === -1 || (Number.isInteger(r[5]) && r[5] < P.atc.length)), 'ATC 색인이 범위 안');
ok(rows.every((r) => Number.isInteger(r[7]) && r[7] >= 0 && r[7] <= 4) && rows.every((r) => r[9] === -1 || r[9] < P.sp.length), '한약 추정 규칙(0~4)·특수관리 색인이 범위 안');
ok(rows.every((r) => r[6] === 0 || (Number.isInteger(r[6]) && r[6] >= 190001 && r[6] <= 209912)), '허가년월은 YYYYMM 또는 0');
const keySet = new Set(rows.map((r) => r[0] + '\u0001' + r[1] + '\u0001' + r[2]));
ok(keySet.size === rows.length, '제품 열쇠(품목기준코드+품목명+업체)가 겹치지 않음', [keySet.size, rows.length]);
ok(new Set(rows.map((r) => r[0])).size === PC.distinct_item_codes, '품목기준코드 수가 meta 와 같음');
ok(PC.distinct_item_codes < rows.length, '코드는 제품 열쇠가 아님: 같은 코드를 쓰는 제품이 실제로 있음(코드 수 < 제품 수)', [PC.distinct_item_codes, rows.length]);
ok(PC.rx === rows.filter((r) => r[3] === 0).length && PC.otc === rows.filter((r) => r[3] === 1).length && PC.rx + PC.otc === PC.products, '전문·일반 건수가 같음');
ok(PC.herbal_guess === rows.filter((r) => r[7] > 0).length, '한약 추정 건수가 같음');
ok(same(Object.fromEntries([1, 2, 3, 4].map((k) => [k, rows.filter((r) => r[7] === k).length])), PM.herbal_by_rule === undefined ? PC.herbal_by_rule : PC.herbal_by_rule), '규칙별 한약 추정 건수가 같음');
ok(PC.companies === new Set(rows.map((r) => r[2])).size && PC.companies === P.co.length, '업체 수가 같음(미사용 업체가 목록에 없음)');
ok(PC.with_code === rows.filter((r) => Array.isArray(r[4]) || r[4] >= 0).length && PC.with_atc === rows.filter((r) => r[5] >= 0).length, '성분 구성·ATC 있는 제품 수가 같음');
ok(PC.multi_code_products === rows.filter((r) => Array.isArray(r[4])).length, '일반명코드가 여럿인 제품 수가 같음');
ok(P.cmp.every((c) => Number.isInteger(c[0]) && c[0] < P.fm.length && c[1].length > 0 && c[1].every((x) => x[0] < P.ing.length && x[2] < P.un.length)), '성분 구성 표: 제형·성분·단위 색인이 범위 안');
ok(P.cmp.length === P.cd.length, '성분 구성 표와 일반명코드 목록의 길이가 같음');
ok(Object.entries(P.ing_ent).every(([ix, id]) => Number(ix) < P.ing.length && allIds.has(id)), '성분→사전 연결(ing_ent)은 실제 사전 항목');
// 취소·한약재·원료 제외 확인: 이름만으로 보이는 흔한 한약재/원료 표기가 섞이지 않았는지 표본 점검
ok(!rows.some((r) => /^(감초|당귀|황기|인삼)$/.test(r[1])), '한약재 단품(감초·당귀·황기·인삼)이 제품에 섞이지 않음');
// 한약 추정: 규칙 1 은 정확한 형태
const R1 = /(탕|산|환|단|음|고|전)(가[^()]*)?(건조|연조|유동)?엑스(과립|세립|산|정|캡슐|액|환|시럽)?/;
ok(rows.filter((r) => r[7] === 1).every((r) => R1.test(r[1])), '규칙 1 로 표시된 제품 이름이 모두 규칙 형태');
ok(rows.filter((r) => r[7] === 0 && R1.test(r[1]) && !/반창고|플라스타|파스/.test(r[1])).length === 0, '규칙 1 에 맞는 이름이 한약 추정에서 빠지지 않음', rows.filter((r) => r[7] === 0 && R1.test(r[1])).slice(0, 3).map((r) => r[1]));
// 사용자가 말한 이름
const hasName = (s) => rows.some((r) => r[1].includes(s));
for (const nm of ['메카인', '키미테', '메피론', '니라마이드', '반하사심탕', '링거라이트']) ok(hasName(nm), `제품 자료에 ‘${nm}’이 들어 있음`);
// 안내 문구와 자료의 일치(문구가 거짓이 되지 않게)
ok(!rows.some((r) => r[1].includes('숙취')), '‘숙취’가 든 허가 제품이 없다는 안내 문구와 일치');
ok(rows.some((r) => r[1].includes('링거') && P.atc[r[5]] === 'A07CA' && r[1] === '링거라이트액'), '링거 안내 문구의 예(링거라이트액, ATC A07CA)가 자료에 있음');
ok(rows.some((r) => r[1].includes('링거')), '이름에 ‘링거’가 든 제품이 있음(‘없다’는 오안내 방지)');
ok(rows.filter((r) => r[1].includes('링거')).length < rows.filter((r) => String(P.atc[r[5]] || '').startsWith('B05')).length, '링거 이름 제품은 수액(B05) 전체보다 적음(안내 문구: 소수)');

// 묶음·증상어·안내(수작업 초안)
const G = PM.groups;
ok(same(G, LEX.groups) && same(PM.symptoms, LEX.symptoms) && same(PM.notes, LEX.notes), '자료 안의 묶음·증상어·안내가 data/product_lexicon.json 과 같음');
ok(G.length <= 30 && new Set(G.map((g) => g.id)).size === G.length, '묶음 id 가 겹치지 않음(비트 마스크 31개 이내)');
ok(G.every((g) => g.atc.length > 0 && g.atc.every((a) => /^[A-V][0-9A-Z]{0,4}$/.test(a))), '묶음의 ATC 앞부분 형식');
ok(PM.symptoms.every((s) => s.kw.length > 0 && s.groups.every((id) => G.some((g) => g.id === id))), '증상어가 가리키는 묶음이 실제로 있음');
ok(PM.notes.every((n) => n.kw.length > 0 && n.text.length > 20), '안내 문구에 낱말과 본문이 있음');
ok(LEX._provenance.includes('수작업 초안') || LEX._provenance.includes('manual draft'), '묶음·증상어 표는 수작업 초안이라고 밝힘');
for (const g of G) ok(rows.some((r) => g.atc.some((a) => String(P.atc[r[5]] || '').startsWith(a))), `묶음 ‘${g.label}’에 제품이 하나 이상 있음`);

// ───────────── ③ Layers API ─────────────
const none = new Layers(mt, null, null);
ok(!none.hasNew && !none.hasProducts && none.forEntity('MT:VTM:7646') === null && none.searchProducts({ q: '메카인' }).total === 0 && none.productsOfEntity('MT:VTM:7646') === null && none.hints('감기').groups.length === 0, '자료를 주지 않으면 모든 API 가 빈 결과(오류 없음)');
for (const [label, bad] of [['빈 객체', {}], ['novel 이 문자열', { novel: 'x' }], ['p 가 문자열', { p: 'x' }]]) {
  let err = null, L; try { L = new Layers(mt, bad, bad); L.searchProducts({ q: 'a' }); L.forEntity('x'); L.searchNovel('abc'); } catch (e) { err = String(e); }
  ok(!err, `이상한 자료(${label})를 줘도 오류 없음`, err);
}
const L = new Layers(mt, N, P);
ok(L.hasNew && L.hasProducts && L.productCount === rows.length, 'Layers 가 두 자료를 읽음');
const ms = (f) => { const t = Date.now(); const r = f(); return [r, Date.now() - t]; };

// 제품 검색
let [r, t] = ms(() => L.searchProducts({ q: '메카인', limit: 50 }));
ok(r.total >= 2 && r.items.every((i) => L.product(i).name.includes('메카인') || L.compositionOf(i).some((c) => c.rows.some((x) => /meclizine/i.test(x.name)))), '‘메카인’ 검색: 이름 또는 성분(메클리진)이 맞는 제품만');
ok(r.items.some((i) => L.product(i).name === '메카인정'), '‘메카인’ 검색에 메카인정이 있음');
[r, t] = ms(() => L.searchProducts({ q: '반하사심탕', limit: 200 }));
ok(r.total >= 30 && r.items.every((i) => L.product(i).name.includes('반하사심탕')), '‘반하사심탕’ 검색: 이름에 든 제품', r.total);
ok(r.items.filter((i) => L.product(i).herbal).length / r.items.length > 0.9, '반하사심탕 제품은 대부분 한약제제(추정)로 표시됨');
const kim = L.searchProducts({ q: '키미테', limit: 20 });
ok(kim.total >= 3 && kim.items.some((i) => L.compositionOf(i).some((c) => c.rows.some((x) => /scopolamine/i.test(x.name)))), '‘키미테’ 검색: 스코폴라민 제품 포함');
ok(L.searchProducts({ q: '포타스티오다정' }).total === 0 && L.searchProducts({ q: '백소나인정' }).total === 0, '철자를 확인해야 하는 두 이름은 자료에 없음(없으면 없다고 나옴)');
// 필터 조합이 독립 계산과 같다
const expect = (f) => rows.filter(f).length;
ok(L.searchProducts({ kind: 0, limit: 1 }).total === expect((x) => x[3] === 0), '전문의약품 필터 건수');
ok(L.searchProducts({ kind: 1, herbal: true, limit: 1 }).total === expect((x) => x[3] === 1 && x[7] > 0), '일반의약품 + 한약제제 필터 건수');
const gIn = (ids) => (x) => { const a = String(P.atc[x[5]] || ''); return ids.some((id) => G.find((g) => g.id === id).atc.some((p) => a.startsWith(p))); };
ok(L.searchProducts({ group: 'cold', limit: 1 }).total === expect(gIn(['cold'])), '묶음(감기) 건수가 ATC 앞부분 규칙과 같음');
ok(L.searchProducts({ group: ['cold', 'pain'], limit: 1 }).total === expect(gIn(['cold', 'pain'])), '묶음 여러 개(배열)는 합집합');
ok(L.searchProducts({ group: ['cold', 'pain'], limit: 1 }).total > L.searchProducts({ group: 'cold', limit: 1 }).total, '합집합이 한 묶음보다 큼');
ok(L.searchProducts({ group: 'nope', limit: 1 }).total === rows.length, '없는 묶음 id 는 거르지 않음');
const coIx = rows[0][2];
ok(L.searchProducts({ co: coIx, limit: 1 }).total === expect((x) => x[2] === coIx) && L.productsOfCompany(coIx).length === expect((x) => x[2] === coIx), '업체 필터 건수');
ok(L.searchProducts({ q: '', limit: 5 }).items.length === 5 && L.searchProducts({ q: '', limit: 5, offset: 5 }).items.every((i) => !L.searchProducts({ q: '', limit: 5 }).items.includes(i)), '빈 검색의 쪽 나누기(offset)');
ok(t < 1500, `검색 한 번이 1.5초 안(실제 ${t}ms)`, t);
const [, t2] = ms(() => { for (let k = 0; k < 5; k++) L.searchProducts({ q: '정', limit: 1 }); });
ok(t2 < 5000, `흔한 낱말 5회 검색 5초 안(실제 ${t2}ms)`, t2);

// 증상어·안내
const hc = L.hints('감기');
ok(same(hc.groups.map((g) => g.id).sort(), ['cold', 'pain']) && hc.notes.length === 0, '‘감기’ → 감기·기침·코 + 해열·진통 묶음, 안내 없음');
const hh = L.hints('숙취해소');
ok(hh.groups.length === 0 && hh.notes.length >= 1 && hh.notes[0].includes('건강기능식품'), '‘숙취해소’ → 묶음 없이 건강기능식품 안내');
const hr = L.hints('링거');
ok(hr.groups.some((g) => g.id === 'fluid') && hr.notes.length >= 1, '‘링거’ → 수액 묶음 + 안내');
ok(L.hints('').groups.length === 0 && L.hints('   ').notes.length === 0, '빈 질의는 힌트 없음');

// 대체 후보(같은 일반명코드)
const withAlt = rows.findIndex((x, i) => { const gs = L.codesOf(i); return gs.length === 1 && L._ensureHay() === undefined && (L._codeProducts.get(gs[0]) || []).length >= 3; });
ok(withAlt >= 0, '같은 일반명코드를 쓰는 제품이 3건 이상인 예가 있음');
const alts = L.alternatives(withAlt, 5);
ok(alts.length === 1 && alts[0].items.length <= 5 && alts[0].items.every((j) => j !== withAlt && L.codesOf(j).includes(L.codesOf(withAlt)[0])), '대체 후보: 자기 자신 제외, 모두 같은 일반명코드');
ok(alts[0].total === (L._codeProducts.get(L.codesOf(withAlt)[0]) || []).length - 1, '대체 후보 총건수');
// 사전 성분 → 제품
const acet = mt.search('acetaminophen')[0].vtm.id;
const pe = L.productsOfEntity(acet, 6);
ok(pe && pe.total > 100 && pe.single > 0 && pe.single <= pe.total && pe.companies > 5 && pe.items.length === 6, '아세트아미노펜: 제품·단일 성분·업체 수');
ok(pe.items.every((i) => L.compositionOf(i).some((c) => c.rows.some((x) => x.ent === acet))), '성분 연결된 제품은 실제로 그 성분을 가짐');
ok(L.productsOfEntity('MT:VTM:0') === null, '없는 성분은 null');
// 신약·임상·화합물
const nv = N.novel.find((x) => x.e && N.tr[x.k]);
const fe = L.forEntity(nv.e);
ok(fe && fe.novel.some((x) => x.no === nv.no && x.y === nv.y) && fe.tr && fe.stage && fe.stage.total === fe.tr.n, '신약 항목: 사전 성분에서 신약·임상 요약·단계가 나옴');
const fk = L.forKey(nv.k);
ok(fk.novel.length >= 1 && fk.stage.top === L.trialStage(N.tr[nv.k]).top, '이름 열쇠로도 같은 정보');
ok(L.novelList({ year: 2026 }).every((x) => x.y === 2026) && L.novelList({}).length === N.novel.length && L.novelList({ linked: true }).every((x) => x.e), '신약 목록 필터(연도·사전 연결)');
ok(L.novelYears()[0] === Math.max(...N.novel.map((x) => x.y)), '신약 연도 목록은 최신 연도부터');
ok(L.searchNovel('ab').length === 0 && L.searchNovel(nv.b.slice(0, 5)).some((x) => x.no === nv.no), '신약 이름 검색(3글자 이상)');
// 임상 진행·예정 성분 목록(pipelineList): 독립 계산과 같은 건수·정렬, 토글 효과
const liveKeys = Object.keys(N.tr).filter((k) => ((N.tr[k].st.act || 0) + (N.tr[k].st.nyr || 0)) > 0);
ok(L.pipelineList({}).length === liveKeys.length, '진행·예정 전체 건수가 독립 계산과 같음', [L.pipelineList({}).length, liveKeys.length]);
const p3 = liveKeys.filter((k) => N.tr[k].ph['3'] || N.tr[k].ph['2/3']);
ok(L.pipelineList({ filter: 'p3' }).length === p3.length && L.pipelineList({ filter: 'p3', industry: true, hideCommon: true }).length === p3.filter((k) => N.tr[k].ind && !N.tr[k].cap).length, '3상(+산업체 · 흔한 약 제외) 건수');
ok(L.pipelineList({ filter: 'nyr' }).length === liveKeys.filter((k) => N.tr[k].st.nyr).length, '모집 예정 건수');
const pl = L.pipelineList({ hideCommon: true });
ok(pl.every((x) => !x.t.cap) && pl.every((x, i) => i === 0 || (pl[i - 1].t.ls || '') >= (x.t.ls || '')), '흔한 약 제외 + 최근 시작 순 정렬(시작 시기가 없는 것은 맨 뒤)');
ok(L.pipelineList({ hideKr: true }).length < L.pipelineList({}).length && L.pipelineList({ hideKr: true }).every((x) => !x.e || !((mt.extById.get(x.e) || {}).rec || {}).kr), '국내 등재 성분 제외');
const fixed = L.pipelineList({ filter: 'recent', today: '2026-11' });
ok(fixed.every((x) => x.t.ls >= '2025-11') && fixed.length < L.pipelineList({}).length, '최근 12개월 이후 시작(기준 달을 정해 주면 그 기준)');
ok(none.pipelineList({}).length === 0, '자료가 없으면 빈 목록');
// 등록소의 비현실적인 시작 달(2099 등)은 비움
const lim = (() => { const y = Number(NM.built_at.slice(0, 4)) + 5; return `${y}-${NM.built_at.slice(5, 7)}`; })();
ok(Object.values(N.tr).every((t) => !t.ls || t.ls <= lim), `가장 늦은 시작 달이 모두 ${lim} 이하(입력 오류 제거)`, Object.entries(N.tr).filter(([, t]) => t.ls && t.ls > lim).map(([k, t]) => [k, t.ls]).slice(0, 4));
ok(typeof NC.start_dates_dropped === 'number', 'meta 에 비운 시작 달 건수가 있음');
// 단계 순서·요약
const synth = L.trialStage({ n: 10, cap: false, ph: { '1': 3, '2': 4, '3': 1, NA: 2 }, st: { act: 4, nyr: 1, done: 4, stop: 1 }, ind: 6 });
ok(synth.top === '3' && synth.phases[0].phase === '3' && synth.active === 4 && synth.planned === 1 && synth.done === 4 && synth.stopped === 1 && synth.industry === 6, '임상 요약: 가장 앞선 단계·상태 건수', synth);
ok(L.trialStage({ n: 1, ph: { NA: 1 }, st: {} }).top === 'NA' && L.trialStage({ n: 1, ph: {}, st: {} }).top === null && L.trialStage(null) === null, '단계가 없거나 해당 없음일 때');
ok(PHASE_RANK['4'] > PHASE_RANK['3'] && PHASE_RANK['3'] > PHASE_RANK['2/3'] && PHASE_RANK['2/3'] > PHASE_RANK['2'] && PHASE_RANK['2'] > PHASE_RANK['1/2'] && PHASE_RANK['1/2'] > PHASE_RANK['1'], '단계 순위');
ok(L.phaseLabel('4').includes('허가 후') && L.phaseLabel('2/3') === '2/3상' && L.phaseLabel('NA').includes('해당 없음'), '단계 라벨');
// 같은 골격·유사 이웃
const skKey = Object.values(N.sk)[0] ? Object.values(N.sk)[0][0] : null;
if (skKey) { const lk = L.linksOf(skKey); ok(lk.skeleton.length >= 1 && lk.skeleton.every((x) => x.key !== skKey && N.ch[x.key].ik.slice(0, 14) === N.ch[skKey].ik.slice(0, 14)), '같은 골격 연결: 자기 자신 제외·앞 14자 일치'); }
// ATC 경로
ok(L.atcPath('N02BE01').length >= 2 && L.atcPath('N02BE01')[0].code === 'N', 'ATC 경로');
ok(L.atcPath('').length === 0 && L.atcPath(null).length === 0, '빈 ATC 는 경로 없음');
// 제품 행 해석
const p0 = L.product(withAlt);
ok(p0.name && p0.co && (p0.kindLabel === '전문의약품' || p0.kindLabel === '일반의약품') && Array.isArray(p0.codes) && Array.isArray(p0.groups), '제품 객체 필드');
const comp0 = L.compositionOf(withAlt)[0];
ok(comp0.code && comp0.rows.length >= 1 && comp0.rows.every((x) => x.name && x.strength !== undefined) && L.compText(comp0).length > 0, '성분 구성 객체');
// 번들 = JSON
const bundleEq = (file, v, o) => { const m = rd(file).match(/window\.(\w+)=([\s\S]*);\s*$/); return !!m && m[1] === v && same(JSON.parse(m[2]), o); };
ok(bundleEq('web/js/medterm-new-data.js', 'MEDTERM_NEW', N), 'web/js/medterm-new-data.js 가 data/medterm_new.json 과 같음');
ok(bundleEq('web/js/medterm-products-data.js', 'MEDTERM_PRODUCTS', P), 'web/js/medterm-products-data.js 가 data/medterm_kr_products.json 과 같음');
// 핵심·확장 사전은 이 층 때문에 달라지지 않는다
const before = same(mt.search('오메프라졸').map((h) => [h.vtm.id, h.score]), new MedTerm(core, cls, ext).search('오메프라졸').map((h) => [h.vtm.id, h.score]));
ok(before && mt.extList.length === ext.meta.counts.entities - ext.meta.counts.core_overlap, '층을 만들어도 core 검색·확장 건수는 그대로');

console.log(`\n${fail ? 'FAILED' : 'OK'} — 통과 ${pass} · 실패 ${fail}` + (warns.length ? `\n주의 ${warns.length}건:\n - ${warns.join('\n - ')}` : ''));
process.exit(fail ? 1 : 0);
