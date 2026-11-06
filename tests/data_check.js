// MedTerm-KR 데이터 정합성 점검(읽기 전용) — node tests/data_check.js
// data/medterm.json · class_lexicon.json · medterm.ttl 이 서로 맞는지, 형식이 지켜졌는지 본다. 실패가 있으면 종료 코드 1.
// 실패가 아닌 "주의"는 끝에 따로 적는다(예: 사전에 성분이 없는 분류).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const d = JSON.parse(fs.readFileSync(path.join(root, 'data/medterm.json'), 'utf8'));
const cl = JSON.parse(fs.readFileSync(path.join(root, 'data/class_lexicon.json'), 'utf8'));
let pass = 0, fail = 0; const warns = [];
const ok = (c, m, extra) => { if (c) { pass++; } else { fail++; console.log('FAIL', m, extra ?? ''); } };
const warn = (m) => warns.push(m);
const by = { VTM: [], VMP: [], AMP: [] }; for (const c of d.concepts) (by[c.type] ??= []).push(c);

ok(by.VTM.length === d.meta.counts.VTM && by.VMP.length === d.meta.counts.VMP && by.AMP.length === d.meta.counts.AMP, '건수가 meta.counts와 같음', [by.VTM.length, by.VMP.length, by.AMP.length]);
const ids = new Set(); let dup = 0; for (const c of d.concepts) { if (ids.has(c.id)) dup++; ids.add(c.id); }
ok(dup === 0, '개념 ID 중복 없음', dup);
ok(d.concepts.every(c => c.id === `MT:${c.type}:${c.rxcui}`), 'ID = MT:유형:RxCUI 형식');
const vtm = new Map(by.VTM.map(c => [c.id, c])), vmp = new Map(by.VMP.map(c => [c.id, c]));
ok(by.VMP.every(c => vtm.has(c.ingredient)), 'VMP.ingredient 가 모두 존재하는 VTM');
ok(by.AMP.every(c => vmp.has(c.vmp)), 'AMP.vmp 가 모두 존재하는 VMP');
ok(by.AMP.every(c => vmp.get(c.vmp)?.ingredient === c.ingredient), 'AMP.ingredient 가 상위 VMP 의 성분과 같음');
const noVmp = by.VTM.filter(t => !by.VMP.some(v => v.ingredient === t.id)); ok(noVmp.length === 0, '모든 성분에 제형·용량(VMP)이 1개 이상', noVmp.map(x => x.label_ko));

// 용량 파싱
const badStr = by.VMP.filter(v => v.strength && v.strength.raw && !(Number.isFinite(v.strength.value) && v.strength.unit)); ok(badStr.length === 0, 'strength.raw 가 value/unit 으로 파싱됨', badStr.slice(0, 3).map(v => v.strength.raw));
const units = {}; by.VMP.forEach(v => { const u = v.strength?.unit ?? '(없음)'; units[u] = (units[u] || 0) + 1; });
const unitMismatch = by.VMP.filter(v => v.strength?.raw && !v.strength.raw.toUpperCase().includes(String(v.strength.unit).toUpperCase())); ok(unitMismatch.length === 0, 'strength.unit 이 raw 표기와 일치', unitMismatch.slice(0, 3).map(v => v.strength.raw));

// 제형 한글명: 모든 VMP에 있고, 같은 영문 제형은 항상 같은 한글명
const noKoForm = [...new Set(by.VMP.filter(v => !v.form_ko).map(v => v.form_en))]; ok(noKoForm.length === 0, '모든 VMP에 한글 제형명(form_ko)이 있음', noKoForm);
const formMap = {}; by.VMP.forEach(v => { (formMap[v.form_en] ??= new Set()).add(v.form_ko); });
const formAmb = Object.entries(formMap).filter(([, s]) => s.size > 1).map(([k, s]) => `${k}→${[...s].join('|')}`); ok(formAmb.length === 0, '같은 영문 제형은 항상 같은 한글 제형명', formAmb);
ok((d.meta.sources || []).some(s => /제형 한글명/.test(s)), 'meta.sources 에 제형 한글명의 출처(수기 직역 초안·미검수) 표기');

