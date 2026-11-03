#!/usr/bin/env node
// medterm — 약무용어 사전 CLI: 검색 · 근거 프롬프트 · 답변 검증 · 벤치마크 · 평가
// 사용: node bin/medterm.mjs <명령> [인자] [--json] [--data <medterm.json>] [--classes <class_lexicon.json>]
//   info                          사전 규모·출처
//   search <질의>                 이름/상품명/ATC/RxCUI 검색
//   show <이름|id>                한 성분의 코드·ATC 경로·제형 요약
//   prompt "<질문>" [--ids a,b]   근거 주입 프롬프트(system/user) 생성
//   verify [--text 문장 | --file 경로 | stdin]   답변 검증. 종료코드 0=불일치·확인필요 없음, 2=확인 필요만, 1=사전 불일치(오류) 포함
//   bench                         tests/benchmark_*.json 재실행 요약
//   eval <파일.jsonl>             답변 단위 평가(조건별 검증기 표시율, 전문가 라벨이 있으면 민감도·특이도·κ)
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.dirname(here), require = createRequire(import.meta.url);
const { MedTerm } = require(path.join(root, 'web', 'js', 'core.js'));
const argv = process.argv.slice(2); const cmd = argv[0];
const flag = n => argv.includes('--' + n); const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const positional = (() => { const out = []; for (let i = 1; i < argv.length; i++) { if (argv[i].startsWith('--')) { if (!['json'].includes(argv[i].slice(2))) i++; } else out.push(argv[i]); } return out; })();
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const mt = new MedTerm(readJson(opt('data', path.join(root, 'data', 'medterm.json'))), readJson(opt('classes', path.join(root, 'data', 'class_lexicon.json'))));
const J = flag('json'); const out = o => process.stdout.write((J ? JSON.stringify(o, null, 1) : (typeof o === 'string' ? o : JSON.stringify(o, null, 1))) + '\n');
const wilson = (k, n, z = 1.96) => { if (!n) return [NaN, NaN]; const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), a = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - a) / d, (c + a) / d]; };
const pct = (k, n) => { if (!n) return 'n/a'; const [lo, hi] = wilson(k, n); return `${k}/${n} (${Math.round(100 * k / n)}%, 95% CI ${Math.round(100 * lo)}–${Math.round(100 * hi)}%)`; };
const kappa = (a, b) => { const n = a.length; if (!n) return NaN; let agree = 0, a1 = 0, b1 = 0; for (let i = 0; i < n; i++) { if (a[i] === b[i]) agree++; if (a[i]) a1++; if (b[i]) b1++; } const po = agree / n, pe = (a1 / n) * (b1 / n) + (1 - a1 / n) * (1 - b1 / n); return pe === 1 ? NaN : (po - pe) / (1 - pe); };
function resolve(q) { const byId = mt.byId.get(q); if (byId && byId.type === 'VTM') return byId.id; const h = mt.search(q); return h.length ? h[0].vtm.id : null; }
function verifyText(text) { const r = mt.verify(text); return { summary: r.summary, findings: r.findings.filter(f => f.severity !== 'ok').map(({ severity, type, text, message, start, end }) => ({ severity, type, text, message, start, end })) }; }
function exitCodeFor(s) { return s.error ? 1 : s.warn ? 2 : 0; }
const readStdin = () => { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } };

