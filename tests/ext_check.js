// MedTerm-KR 확장 수록 데이터 정합성 점검(읽기 전용) — node tests/ext_check.js
// data/medterm_ext.json(공개 자료로 자동 수집·연결한 초안)이 형식·건수·출처 표기를 지키는지, 번들(web/js/medterm-ext-data.js)·점검용 표와 맞는지 본다.
// 실패가 있으면 종료 코드 1. 실패가 아닌 "주의"는 끝에 따로 적는다. 핵심 사전(data_check.js)과는 독립이다.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const core = JSON.parse(rd('data/medterm.json'));
const x = JSON.parse(rd('data/medterm_ext.json'));
let pass = 0, fail = 0; const warns = [];
const ok = (c, m, extra) => { if (c) { pass++; } else { fail++; console.log('FAIL', m, extra ?? ''); } };
const warn = (m) => warns.push(m);
const E = x.entities, M = x.meta, C = M.counts;
const coreVtm = new Set(core.concepts.filter((c) => c.type === 'VTM').map((c) => c.id));

// 1) 형식·고유성
ok(Array.isArray(E) && E.length === C.entities, '건수가 meta.counts.entities 와 같음', [E.length, C.entities]);
const ids = new Set(); let dup = 0; for (const e of E) { if (ids.has(e.id)) dup++; ids.add(e.id); }
ok(dup === 0, '확장 ID 중복 없음', dup);
ok(E.every((e) => /^MT:(VTM:\d+|KRI:[a-z0-9_]+)$/.test(e.id)), 'ID 형식: MT:VTM:RxCUI 또는 MT:KRI:slug');
ok(E.every((e) => (e.id.startsWith('MT:VTM:') ? e.rxcui === e.id.slice(7) : e.rxcui == null)), 'MT:VTM 은 RxCUI 가 ID 와 같고, MT:KRI(심평원 전용)는 RxCUI 가 없음');
ok(E.every((e) => e.review_status === 'draft'), '모든 항목이 review_status=draft(약사 검수 전)');
ok(E.every((e) => typeof e.label_en === 'string' && e.label_en.length > 0 && !/[가-힣]/.test(e.label_en)), '영문 이름(label_en)이 있고 한글이 섞이지 않음', E.filter((e) => !e.label_en || /[가-힣]/.test(e.label_en)).slice(0, 3).map((e) => e.id));

// 2) 핵심 사전과의 관계: 같은 RxCUI 는 core:true 로만 겹친다
const coreMarked = E.filter((e) => e.core), overlap = E.filter((e) => coreVtm.has(e.id));
ok(coreMarked.every((e) => coreVtm.has(e.id)) && overlap.every((e) => e.core === true), 'core:true ⇔ 핵심 사전에 같은 ID 가 있음', [coreMarked.length, overlap.length]);
ok(C.core_overlap === coreMarked.length, 'meta.counts.core_overlap 이 core:true 항목 수와 같음', [C.core_overlap, coreMarked.length]);
const missingCore = [...coreVtm].filter((i) => !ids.has(i));
if (missingCore.length) warn(`핵심 성분 중 확장 자료에 없는 것 ${missingCore.length}개(국내 등재 현황 보강이 없음): ${missingCore.join(', ')}`);