// VTM
ok(by.VTM.every(t => t.label_ko && t.label_en), 'VTM 한글명·영문명 모두 있음');
ok(by.VTM.every(t => t.review_status === 'draft'), 'VTM review_status 가 모두 draft(약사 검수 전)', [...new Set(by.VTM.map(t => t.review_status))]);
ok(by.VTM.every(t => /^manual/.test(t.provenance?.ko_label || '') && /약사 검수 전/.test(t.provenance?.ko_label || '') && /약사 검수 전/.test(t.provenance?.brands_ko || '')), 'VTM 한글명·상품명 출처가 수기(manual)이고 "약사 검수 전"으로 표시됨(2026-11-06 심평원 자료 대조 사실 포함)');
ok(by.VMP.concat(by.AMP).every(c => c.review_status === 'auto'), 'VMP·AMP review_status 가 auto');
const koDup = {}; by.VTM.forEach(t => [t.label_ko, ...(t.alt_ko || [])].forEach(n => { (koDup[n] ??= []).push(t.rxcui); }));
const koAmbiguous = Object.entries(koDup).filter(([n, a]) => new Set(a).size > 1); ok(koAmbiguous.length === 0, '한글 이름(대표명·별칭)이 서로 다른 성분 2개 이상을 가리키지 않음', koAmbiguous);
const brandDup = {}; by.VTM.forEach(t => (t.brands_ko || []).forEach(n => { (brandDup[n] ??= []).push(t.rxcui); }));
const brandAmb = Object.entries(brandDup).filter(([n, a]) => new Set(a).size > 1); ok(brandAmb.length === 0, '한국 상품명이 서로 다른 성분 2개 이상을 가리키지 않음', brandAmb);
// 검색 상자가 NFKC 로 정규화하므로, 사전의 이름은 이미 정규화된 형태여야 한다(아니면 그 이름은 검색으로 찾을 수 없다)
const notNfkc = []; for (const c of d.concepts) for (const k of ['label_ko', 'label_en', 'brand_en']) if (c[k] && c[k].normalize('NFKC') !== c[k]) notNfkc.push(`${c.id}:${k}`);
for (const t of by.VTM) for (const k of ['alt_ko', 'alt_en', 'brands_ko']) (t[k] || []).forEach(s => { if (s.normalize('NFKC') !== s) notNfkc.push(`${t.id}:${k}:${s}`); });
ok(notNfkc.length === 0, '사전의 이름이 NFKC 정규화된 형태(검색 상자 정규화와 맞음)', notNfkc.slice(0, 5));

// ATC
const atcRe = /^[A-Z]\d{2}[A-Z]{2}\d{2}$/; let atcN = 0; const badAtc = [], badPath = [], missingName = new Set();
for (const t of by.VTM) for (const code of (t.atc_codes || [])) {
  atcN++; if (!atcRe.test(code)) badAtc.push(code);
  const exp = [code[0], code.slice(0, 3), code.slice(0, 4), code.slice(0, 5)]; const got = t.atc_paths?.[code];
  if (!got || got.join() !== exp.join()) badPath.push(`${t.label_en}:${code}`);
  exp.forEach(n => { if (!d.atc[n]) missingName.add(n); });
}
ok(badAtc.length === 0, 'ATC 코드가 5단계 형식', badAtc); ok(badPath.length === 0, 'atc_paths 가 코드에서 유도한 경로와 같음', badPath); ok(missingName.size === 0, 'ATC 경로의 모든 단계에 분류명이 있음', [...missingName]);
const noAtc = by.VTM.filter(t => !(t.atc_codes || []).length); if (noAtc.length) warn(`ATC 코드가 없는 성분 ${noAtc.length}개: ${noAtc.map(t => t.label_ko).join(', ')}`);