try {
  if (!cmd || cmd === 'help' || cmd === '--help') { process.stdout.write(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 13).map(l => l.replace(/^\/\/ ?/, '')).join('\n') + '\n'); }
  else if (cmd === 'info') { out({ name: mt.meta.name, built_at: mt.meta.built_at, counts: mt.meta.counts, surfaces: mt.surfaces.length, sources: mt.meta.sources, notice: mt.meta.notice }); }
  else if (cmd === 'search') { const q = positional.join(' '); const hits = mt.search(q).slice(0, Number(opt('top', 10))).map(h => ({ id: h.vtm.id, ko: h.vtm.label_ko, en: h.vtm.label_en, atc: h.vtm.atc_codes, rxcui: h.vtm.rxcui, via: h.via, score: h.score, status: h.vtm.review_status }));
    if (J) out(hits); else out(hits.length ? hits.map(h => `${h.ko} (${h.en})  ${h.id}  ATC ${h.atc.slice(0, 3).join(',') || '-'}  [${h.via}] ${h.status}`).join('\n') : '사전에 없음 (수록 성분 ' + mt.vtms.length + '개)'); }
  else if (cmd === 'show') { const id = resolve(positional.join(' ')); if (!id) { process.stderr.write('사전에 없음\n'); process.exit(3); } const d = mt.describe(id);
    const s = { id, ko: d.vtm.label_ko, en: d.vtm.label_en, rxcui: d.vtm.rxcui, snomed_ct: d.vtm.snomed_ct, atc: d.atc.map(a => ({ code: a.code, path: a.path.map(p => `${p.code} ${p.name || ''}`.trim()) })), vmp_count: d.vmps.length, forms: Object.fromEntries(Object.entries(d.byForm).map(([f, l]) => [f, l.length])), review_status: d.vtm.review_status }; out(s); }
  else if (cmd === 'prompt') { const q = positional.join(' '); const ids = opt('ids', '') ? opt('ids').split(',') : mt.retrieve(q, 5); const p = mt.buildGroundedPrompt(q, ids); if (J) out({ ids, system: p.system, user: p.user }); else out('[system]\n' + p.system + '\n\n[user]\n' + p.user); }
  else if (cmd === 'verify') { const text = opt('text') ?? (opt('file') ? fs.readFileSync(opt('file'), 'utf8') : readStdin()); const v = verifyText(text);
    if (J) out(v); else { out(`판정: ${v.summary.verdict}  (오류 ${v.summary.error} · 확인필요 ${v.summary.warn} · 정보 ${v.summary.info} · 일치 ${v.summary.ok})`); v.findings.forEach(f => out(`  [${f.severity}] ${f.type}: "${f.text}" — ${f.message}`)); }
    process.exitCode = exitCodeFor(v.summary); }
  else if (cmd === 'bench') { const res = {}; for (const f of fs.readdirSync(path.join(root, 'tests')).filter(f => /^benchmark_(cases|heldout2?)\.json$/.test(f))) { const cases = readJson(path.join(root, 'tests', f)); const per = {};
      for (const c of cases) { const fl = mt.verify(c.text).findings.filter(x => x.severity === 'warn' || x.severity === 'error'); const pass = c.expect.length ? fl.some(x => c.expect.includes(x.type)) : fl.length === 0; (per[c.category] = per[c.category] || { k: 0, n: 0 }); per[c.category].n++; if (pass) per[c.category].k++; } res[f] = per; }
    if (J) out(res); else for (const [f, per] of Object.entries(res)) { out(f); for (const [c, o] of Object.entries(per)) out(`  ${c.padEnd(14)} ${pct(o.k, o.n)}`); } }
  else if (cmd === 'eval') { const file = positional[0]; if (!file) throw new Error('eval <파일.jsonl> 필요'); const rows = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim()).map((l, i) => { try { return JSON.parse(l); } catch { throw new Error(`${i + 1}번째 줄이 JSON이 아닙니다`); } });
    const by = {}; for (const r of rows) { const v = mt.verify(r.text).summary; (by[r.condition || 'all'] = by[r.condition || 'all'] || []).push({ ...r, vErr: v.error > 0, vFlag: v.error + v.warn > 0 }); }
    const rep = {}; for (const [cond, L] of Object.entries(by)) { const r = { n: L.length, verifier_error: L.filter(x => x.vErr).length, verifier_any_flag: L.filter(x => x.vFlag).length };
      const lab = L.filter(x => typeof x.expert1 === 'boolean'); if (lab.length) { const cons = lab.map(x => typeof x.expert2 === 'boolean' ? (x.expert1 === x.expert2 ? x.expert1 : null) : x.expert1).map((v, i) => [v, lab[i]]).filter(([v]) => v !== null);
        r.labeled = lab.length; r.disputed_excluded = lab.length - cons.length; const g = op => { const tp = cons.filter(([v, x]) => v && x[op]).length, fn = cons.filter(([v, x]) => v && !x[op]).length, fp = cons.filter(([v, x]) => !v && x[op]).length, tn = cons.filter(([v, x]) => !v && !x[op]).length; return { sensitivity: pct(tp, tp + fn), specificity: pct(tn, tn + fp), ppv: pct(tp, tp + fp), kappa_vs_expert: +kappa(cons.map(([v]) => v), cons.map(([, x]) => x[op])).toFixed(3) }; };
        r.strict_error_only = g('vErr'); r.lenient_error_or_warn = g('vFlag'); const two = lab.filter(x => typeof x.expert2 === 'boolean'); if (two.length) r.kappa_expert1_vs_expert2 = +kappa(two.map(x => x.expert1), two.map(x => x.expert2)).toFixed(3); }
      rep[cond] = r; }
    out(rep); }
  else { process.stderr.write(`알 수 없는 명령: ${cmd}\n`); process.exit(64); }
} catch (e) { process.stderr.write('오류: ' + e.message + '\n'); process.exit(64); }