// 3) 연결 등급·건수
const GR = new Set(['a', 'b', 'c', 'd', '-']);
ok(E.every((e) => GR.has(e.grade)), '연결 등급은 a·b·c·d·- 중 하나', [...new Set(E.map((e) => e.grade))]);
ok(Object.keys(M.grade_legend).every((k) => GR.has(k)) && [...GR].every((k) => M.grade_legend[k]), 'meta.grade_legend 가 모든 등급을 설명함');
const gc = {}; for (const e of E) gc[e.grade] = (gc[e.grade] || 0) + 1;
ok(JSON.stringify(Object.keys(gc).sort().map((k) => [k, gc[k]])) === JSON.stringify(Object.keys(C.grades).sort().map((k) => [k, C.grades[k]])), 'meta.counts.grades 가 실제 등급별 건수와 같음', [gc, C.grades]);
const hasKr = (e) => !!e.kr, rxId = (e) => e.id.startsWith('MT:VTM:');
ok(C.rx_mapped === E.filter((e) => rxId(e) && hasKr(e)).length, 'rx_mapped = RxNorm·심평원 모두에 있는 성분', [C.rx_mapped, E.filter((e) => rxId(e) && hasKr(e)).length]);
ok(C.rx_only === E.filter((e) => rxId(e) && !hasKr(e)).length, 'rx_only = RxNorm 에만 있는 성분');
ok(C.kr_only === E.filter((e) => !rxId(e)).length, 'kr_only = 심평원에만 있는 성분(MT:KRI)');
ok(C.rx_mapped + C.rx_only + C.kr_only === C.entities, '세 갈래 건수의 합이 전체와 같음');
ok(E.filter((e) => e.grade === '-').every((e) => rxId(e) && !hasKr(e)), "등급 '-' 는 심평원과 연결되지 않은 RxNorm 성분만");
ok(E.filter((e) => e.grade === 'd').every((e) => !rxId(e)), '등급 d 는 심평원에만 있는 성분만');
ok(E.filter((e) => e.grade === 'a').every((e) => rxId(e) && hasKr(e) && (e.atc || []).length), '등급 a 는 RxNorm·심평원 연결 + 7자리 ATC 근거가 있는 성분');
ok(C.with_ko === E.filter((e) => (e.ko || []).length).length, 'with_ko 건수가 맞음');
ok(C.with_brands === E.filter((e) => (e.brands_ko || []).length).length && C.brand_names === E.reduce((s, e) => s + (e.brands_ko || []).length, 0), 'with_brands·brand_names 건수가 맞음');
ok(C.with_atc === E.filter((e) => (e.atc || []).length).length, 'with_atc 건수가 맞음');
ok(C.with_near === E.filter((e) => (e.near || []).length).length, 'with_near 건수가 맞음');

// 4) 이름: NFKC 정규화(검색 상자가 NFKC 로 정규화하므로 사전 이름도 같은 형태여야 찾힌다) · 한글 이름 후보 형식
const nm = []; for (const e of E) { for (const k of ['label_en']) nm.push([e.id, k, e[k]]); for (const k of ['alt_en', 'ko_base', 'ko_alias', 'brands_ko']) (e[k] || []).forEach((s) => nm.push([e.id, k, s])); (e.ko || []).forEach((o) => nm.push([e.id, 'ko.n', o.n])); }
const notNfkc = nm.filter(([, , s]) => s && s.normalize('NFKC') !== s);
ok(notNfkc.length === 0, '이름이 모두 NFKC 정규화된 형태', notNfkc.slice(0, 3));
ok(E.every((e) => (e.ko || []).every((o) => o.n && /^(H|W|HW)$/.test(o.s) && (o.c == null || Number.isInteger(o.c)))), '한글 이름 후보는 {n, s: H|W|HW, c?} 형식');
ok(E.every((e) => (e.ko || []).every((o) => /[가-힣]/.test(o.n))), '한글 이름 후보에는 한글이 들어 있음', E.flatMap((e) => (e.ko || []).filter((o) => !/[가-힣]/.test(o.n)).map((o) => e.id + ':' + o.n)).slice(0, 3));
const DESC = ['미분화', '미세', '유전자재조합', '단클론항체유전자재조합', '바이알', '앰플', '프리필드', '환원형', '산화형', '라이트', '수출용', '무수물', '결정형'];
const descHit = []; for (const e of E) for (const n of [...(e.ko || []).map((o) => o.n), ...(e.ko_base || [])]) if (DESC.includes(n)) descHit.push(e.id + ':' + n);
ok(descHit.length === 0, '제품 설명어(미분화·바이알·앰플 등)가 성분 한글 이름으로 들어가지 않음', descHit.slice(0, 3));
ok(E.every((e) => (e.brands_ko || []).length <= 10), '상품명 후보는 성분당 10개 이하');
ok(E.every((e) => !(e.brands_ko || []).some((b) => b.trim() !== b || b.length < 2)), '상품명 후보는 두 글자 이상이고 앞뒤 공백이 없음');
const nameOwners = {}; for (const e of E) if (!e.core) for (const o of (e.ko || [])) (nameOwners[o.n] ??= new Set()).add(e.id);
const shared = Object.entries(nameOwners).filter(([, s]) => s.size > 1);
if (shared.length) warn(`같은 한글 이름 후보가 둘 이상의 확장 성분에 걸린 것 ${shared.length}개(검색에는 모두 나오고 답변 검증에는 쓰지 않음): ${shared.slice(0, 5).map(([n, s]) => n + '×' + s.size).join(', ')}`);