// SNOMED
const badSn = []; by.VTM.forEach(t => (t.snomed_ct || []).forEach(s => { if (!/^\d{6,18}$/.test(s)) badSn.push(`${t.label_en}:${s}`); })); ok(badSn.length === 0, 'SNOMED CT ID 형식(숫자 6~18자리)', badSn);
const noSn = by.VTM.filter(t => !(t.snomed_ct || []).length); if (noSn.length) warn(`SNOMED CT 가 없는 성분 ${noSn.length}개: ${noSn.map(t => t.label_ko).join(', ')}`);

// 분류 사전
const aliasDup = {}; cl.classes.forEach(c => c.aliases.forEach(a => { (aliasDup[a] ??= new Set()).add(c.label); }));
const aliasAmb = Object.entries(aliasDup).filter(([, s]) => s.size > 1).map(([a, s]) => `${a}→${[...s].join('|')}`); ok(aliasAmb.length === 0, '분류 별칭이 두 분류에 겹치지 않음', aliasAmb);
ok(cl.classes.every(c => c.label && Array.isArray(c.aliases) && c.aliases.length && Array.isArray(c.atc) && c.atc.length), '분류마다 이름·별칭·ATC 접두어가 있음');
const emptyCls = cl.classes.filter(c => !by.VTM.some(t => (t.atc_codes || []).some(a => c.atc.some(p => a.startsWith(p))))).map(c => c.label);
if (emptyCls.length) warn(`사전에 성분이 하나도 없는 분류 ${emptyCls.length}개(검색하면 "분류는 알지만 성분 없음"으로 안내): ${emptyCls.join(', ')}`);

// 면책(공지)·메타
ok(/약사 검수 전 초안/.test(d.meta.notice) && /미국 RxNorm 기준/.test(d.meta.notice), 'meta.notice 에 검수 전 초안·미국 RxNorm 기준 안내');
ok(!/프로토타입/.test(JSON.stringify(d.meta)), 'meta 에 "프로토타입" 표현 없음');

// 온톨로지(TTL)와 JSON 의 건수가 같다
const ttl = fs.readFileSync(path.join(root, 'data/medterm.ttl'), 'utf8');
const ttlSubjects = (t) => (ttl.match(new RegExp(`^mt:MT_${t}_\\d+ a mt:${t} `, 'gm')) || []).length;
ok(ttlSubjects('VTM') === by.VTM.length && ttlSubjects('VMP') === by.VMP.length && ttlSubjects('AMP') === by.AMP.length, '온톨로지(TTL)의 개체 수가 JSON 과 같음', [ttlSubjects('VTM'), ttlSubjects('VMP'), ttlSubjects('AMP')]);
ok(d.meta.sources.every(s => ttl.includes(JSON.stringify(s).slice(1, -1))), '온톨로지(TTL)에 meta.sources 가 모두 들어 있음(JSON 과 TTL 이 같은 시점)');

// 번들(웹이 읽는 파일)이 JSON 과 같다
const bundle = fs.readFileSync(path.join(root, 'web/js/medterm-data.js'), 'utf8');
const m = /window\.MEDTERM_DATA\s*=\s*(\{[\s\S]*?\});?\s*(?:\r?\n|window\.)/.exec(bundle);
let bundled = null; try { bundled = m && JSON.parse(m[1]); } catch (e) { /* 아래에서 실패로 센다 */ }
ok(bundled && JSON.stringify(bundled) === JSON.stringify(d), 'web/js/medterm-data.js 가 data/medterm.json 과 같음(build/make_bundle.py 를 다시 돌릴 필요 없음)');

console.log(`\n정합성 점검: 통과 ${pass} · 실패 ${fail}`);
console.log('단위 분포:', JSON.stringify(units));
console.log('ATC 코드 수:', atcN, '· 성분당 평균', (atcN / by.VTM.length).toFixed(1));
if (warns.length) { console.log('주의(실패 아님):'); warns.forEach(w => console.log(' -', w)); }
process.exit(fail ? 1 : 0);
