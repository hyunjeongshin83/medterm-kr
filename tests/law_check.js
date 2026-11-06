// MedTerm-KR 약사법 용어·기구 층 점검(읽기 전용) — node tests/law_check.js
// ① data/medterm_law.json 구조·정합성  ② web/js/medterm-law-data.js(화면이 읽는 묶음)가 JSON 과 같은지  ③ web/js/layers.js 의 약사법 읽기 API(검색·시행 상태·관련 항목)
// 이 층은 핵심·확장·최신·제품 자료와 따로 얹은 별도 층이다. 자료가 없거나 이상해도 core.js 와 다른 층은 이전과 똑같이 동작해야 한다.
// 이 점검이 하지 않는 것: 법제처 현행본과의 글자 대조(출력본 PDF 와의 대조는 build/law_build.py --pdf-text … --check-only 가 한다) · 약사 검수 · 법률 검토.
// 실패가 있으면 종료 코드 1.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const rj = (p) => JSON.parse(rd(p));
const { MedTerm } = require(path.join(root, 'web/js/core.js'));
const { Layers } = require(path.join(root, 'web/js/layers.js'));

let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log('FAIL', m, extra ?? ''); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);

const LAW = rj('data/medterm_law.json');
const M = LAW.meta, E = LAW.e;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ───────────── ① 자료 구조 ─────────────
ok(same(Object.keys(LAW).sort(), ['e', 'meta']), '최상위 키는 meta · e 두 개');
ok(M.review_status === 'draft' && /초안/.test(M.title), '초안 표시(review_status=draft, 제목에 초안)');
ok(DATE.test(M.built) && DATE.test(M.upcoming_effective), '만든 날 · 시행 예정일 형식(YYYY-MM-DD)', [M.built, M.upcoming_effective]);
ok(M.source && M.source.name && M.source.print && /^https:\/\//.test(M.source.url), '출처(이름 · 출력본 설명 · https 주소)');
ok(Array.isArray(M.limits) && M.limits.length >= 4 && M.limits.every((s) => typeof s === 'string' && s.length > 10), '한계 안내 4개 이상');
ok(M.limits.some((s) => /현행본/.test(s) && /아직 하지 않았/.test(s)) && M.limits.some((s) => /약사 검수 전/.test(s)), '한계 안내에 "법제처 현행본 대조 안 함"과 "약사 검수 전"이 있음');
ok(M.limits.some((s) => /약사협의회/.test(s) && /0건/.test(s)), '한계 안내에 "약사협의회는 약사법 본문에 없음(0건)"이 있음');
const GROUP_IDS = ['def', 'org', 'duty', 'sys'];
ok(same((M.groups || []).map((g) => g.id), GROUP_IDS) && M.groups.every((g) => g.label && g.hint), '분류 4개(def · org · duty · sys)에 이름과 설명');
const byGroup = (g) => E.filter((e) => e.g === g).length;
ok(M.counts.entries === E.length && GROUP_IDS.every((g) => M.counts[g] === byGroup(g)), '건수(전체 · 분류별)가 항목 수와 같음', M.counts);
ok(M.counts.upcoming === E.filter((e) => e.st !== 'cur').length, '시행 예정·개정 예정 건수가 같음');

// ───────────── ② 항목 정합성 ─────────────
const ids = E.map((e) => e.id);
ok(new Set(ids).size === ids.length, '항목 id 가 겹치지 않음');
ok(ids.every((id) => /^LAW:\d+(?:-\d+)*(?::\d+)?$/.test(id)), 'id 형식(LAW:조[-가지…][:호])', ids.filter((id) => !/^LAW:\d+(?:-\d+)*(?::\d+)?$/.test(id)));
ok(E.every((e) => ['t', 'a', 'ti', 'pl'].every((k) => typeof e[k] === 'string' && e[k].trim())), '용어 · 조문 · 조문 제목 · 쉬운 풀이가 모두 있음');
ok(E.every((e) => /^제\d+조/.test(e.a)), '조문 표기가 "제○조…"로 시작');
ok(E.every((e) => GROUP_IDS.includes(e.g)), '분류가 4개 중 하나');
ok(E.every((e) => ['cur', 'chg', 'new'].includes(e.st)), '시행 상태가 cur · chg · new 중 하나');
ok(E.every((e) => e.st === 'cur' ? (e.ex && !e.exn) : e.st === 'chg' ? (e.ex && e.exn) : (!e.ex && e.exn)), '시행 상태와 원문 발췌가 맞음(cur=현행만 · chg=현행+예정 · new=예정만)');
ok(E.every((e) => [e.ex, e.exn].filter(Boolean).every((s) => typeof s === 'string' && s.trim().length >= 8)), '원문 발췌는 비어 있지 않음');
ok(E.every((e) => Array.isArray(e.kw) && e.kw.every((k) => typeof k === 'string' && k.trim()) && Array.isArray(e.rel)), '별칭(kw)과 관련 항목(rel)은 목록');
ok(E.every((e) => e.rel.every((r) => r !== e.id && ids.includes(r))), '관련 항목은 실제 항목이고 자기 자신이 아님');
ok(E.every((e) => !e.go || (['product', 'new'].includes(e.go.tab) && typeof e.go.q === 'string' && e.go.label)), '다른 탭으로 가는 단추(go)는 국내 제품 · 최신·임상 탭만, 이름이 있음');
ok(E.filter((e) => e.effn).every((e) => typeof e.effn === 'string' && /시행/.test(e.effn)), '현행 시행일 표기(effn)가 있으면 "…시행" 꼴');
ok(E.every((e) => !/[<>]/.test([e.t, e.a, e.ti, e.pl, e.ex || '', e.exn || ''].join(' '))), '본문에 꺾쇠(<·>)가 없음(표시에 마크업을 넣지 않음)');
ok(E.filter((e) => e.st !== 'cur').every((e) => e.exn.length > 0) && same(E.filter((e) => e.st !== 'cur').map((e) => e.id), ['LAW:2:19', 'LAW:2:20', 'LAW:83-5']), '시행 예정·개정 예정 항목은 LAW:2:19 · LAW:2:20 · LAW:83-5 세 개(자료를 바꾸면 이 줄도 고칠 것)');
// 쉬운 풀이가 단정하는 말로 흐르지 않았는지(법률 자문처럼 보이지 않게) — 금지어 목록은 가벼운 점검이다
ok(E.every((e) => !/반드시 처벌|위법입니다|불법입니다|법적 책임을 집니다/.test(e.pl)), '쉬운 풀이에 위법·처벌을 단정하는 말이 없음');

// ───────────── ③ 화면이 읽는 묶음 ─────────────
{
  let bundled = null;
  try { const ctx = { window: {} }; vm.runInNewContext(rd('web/js/medterm-law-data.js'), ctx); bundled = ctx.window.MEDTERM_LAW; } catch (e) { /* 아래에서 실패 처리 */ }
  ok(!!bundled, '묶음(web/js/medterm-law-data.js)이 window.MEDTERM_LAW 를 만듦');
  ok(bundled && same(canon(bundled), canon(LAW)), '묶음의 내용이 data/medterm_law.json 과 같음(build/make_bundle.py 를 다시 돌려야 할 수 있음)');
}

// ───────────── ④ 읽기 API (web/js/layers.js) ─────────────
const core = rj('data/medterm.json'), cls = rj('data/class_lexicon.json'), ext = rj('data/medterm_ext.json');
const mt = new MedTerm(core, cls, ext);
const none = new Layers(mt, null, null);
ok(none.hasLaw === false && none.searchLaw({ q: '조제' }).length === 0 && none.lawGroups().length === 0 && none.lawEntry('LAW:27') === null, '약사법 자료가 없으면 비어 있는 채로 동작(탭이 없던 이전과 같음)');
{
  let err = null, L; try { L = new Layers(mt, null, null, { e: 'bad' }); L.searchLaw({ q: 'a' }); L.lawGroups(); } catch (e) { err = String(e); }
  ok(!err && L && L.hasLaw === false, '이상한 약사법 자료(e 가 목록이 아님)여도 오류 없이 없는 것으로 처리', err);
}
const L = new Layers(mt, null, null, LAW);
ok(L.hasLaw === true && L.lawMeta.counts.entries === E.length && L.lawGroups().length === 4, '자료가 있으면 hasLaw · 메타 · 분류 4개');
ok(same(L.searchLaw().map((e) => e.id), ids), '질의가 없으면 법 조문 순서(자료 순서) 그대로 전체');
ok(GROUP_IDS.every((g) => L.searchLaw({ group: g }).length === M.counts[g]), '분류별 거르기 건수가 건수표와 같음');
ok(same(L.searchLaw({ upcoming: true }).map((e) => e.id), ['LAW:2:19', 'LAW:2:20', 'LAW:83-5']), '시행 예정·개정 예정만 거르면 세 개');
ok(L.lawEntry('LAW:83-5').t === '국가필수의약품 안정공급 협의회' && L.lawEntry('없는-id') === null, 'id 로 항목 찾기');
ok(L.searchLaw({ q: '조제' })[0].t === '조제', '"조제": 용어 이름이 같은 항목이 맨 앞');
ok(L.searchLaw({ q: '복약지도' })[0].t === '복약지도', '"복약지도": 용어 이름이 같은 항목이 맨 앞');
ok(L.searchLaw({ q: 'dur' }).some((e) => /DUR/.test(e.t)) && L.searchLaw({ q: 'DUR' }).length === L.searchLaw({ q: 'dur' }).length, '"DUR": 대소문자 없이 찾음');
ok(L.searchLaw({ q: '약사회' })[0].t === '약사회(대한약사회)', '"약사회": 약사회(대한약사회)가 맨 앞');
ok(L.searchLaw({ q: '제27조' }).length >= 1 && L.searchLaw({ q: '제27조' })[0].a.startsWith('제27조'), '"제27조": 조문 번호로 찾음');
ok(L.searchLaw({ q: '약사협의회' }).length === 0, '"약사협의회": 0건(약사법 본문에 없는 말 — 없는 용어를 있는 것처럼 보여 주지 않음)');
ok(L.searchLaw({ q: '협의회' })[0].id === 'LAW:83-5', '"협의회": 국가필수의약품 안정공급 협의회가 맨 앞');
{
  const r = L.searchLaw({ q: '약국 개설' });
  ok(r.length >= 1 && r.some((e) => e.t === '약국 개설등록') && r.every((e) => ['약국', '개설'].every((w) => [e.t, e.a, e.ti, ...(e.kw || []), e.pl, e.ex || '', e.exn || ''].join(' ').toLowerCase().includes(w))), '"약국 개설": 낱말이 모두 맞는 항목만');
}
ok(L.searchLaw({ q: 'zzzzqqq' }).length === 0, '없는 말은 0건');
ok(L.searchLaw({ q: '조제', group: 'org' }).every((e) => e.g === 'org'), '검색어와 분류 거르기를 함께 쓰면 두 조건 모두 맞음');
{
  const chg = L.lawEntry('LAW:2:19'), nw = L.lawEntry('LAW:83-5'), cur = L.lawEntry('LAW:27');
  const eff = M.upcoming_effective;
  const s1 = L.lawStatus(chg, '2026-11-06'), s2 = L.lawStatus(chg, eff), s3 = L.lawStatus(nw, '2026-11-06'), s4 = L.lawStatus(nw, '2099-01-01'), s5 = L.lawStatus(cur, '2099-01-01');
  ok(s1.kind === 'chg' && s1.passed === false && /개정 예정/.test(s1.label) && s1.eff === eff, '시행 상태(개정 예정): 시행일 전에는 "현행 · …개정 예정"', s1);
  ok(s2.kind === 'chg' && s2.passed === true && /현행본 확인 필요/.test(s2.label), '시행 상태(개정 예정): 시행일이 되면 "현행본 확인 필요"로 바뀜', s2);
  ok(s3.kind === 'new' && s3.passed === false && s3.label === `${eff} 시행 예정`, '시행 상태(신설 예정): 시행일 전에는 "…시행 예정"', s3);
  ok(s4.kind === 'new' && s4.passed === true && /현행본 확인 필요/.test(s4.label), '시행 상태(신설 예정): 시행일이 지나면 "현행본 확인 필요"', s4);
  ok(s5.kind === 'cur' && s5.passed === false && s5.tone === 'ok', '시행 상태(현행): 날짜가 지나도 그대로 현행', s5);
  const withEffn = E.find((e) => e.effn);
  ok(!withEffn || L.lawStatus(withEffn, '2026-11-06').label === `현행 · ${withEffn.effn}`, '현행 시행일 표기가 있으면 라벨에 붙음');
}

console.log(`\n약사법 층 점검: ${pass}개 통과, ${fail}개 실패`);
process.exit(fail ? 1 : 0);
