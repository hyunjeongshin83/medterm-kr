// 확장 수록을 켠 상태의 답변 검증 비교(읽기 전용) — node tests/ext_benchmark.js [--json 파일경로]
// 같은 벤치마크 문장(benchmark_cases · benchmark_heldout · benchmark_heldout2)을 "핵심 사전만"과 "핵심 + 확장 수록" 두 사전으로 검증해, 달라진 곳을 보고한다.
// 이 파일은 tests/*_results.json 을 건드리지 않는다(결과는 화면에만 쓰고, --json 을 주면 그 경로에만 쓴다).
//
// 읽는 법
//  · 핵심 사전만 쓸 때의 측정값(340/340 등)은 그대로다. 아래는 확장 수록을 켰을 때 무엇이 달라지는지를 보는 것이다.
//  · 달라지는 것은 "핵심 32개 밖의 실제 약"(OOD_real · HELDOUT_real · HELDOUT2_real)뿐이어야 한다. 확장 수록이 그 약을 이제 알기 때문에
//    "사전 밖(unknown_drug)"으로 걸리지 않는 것이며, 결함이 아니라 수록 범위가 넓어진 결과다("사전에 없음"의 뜻이 달라진다).
// 실패(종료 코드 1)
//  ① 오류·정상 범주(N_* · E_atc · E_strength · E_class · E_rxcui · E_misspell · N_general · AMBIG_class)의 결과가 달라짐
//  ② 가짜 약 이름(E_fabricated)이 더는 걸러지지 않음(걸러지는 이유가 unknown_drug 에서 near_miss 로 바뀌는 것은 허용)
//  ③ "실제 약" 범주에서 걸러지지 않게 바뀐 문장 중, 확장 수록 이름이 원인이 아닌 것
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const { MedTerm } = require(path.join(root, 'web/js/core.js'));
const rd = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const data = rd('data/medterm.json'), cls = rd('data/class_lexicon.json'), ext = rd('data/medterm_ext.json');
const A = new MedTerm(data, cls), B = new MedTerm(data, cls, ext);
const SETS = ['benchmark_cases.json', 'benchmark_heldout.json', 'benchmark_heldout2.json'];
const REAL = new Set(['OOD_real', 'HELDOUT_real', 'HELDOUT2_real']);
const FAB = 'E_fabricated'; // 가짜 이름: 걸러지기만 하면 된다("사전 밖"이 "철자가 비슷한 확장 수록 이름"으로 표시가 바뀔 수는 있다)
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;

const evalCase = (mt, c) => {
  const r = mt.verify(c.text);
  const fl = r.findings.filter((f) => f.severity === 'warn' || f.severity === 'error');
  return { pass: c.expect.length ? fl.some((f) => c.expect.includes(f.type)) : fl.length === 0, types: [...new Set(fl.map((f) => f.type))].sort(), verdict: r.summary.verdict };
};

let fail = 0;
const ok = (c, m, extra) => { if (!c) { fail++; console.log('FAIL', m, extra === undefined ? '' : JSON.stringify(extra)); } };
const report = { built_at: ext.meta.built_at, ext_entities: ext.meta.counts.entities, sets: {}, changed: [] };
console.log(`확장 수록 비교 — 확장 자료 ${ext.meta.built_at} (성분 ${ext.meta.counts.entities - ext.meta.counts.core_overlap}개 + 핵심과 겹침 ${ext.meta.counts.core_overlap})\n`);

for (const f of SETS) {
  const cases = rd('tests/' + f);
  const cats = {};
  for (const c of cases) {
    const a = evalCase(A, c), b = evalCase(B, c);
    const s = (cats[c.category] ||= { n: 0, core: 0, ext: 0, changed: 0, lost: 0, gained: 0 });
    s.n++; if (a.pass) s.core++; if (b.pass) s.ext++;
    const changed = a.pass !== b.pass || a.verdict !== b.verdict || JSON.stringify(a.types) !== JSON.stringify(b.types);
    if (c.category === FAB) ok(b.pass, `② 가짜 약 이름이 걸러지지 않음: ${c.id}`, { text: c.text, ext: b });
    if (changed) {
      s.changed++; if (a.pass && !b.pass) s.lost++; if (!a.pass && b.pass) s.gained++;
      const extMention = B.findMentions(c.text, { ext: true }).some((m) => m.ext);
      report.changed.push({ set: f, id: c.id, category: c.category, core: a, ext: b, ext_name_found: extMention, text: c.text });
      if (!REAL.has(c.category) && c.category !== FAB) ok(false, `① 오류·정상 범주 결과가 달라짐: ${c.id} (${c.category})`, { core: a, ext: b });
      if (REAL.has(c.category) && a.pass && !b.pass) ok(extMention, `③ 걸러지지 않게 바뀐 이유가 확장 수록 이름이 아님: ${c.id}`, { text: c.text });
    }
  }
  report.sets[f] = cats;
  console.log(f);
  for (const [k, s] of Object.entries(cats)) {
    console.log(`  ${k.padEnd(14)} ${String(s.n).padStart(3)}문장  핵심만 통과 ${String(s.core).padStart(3)}  확장 켬 통과 ${String(s.ext).padStart(3)}  달라진 문장 ${String(s.changed).padStart(2)}${s.lost ? ` (그중 사전 밖 약이 이제 사전에 있어 걸러지지 않음 ${s.lost})` : ''}${s.gained ? ` (새로 걸러짐 ${s.gained})` : ''}`);
  }
}

const lost = report.changed.filter((c) => c.core.pass && !c.ext.pass), gained = report.changed.filter((c) => !c.core.pass && c.ext.pass);
const tot = (k) => Object.values(report.sets).reduce((n, cats) => n + Object.values(cats).reduce((m, s) => m + s[k], 0), 0);
console.log(`\n합계 ${tot('n')}문장: 핵심만 통과 ${tot('core')} · 확장 켬 통과 ${tot('ext')} · 달라진 문장 ${report.changed.length} (사전 밖 약이 이제 사전에 있어 걸러지지 않게 된 것 ${lost.length} · 새로 걸러진 것 ${gained.length})`);
console.log('해석: "통과"는 벤치마크가 정한 기대(사전 밖 약은 걸러야 함)를 지켰는지다. 확장 수록이 그 약을 수록하면 기대가 더는 맞지 않는 것이지 오류가 아니다.');
if (jsonOut) { fs.writeFileSync(jsonOut, JSON.stringify(report, null, 1)); console.log('결과 파일:', jsonOut); }
console.log(fail ? `\n실패 ${fail}건` : '\n점검 통과: 오류·정상 범주는 모두 같고, 가짜 약 이름은 여전히 걸러지며, 달라진 것은 모두 확장 수록 이름 때문임');
process.exit(fail ? 1 : 0);
