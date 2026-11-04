
// 관계 그래프 모델·레이아웃 점검(DOM 없음). 기대값은 Python이 원본 JSON에서 따로 계산한 graph_expected.json.
const fs = require('fs'), path = require('path'); const { MedTerm } = require('../web/js/core.js');
const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const mt = new MedTerm(read('../data/medterm.json'), read('../data/class_lexicon.json')); const exp = read('graph_expected.json');
const res = []; const ok = (n, c, x) => res.push([c ? 'PASS' : 'FAIL', n, x || '']);
let bad = { totals: [], siblings: [], ends: [], overlap: [], bounds: [], text: [], more: [], dup: [], edgeCol: [], vtmEdges: [] };
for (const v of mt.vtms) {
  const g = mt.graph(v.id), L = mt.layoutGraph(g), e = exp[v.id], ids = g.nodes.map(n => n.id);
  if (!(g.totals.atc === e.atc && g.totals.vmp === e.vmp && g.totals.amp === e.amp && g.totals.siblings === e.siblings.length)) bad.totals.push(v.id);
  const shownSib = g.nodes.filter(n => n.kind === 'sibling').map(n => n.id); if (!shownSib.every(id => e.siblings.includes(id)) || shownSib.length !== Math.min(6, e.siblings.length) || shownSib.includes(v.id)) bad.siblings.push(v.id);
  if (new Set(ids).size !== ids.length) bad.dup.push(v.id);
  if (!g.edges.every(x => ids.includes(x.from) && ids.includes(x.to))) bad.ends.push(v.id);
  // 같은 열 안에서 노드끼리 겹치지 않는지(세로 간격 ≥ 0)
  for (const col of ['sibling', 'group', 'atc', 'vtm', 'vmp', 'amp']) { const ns = L.nodes.filter(n => n.col === col).sort((a, b) => a.y - b.y); for (let i = 1; i < ns.length; i++) if (ns[i].y < ns[i - 1].y + ns[i - 1].h) bad.overlap.push(v.id + ':' + col); }
  // 서로 다른 열 노드도 가로로 겹치지 않는지
  const xs = [...new Set(L.nodes.map(n => n.x))].sort((a, b) => a - b); for (let i = 1; i < xs.length; i++) if (xs[i] < xs[i - 1] + L.metrics.nodeW) bad.overlap.push(v.id + ':x');
  if (!L.nodes.every(n => n.x >= 0 && n.y >= 0 && n.x + n.w <= L.width && n.y + n.h <= L.height)) bad.bounds.push(v.id);
  if (!L.nodes.every(n => n.w1 <= n.w - 2 * L.metrics.padX + 0.01 && n.w2 <= n.w - 2 * L.metrics.padX + 0.01)) bad.text.push(v.id);
  // 생략 표기: 표시 + '외 N개' = 전체
  const more = k => { const n = g.nodes.find(x => x.id === 'more:' + k); return n ? parseInt(n.line1.replace(/\D/g, ''), 10) : 0; };
  if (g.shown.atc + more('atc') !== g.totals.atc || g.shown.siblings + more('sibling') !== g.totals.siblings || g.shown.vmp + more('vmp') !== g.totals.vmp || g.shown.amp + more('amp') !== g.totals.amp) bad.more.push(v.id);
  // 성분 → VMP 간선 수 = 표시된 VMP 수, VMP → AMP 간선 수 = 표시된 AMP 수
  if (g.edges.filter(x => x.rel === 'hasVMP').length !== g.shown.vmp || g.edges.filter(x => x.rel === 'hasAMP').length !== g.shown.amp || g.edges.filter(x => x.rel === 'hasATC').length !== g.shown.atc) bad.vtmEdges.push(v.id);
  // 간선은 항상 왼쪽 열 → 오른쪽 열로 그려지고 끝점이 노드 가장자리에 닿는다
  if (!L.edges.every(x => x.x2 >= x.x1)) bad.edgeCol.push(v.id);
}
ok('totals (ATC/siblings/VMP/AMP) match independent Python calc for all 32', !bad.totals.length, bad.totals.join(','));
ok('siblings = same-subgroup ingredients only, capped at 6, never self', !bad.siblings.length, bad.siblings.join(','));
ok('no duplicate node ids', !bad.dup.length); ok('every edge endpoint exists', !bad.ends.length, bad.ends.join(','));
ok('no node overlap (same column vertical, different column horizontal)', !bad.overlap.length, bad.overlap.join(','));
ok('all nodes inside the drawing area', !bad.bounds.length, bad.bounds.join(','));
ok('estimated text width fits node (after truncation)', !bad.text.length, bad.text.join(','));
ok('shown + "외 N개" = total for atc/sibling/vmp/amp', !bad.more.length, bad.more.join(','));
ok('edge counts equal shown nodes (hasATC/hasVMP/hasAMP)', !bad.vtmEdges.length, bad.vtmEdges.join(','));
ok('edges run left → right', !bad.edgeCol.length);
// 개별 사례
const om = mt.graph('MT:VTM:7646'); const names = om.nodes.filter(n => n.kind === 'sibling').map(n => n.line1).sort();
ok('omeprazole: group A02BC, siblings = esomeprazole + pantoprazole', om.nodes.some(n => n.id === 'grp:A02BC') && names.length === 2 && names.join().includes('에스오메프라졸') && names.join().includes('판토프라졸'), names.join('|'));
const pr = mt.graph('MT:VTM:' + mt.vtms.find(v => v.label_en === 'prednisolone').rxcui);
ok('prednisolone (11 ATC codes): 6 shown + "외 5개" node', pr.shown.atc === 6 && pr.nodes.some(n => n.id === 'more:atc' && n.line1 === '외 5개'));
const big = mt.vtms.map(v => mt.graph(v.id)).sort((a, b) => b.totals.amp - a.totals.amp)[0];
ok('largest ingredient is capped (VMP<=10, AMP<=14) with overflow nodes', big.shown.vmp <= 10 && big.shown.amp <= 14 && big.nodes.some(n => n.id === 'more:amp'), `${big.center}: VMP ${big.shown.vmp}/${big.totals.vmp}, AMP ${big.shown.amp}/${big.totals.amp}`);
ok('unknown id → null', mt.graph('MT:VTM:0') === null && mt.graph('MT:VMP:104906') === null);
const forms = new Set(big.nodes.filter(n => n.kind === 'vmp').map(n => n.line2)); ok('VMP sample covers several dosage forms (round-robin)', forms.size >= 3, [...forms].join(' | '));
const sizes = mt.vtms.map(v => { const L = mt.layoutGraph(mt.graph(v.id)); return [L.width, L.height]; }); const maxW = Math.max(...sizes.map(s => s[0])), maxH = Math.max(...sizes.map(s => s[1]));
ok('layout size is bounded (<= 1000 x 700)', maxW <= 1000 && maxH <= 700, `max ${maxW.toFixed(0)} x ${maxH.toFixed(0)}`);
const trunc = mt.vtms.reduce((s, v) => s + mt.layoutGraph(mt.graph(v.id)).nodes.filter(n => n.truncated).length, 0); console.log('info: labels shortened with "…" (full text stays in tooltip):', trunc);
res.forEach(r => console.log(r.join(' | '))); const f = res.filter(r => r[0] === 'FAIL').length; console.log(`\n${res.length - f}/${res.length} graph checks passed`); process.exit(f ? 1 : 0);