// 5) ATC: 7자리 코드 · 출처 표시 · 분류 수준 코드
const A7 = /^[A-Z]\d{2}[A-Z]{2}\d{2}$/;
ok(E.every((e) => (e.atc || []).every((c) => A7.test(c))), 'atc 는 7자리 형식(A00AA00)', E.flatMap((e) => (e.atc || []).filter((c) => !A7.test(c))).slice(0, 3));
ok(E.every((e) => (e.atc || []).every((c) => /^(H|W|HW)$/.test((e.atc_src || {})[c] || ''))), '모든 ATC 코드에 근거 출처(H|W|HW)가 표시됨');
ok(E.every((e) => Object.keys(e.atc_src || {}).every((c) => (e.atc || []).includes(c))), 'atc_src 의 코드는 모두 atc 안에 있음');
ok(E.every((e) => (e.atc_class || []).every((c) => /^[A-Z]\d{2}([A-Z]{1,2})?$/.test(c))), 'atc_class(분류 수준 코드)는 3~5자 형식');
const names = M.atc_names || {}; const used = new Set();
for (const e of E) for (const c of [...(e.atc || [])]) { used.add(c[0]); used.add(c.slice(0, 3)); used.add(c.slice(0, 4)); used.add(c.slice(0, 5)); }
const noName = [...used].filter((c) => !names[c]);
ok(noName.length <= Math.ceil(used.size * 0.01), 'ATC 1~4단계 분류명이 99% 이상 채워져 있음', noName);
if (noName.length) warn(`분류명이 없는 ATC 접두 ${noName.length}개: ${noName.join(', ')}(화면은 코드만 보여 줌)`);

// 6) 국내 등재 현황(kr): 품목 규격일 뿐 — 필드 형식
const bad = [];
for (const e of E) if (e.kr) {
  const k = e.kr;
  if (!(Number.isInteger(k.items) && k.items >= 0 && Number.isInteger(k.combo) && k.combo >= 0 && Number.isInteger(k.codes) && k.codes >= 0)) bad.push(e.id + ':count');
  if (!(Array.isArray(k.forms) && Array.isArray(k.routes) && Array.isArray(k.strengths))) bad.push(e.id + ':list');
  if (!(k.strengths.length <= 16 && k.n_strengths >= k.strengths.length)) bad.push(e.id + ':strengths');
}
ok(bad.length === 0, 'kr 필드 형식(품목 수·제형·경로·함량 목록, 함량 표시 16개 이하)', bad.slice(0, 3));
const krZero = E.filter((e) => e.kr && !e.kr.items && !e.kr.combo && !e.kr.codes);
if (krZero.length) warn(`심평원 성분 목록에는 있으나 등재 품목·성분코드 정보가 모두 0인 연결 ${krZero.length}개(화면은 "연결된 등재 품목 정보 없음"으로 표시)`);
ok(C.active_items >= 1 && C.hira_codes >= 1, '심평원 등재 품목·성분코드 수가 기록됨', [C.active_items, C.hira_codes]);

// 7) 이름이 비슷한 항목(near): 자동으로 합치지 않고 알리기만 한다
const nearBad = [];
for (const e of E) for (const n of (e.near || [])) { if (!ids.has(n.id) && !coreVtm.has(n.id)) nearBad.push(e.id + '→' + n.id); if (!(n.r >= 0.8 && n.r < 1) || !A7.test(n.atc || '') || !(e.atc || []).includes(n.atc)) nearBad.push(e.id + ':' + n.id + ':r/atc'); }
ok(nearBad.length === 0, 'near: 대상이 존재하고, 이름 유사도 0.8~1 미만이며 ATC 코드가 같음', nearBad.slice(0, 3));
ok(E.filter((e) => e.grade === 'c').every((e) => e.cand && e.cand.rxcui && e.cand.name), '등급 c 는 연결 후보(cand: rxcui·이름)를 보여 줌');

// 8) 면책·출처·라이선스 표기
ok(/약사 검수 전/.test(M.notice) && /후보/.test(M.notice) && /근거가 아닙니다/.test(M.notice), 'meta.notice 에 약사 검수 전·한글 이름은 후보·판단 근거 아님 안내');
ok(!/프로토타입/.test(JSON.stringify(M)), 'meta 에 "프로토타입" 표현 없음');
const sid = (M.sources || []).map((s) => s.id).sort().join('');
ok(sid === 'AHRW', '출처가 R(RxNorm)·H(심평원)·W(Wikidata)·A(ATC 분류명) 네 곳이고 각각 이용 조건이 적혀 있음', sid);
ok((M.sources || []).every((s) => s.name && s.use && s.license && s.url), '각 출처에 이름·사용처·이용 조건·주소가 있음');
ok(E.every((e) => /^[RHWA]+$/.test(e.src || '')) && E.every((e) => [...e.src].every((c) => M.src_legend[c])), '각 항목의 출처 글자가 meta.src_legend 에 있음');
ok(/공공누리/.test((M.sources.find((s) => s.id === 'H') || {}).license || ''), '심평원 자료 이용 조건(공공누리)이 적혀 있음');
ok(/미결정|보류/.test((M.sources.find((s) => s.id === 'A') || {}).license || ''), 'ATC 분류명은 재배포 범위 미결정으로 표시됨');

// 9) 번들(웹이 읽는 파일)이 JSON 과 같다 · 점검용 표(검토·제외 목록)
const bundle = rd('web/js/medterm-ext-data.js');
const m = /window\.MEDTERM_EXT\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(bundle);
let bundled = null; try { bundled = m && JSON.parse(m[1]); } catch (e) { /* 아래에서 실패로 센다 */ }
ok(bundled && JSON.stringify(bundled) === JSON.stringify(x), 'web/js/medterm-ext-data.js 가 data/medterm_ext.json 과 같음(build/make_bundle.py 를 다시 돌릴 필요 없음)');
const dropped = rd('data/medterm_ext_dropped.tsv').trim().split('\n'), review = rd('data/medterm_ext_review.tsv').trim().split('\n');
ok(dropped.length - 1 === C.dropped_kr_only + C.dropped_herbal, '제외 목록(medterm_ext_dropped.tsv)의 줄 수가 meta 의 제외 건수와 같음', [dropped.length - 1, C.dropped_kr_only + C.dropped_herbal]);
ok(review.length > 1 && review[0].split('\t')[0] === 'id', '검토용 표(medterm_ext_review.tsv)에 머리글과 항목이 있음', review.length);
const idx = (a, k) => a[0].split('\t').indexOf(k);
const revIds = review.slice(1).map((l) => l.split('\t')[0]);
ok(revIds.every((i) => ids.has(i)), '검토용 표의 항목은 모두 확장 자료에 있음');
ok(idx(review, 'grade') > 0 && idx(dropped, 'names') > 0, '표의 열 이름(grade·names)이 있음');

// 자료 출처 기록(provenance): 심평원 두 파일의 크기·SHA-256·포털 날짜가 적혀 있어야 한다(받은 파일과 같은 파일인지 확인할 수 있게)
const FL = M.files || {};
for (const [k, pk] of [['hira_ing', '15067461'], ['hira_std', '15067462']]) {
  const f = FL[k] || {}, p = f.portal || {};
  ok(f.pk === pk && Number.isInteger(f.bytes) && f.bytes > 1e6 && /^[0-9a-f]{64}$/.test(f.sha256 || ''), `meta.files.${k}: 자료 번호·바이트 수·SHA-256 이 있음`, f);
  ok(/_\d{8}$/.test(p.title || '') && /^\d{4}-\d{2}-\d{2}$/.test(p.registered || '') && /^\d{4}-\d{2}-\d{2}$/.test(p.modified || '') && !!p.cycle, `meta.files.${k}.portal: 자료명(끝에 날짜)·등록일·수정일·갱신 주기가 있음`, p);
}
const hSrc = (M.sources || []).find((x) => x.id === 'H') || {};
ok(Array.isArray(hSrc.files) && hSrc.files.length === 2 && hSrc.files.every((k) => FL[k]), '심평원 출처의 files 가 meta.files 의 두 항목을 가리킴', hSrc.files);
ok(FL.hira_std.file_date === '2026-08-31' || /_\d{8}$/.test(FL.hira_std.portal.title), '표준코드 파일의 날짜가 기록됨');
ok(E.filter((e) => e.wd).every((e) => /^Q\d+$/.test(e.wd)), 'Wikidata 항목 번호는 모두 Q숫자 형식');

console.log(`\n확장 수록 정합성 점검: 통과 ${pass} · 실패 ${fail}`);
console.log(`성분 ${E.length}개 (RxNorm·심평원 연결 ${C.rx_mapped} · 심평원 전용 ${C.kr_only} · RxNorm 전용 ${C.rx_only} · 핵심과 겹침 ${C.core_overlap}) · 등급 ${JSON.stringify(gc)}`);
if (warns.length) { console.log('주의(실패 아님):'); warns.forEach((w) => console.log(' -', w)); }
process.exit(fail ? 1 : 0);
