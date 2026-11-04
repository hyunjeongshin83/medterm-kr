
/* MedTerm core — 약무용어 사전 검색 · 근거 프롬프트 · 답변 검증 (브라우저/Node 공용, 의존성 없음)
 * 주의: 사전에 있는 범위에서만 판정한다. '사전에 없음'은 환각의 증거가 아니라 확인 필요 신호이다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MedTermCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const HANGUL = /[가-힣]/;
  const PARTICLE_CHAIN = /^(?:이라고|이라는|이란|라고|라는|이며|이고|이다|입니다|입니다만|으로서|으로써|으로는|으로도|에서는|에서도|에서|에게서|에게|에는|에도|과의|와의|보다|처럼|까지|부터|조차|마저|밖에|이랑|하고|이나|로서|로써|으로|인데|인|은|는|이|가|을|를|의|와|과|도|로|에|만|나|랑|란|라|께|요|며|고|다)*$/;
  const NOUN_SUFFIX = /^(?:정|캡슐|제제|제|약|복용|투여|계열|성분|처방|용량|병용|단독|요법|이상|관련|등|류|주사|연고|시럽|패치)/;
  const KO_STEMS = ['프라졸','스타틴','사르탄','프릴','올롤','디핀','실린','마이신','플록사신','졸람','제팜','티딘','글립틴','글리플로진','티닙','비르','아졸','옥세틴','프람','록사반','가트란','트립탄','세트론','루카스트','타딘','놀롤','롤롤','딜롤','나졸','사반','세틴','카신','사이클린'];
  const EN_STEMS = ['prazole','statin','sartan','pril','olol','dipine','cillin','mycin','floxacin','azolam','azepam','tidine','gliptin','gliflozin','tinib','azole','oxetine','pram','xaban','gatran','triptan','setron','lukast','tadine'];
  const COMBO_CTX = /(복합제|복합 ?제|배합제|복합|combination)/i;   // 사전은 단일 성분만 수록 → 복합제 문장은 코드·계열을 검증하지 않는다
  const DAILY_CTX = /(하루|1일|일일|매일|최대|총|daily|per day|\/day|\bday\b)/i;

  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++)
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  const isEnLetter = (ch) => /[A-Za-z]/.test(ch || '');
  const mgOf = (value, unit) => {
    const u = unit.toLowerCase();
    if (u === 'mg' || u === '㎎' || u === '밀리그램') return value;
    if (u === 'mcg' || u === 'μg' || u === 'µg' || u === '㎍' || u === '마이크로그램') return value / 1000;
    if (u === 'g' || u === '그램') return value * 1000;
    return null;
  };
  const round6 = (x) => Math.round(x * 1e6) / 1e6;


  // ---------- 그래프용 글자 폭 추정(측정이 아니라 보수적 추정) ----------
  const NARROW = new Set("iljtfI.,:;'|!()[] ");
  function textPx(s, px) {
    let w = 0;
    for (const ch of String(s == null ? '' : s)) {
      const c = ch.codePointAt(0);
      if ((c >= 0xAC00 && c <= 0xD7A3) || (c >= 0x1100 && c <= 0x11FF) || (c >= 0x3130 && c <= 0x318F) || (c >= 0x4E00 && c <= 0x9FFF) || (c >= 0xFF00 && c <= 0xFFEF)) w += px;
      else if (NARROW.has(ch)) w += px * 0.34;
      else if (c < 128) w += px * 0.62;
      else w += px * 0.8;
    }
    return w;
  }
  function fitText(s, maxPx, px) {
    s = String(s == null ? '' : s); if (textPx(s, px) <= maxPx) return s;
    let out = ''; for (const ch of s) { if (textPx(out + ch + '…', px) > maxPx) break; out += ch; }
    return out + '…';
  }

  class MedTerm {
    constructor(data, classLexicon) {
      this.meta = data.meta; this.atcNames = data.atc || {};
      this.byId = new Map(); this.vtms = []; this.vmpsOf = new Map(); this.ampsOfVmp = new Map();
      for (const c of data.concepts) this.byId.set(c.id, c);
      for (const c of data.concepts) {
        if (c.type === 'VTM') this.vtms.push(c);
        else if (c.type === 'VMP') { if (!this.vmpsOf.has(c.ingredient)) this.vmpsOf.set(c.ingredient, []); this.vmpsOf.get(c.ingredient).push(c); }
        else if (c.type === 'AMP') { if (!this.ampsOfVmp.has(c.vmp)) this.ampsOfVmp.set(c.vmp, []); this.ampsOfVmp.get(c.vmp).push(c); }
      }
      this.classes = (classLexicon && classLexicon.classes) || [];
      // 표면형(이름) 사전
      this.surfaces = []; this.knownNames = new Set(); const seen = new Set();
      const add = (text, vtm, kind, lang) => {
        if (!text) return; const key = text.toLowerCase() + '|' + vtm.id; if (seen.has(key)) return; seen.add(key);
        this.surfaces.push({ text, lower: text.toLowerCase(), vtm, kind, lang });
        this.knownNames.add(text.toLowerCase());
      };
      for (const v of this.vtms) {
        add(v.label_ko, v, 'ingredient', 'ko'); (v.alt_ko || []).forEach(t => add(t, v, 'ingredient', 'ko'));
        add(v.label_en, v, 'ingredient', 'en'); (v.alt_en || []).forEach(t => add(t, v, 'ingredient', 'en'));
        (v.brands_ko || []).forEach(t => add(t, v, 'brand', 'ko'));
      }
      const nameToVtm = new Map(this.surfaces.filter(s => s.lang === 'en' && s.kind === 'ingredient').map(s => [s.lower, s.vtm.id]));
      for (const list of this.ampsOfVmp.values()) for (const a of list) {
        if (a.brand_en && !nameToVtm.has(a.brand_en.toLowerCase())) add(a.brand_en, this.byId.get(a.ingredient), 'brand', 'en');
      }
      this.surfaces.sort((a, b) => b.text.length - a.text.length);
      // 허용 단위용량(mg 환산) / 코드 역색인
      this.strengthsOf = new Map(); this.atcOwner = new Map(); this.rxcuiOwner = new Map();
      for (const v of this.vtms) {
        const set = new Set();
        for (const m of (this.vmpsOf.get(v.id) || [])) {
          this.rxcuiOwner.set(m.rxcui, v.id);
          if (!m.strength || m.strength.per) continue;
          const mg = mgOf(m.strength.value, m.strength.unit); if (mg !== null) set.add(round6(mg));
        }
        this.strengthsOf.set(v.id, set); this.rxcuiOwner.set(v.rxcui, v.id);
        for (const code of v.atc_codes || []) { if (!this.atcOwner.has(code)) this.atcOwner.set(code, []); this.atcOwner.get(code).push(v.id); }
      }
      for (const list of this.ampsOfVmp.values()) for (const a of list) this.rxcuiOwner.set(a.rxcui, a.ingredient);
      this.classWords = new Set(); for (const cl of this.classes) for (const a of cl.aliases) { this.classWords.add(a.toLowerCase()); const b = a.replace(/\s*(계열|계|류)$/, ''); if (b !== a) this.classWords.add(b.toLowerCase()); }
      this.knownList = this.surfaces.filter(s => s.lang === 'ko' || s.text.length >= 7).map(s => s.lower);
    }

    atcLabel(code) { return this.atcNames[code] || null; }

    // ---------- 검색 ----------
    search(q) {
      q = (q || '').trim().toLowerCase(); if (!q) return [];
      const hits = [];
      for (const v of this.vtms) {
        const names = [v.label_ko, v.label_en, ...(v.alt_ko || []), ...(v.alt_en || []), ...(v.brands_ko || [])].filter(Boolean).map(s => s.toLowerCase());
        let score = 0, via = null;
        for (const n of names) { if (n === q) { score = 100; via = '이름 일치'; break; } if (n.startsWith(q)) { score = Math.max(score, 80); via = '이름 접두'; } else if (n.includes(q)) { score = Math.max(score, 60); via = via || '이름 포함'; } }
        if (!score) {
          if ((v.atc_codes || []).some(c => c.toLowerCase().startsWith(q))) { score = 70; via = 'ATC 코드'; }
          else if (v.rxcui === q) { score = 95; via = 'RxCUI'; }
          else if ((v.snomed_ct || []).includes(q)) { score = 90; via = 'SNOMED CT ID'; }
        }
        if (!score) {  // 브랜드(AMP) / VMP 라벨
          const vmps = this.vmpsOf.get(v.id) || [];
          if (vmps.some(m => m.rxcui === q)) { score = 90; via = 'VMP RxCUI'; }
          else {
            for (const m of vmps) for (const a of (this.ampsOfVmp.get(m.id) || [])) if (a.brand_en && a.brand_en.toLowerCase().includes(q)) { score = 50; via = `브랜드(${a.brand_en})`; break; }
          }
        }
        if (score) hits.push({ vtm: v, score, via });
      }
      return hits.sort((a, b) => b.score - a.score);
    }

    describe(vtmId) {
      const v = this.byId.get(vtmId); if (!v) return null;
      const atc = (v.atc_codes || []).map(code => ({ code, path: (v.atc_paths[code] || []).map(c => ({ code: c, name: this.atcLabel(c) })) }));
      const vmps = (this.vmpsOf.get(vtmId) || []).map(m => ({ ...m, amps: this.ampsOfVmp.get(m.id) || [] }));
      const byForm = {};
      for (const m of vmps) (byForm[m.form_en] = byForm[m.form_en] || []).push(m);
      for (const f of Object.keys(byForm)) byForm[f].sort((a, b) => (a.strength.value - b.strength.value));
      return { vtm: v, atc, vmps, byForm };
    }


    // ---------- 관계 그래프(선택한 성분 중심의 ego-network) ----------
    // 열: sibling(같은 ATC 세부군의 다른 성분) · group(ATC 4단계) · atc(ATC 5단계 코드) · vtm · vmp · amp
    // 표시 상한을 넘으면 'more' 노드("외 N개")로 알린다. 숫자는 totals(전체)와 shown(표시)을 모두 돌려준다.
    graph(vtmId, opts = {}) {
      const v = this.byId.get(vtmId); if (!v || v.type !== 'VTM') return null;
      const o = Object.assign({ maxAtc: 6, maxSiblings: 6, maxVmp: 10, ampPerVmp: 2, maxAmp: 14 }, opts);
      const nodes = [], edges = [], seen = new Set();
      const add = n => { if (seen.has(n.id)) return n; seen.add(n.id); nodes.push(n); return n; };
      const edge = (from, to, rel) => { if (!edges.some(e => e.from === from && e.to === to && e.rel === rel)) edges.push({ from, to, rel }); };
      const totals = { atc: 0, siblings: 0, vmp: 0, amp: 0 }, shown = { atc: 0, siblings: 0, vmp: 0, amp: 0 };
      add({ id: v.id, kind: 'vtm', col: 'vtm', line1: v.label_ko || v.label_en, line2: `${v.label_en} · RxCUI ${v.rxcui}`, title: `${v.label_ko} (${v.label_en}) · ${v.id} · RxCUI ${v.rxcui}`, action: null });
      // ATC 코드·세부군
      const codes = v.atc_codes || []; totals.atc = codes.length;
      const shownCodes = codes.slice(0, o.maxAtc); shown.atc = shownCodes.length;
      const groupCodes = [];
      for (const code of shownCodes) {
        const path = (v.atc_paths || {})[code] || []; const g = path.length ? path[path.length - 1] : code.slice(0, 5);
        add({ id: 'atc:' + code, kind: 'atc', col: 'atc', line1: code, line2: this.atcLabel(code) || '', title: `ATC ${code}${this.atcLabel(code) ? ' · ' + this.atcLabel(code) : ''}`, action: { type: 'filter', value: code } });
        add({ id: 'grp:' + g, kind: 'group', col: 'group', line1: g, line2: this.atcLabel(g) || '', title: `ATC ${g}${this.atcLabel(g) ? ' · ' + this.atcLabel(g) : ''} (세부군)`, action: { type: 'filter', value: g } });
        edge(v.id, 'atc:' + code, 'hasATC'); edge('atc:' + code, 'grp:' + g, 'broader');
        if (!groupCodes.includes(g)) groupCodes.push(g);
      }
      if (totals.atc > shown.atc) add({ id: 'more:atc', kind: 'more', col: 'atc', line1: `외 ${totals.atc - shown.atc}개`, line2: 'ATC 코드', title: `표시 상한(${o.maxAtc}개) 때문에 ATC 코드 ${totals.atc - shown.atc}개를 생략했습니다. 전체는 오른쪽 상세에 있습니다.`, action: null });
      // 같은 세부군의 다른 성분
      const sibs = this.vtms.filter(u => u.id !== v.id && (u.atc_codes || []).some(c => groupCodes.some(g => c.startsWith(g)))).sort((a, b) => String(a.label_ko).localeCompare(String(b.label_ko), 'ko'));
      totals.siblings = sibs.length; const shownSibs = sibs.slice(0, o.maxSiblings); shown.siblings = shownSibs.length;
      for (const u of shownSibs) {
        add({ id: u.id, kind: 'sibling', col: 'sibling', line1: u.label_ko || u.label_en, line2: u.label_en, title: `${u.label_ko} (${u.label_en}) · ${u.id} — 눌러서 이 성분으로 이동`, action: { type: 'select', id: u.id } });
        for (const g of groupCodes) if ((u.atc_codes || []).some(c => c.startsWith(g))) edge(u.id, 'grp:' + g, 'sameGroup');
      }
      if (totals.siblings > shown.siblings) add({ id: 'more:sibling', kind: 'more', col: 'sibling', line1: `외 ${totals.siblings - shown.siblings}개`, line2: '같은 세부군 성분', title: `표시 상한(${o.maxSiblings}개) 때문에 ${totals.siblings - shown.siblings}개를 생략했습니다.`, action: null });
      // VMP(제형별로 돌려가며 고른다) → AMP
      const vmps = this.vmpsOf.get(v.id) || []; totals.vmp = vmps.length;
      totals.amp = vmps.reduce((s, m) => s + (this.ampsOfVmp.get(m.id) || []).length, 0);
      const byForm = new Map(); for (const m of vmps) { if (!byForm.has(m.form_en)) byForm.set(m.form_en, []); byForm.get(m.form_en).push(m); }
      const queues = [...byForm.entries()].sort((a, b) => b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0]))).map(([, l]) => l.slice().sort((x, y) => (x.strength.value - y.strength.value) || String(x.id).localeCompare(String(y.id))));
      const picked = []; while (picked.length < Math.min(o.maxVmp, vmps.length)) { let any = false; for (const q of queues) { if (q.length && picked.length < o.maxVmp) { picked.push(q.shift()); any = true; } } if (!any) break; }
      picked.sort((a, b) => String(a.form_en).localeCompare(String(b.form_en)) || (a.strength.value - b.strength.value) || String(a.id).localeCompare(String(b.id)));
      shown.vmp = picked.length;
      for (const m of picked) {
        const nAmp = (this.ampsOfVmp.get(m.id) || []).length;
        add({ id: m.id, kind: 'vmp', col: 'vmp', line1: `${m.strength.raw}${m.release_tech ? ' · ' + m.release_tech : ''}`, line2: m.form_en || '', title: `${m.label_en} · ${m.id}${m.form_ko ? ' · ' + m.form_ko : ''} · 제품(AMP) ${nAmp}개`, action: null });
        edge(v.id, m.id, 'hasVMP');
      }
      if (totals.vmp > shown.vmp) add({ id: 'more:vmp', kind: 'more', col: 'vmp', line1: `외 ${totals.vmp - shown.vmp}개`, line2: '제형·용량(VMP)', title: `표시 상한(${o.maxVmp}개) 때문에 VMP ${totals.vmp - shown.vmp}개를 생략했습니다. 제형별 전체 목록은 오른쪽 상세에 있습니다.`, action: null });
      for (const m of picked) {
        if (shown.amp >= o.maxAmp) break;
        const list = (this.ampsOfVmp.get(m.id) || []).slice().sort((a, b) => String(a.brand_en).localeCompare(String(b.brand_en)) || String(a.id).localeCompare(String(b.id)));
        for (const a of list.slice(0, o.ampPerVmp)) {
          if (shown.amp >= o.maxAmp) break;
          add({ id: a.id, kind: 'amp', col: 'amp', line1: a.brand_en || a.label_en, line2: `RxCUI ${a.rxcui}`, title: `${a.label_en} · ${a.id} · ${a.market}`, action: null });
          edge(m.id, a.id, 'hasAMP'); shown.amp++;
        }
      }
      if (totals.amp > shown.amp) add({ id: 'more:amp', kind: 'more', col: 'amp', line1: `외 ${totals.amp - shown.amp}개`, line2: '제품(AMP)', title: `표시 상한 때문에 제품(AMP) ${totals.amp - shown.amp}개를 생략했습니다(VMP당 최대 ${o.ampPerVmp}개, 전체 ${o.maxAmp}개).`, action: null });
      return { center: v.id, nodes, edges, totals, shown, limits: o };
    }

    // 좌표 계산(DOM 없이): 열별로 세로 가운데 정렬. 비어 있는 열은 건너뛴다.
    layoutGraph(g, m = {}) {
      const M = Object.assign({ nodeW: 132, nodeH: 34, colGap: 30, rowGap: 8, pad: 12, headH: 22, font1: 11.5, font2: 10, padX: 7 }, m);
      const ORDER = ['sibling', 'group', 'atc', 'vtm', 'vmp', 'amp'];
      const HEAD = { sibling: '같은 세부군 성분', group: 'ATC 세부군', atc: 'ATC 코드', vtm: '성분(VTM)', vmp: '제형·용량(VMP)', amp: '제품(AMP)' };
      const cols = ORDER.filter(c => g.nodes.some(n => n.col === c));
      const rowH = M.nodeH + M.rowGap, maxRows = Math.max(1, ...cols.map(c => g.nodes.filter(n => n.col === c).length));
      const bodyH = maxRows * rowH - M.rowGap;
      const W = M.pad * 2 + cols.length * M.nodeW + (cols.length - 1) * M.colGap, H = M.pad * 2 + M.headH + bodyH;
      const placed = new Map(), headers = [];
      cols.forEach((c, ci) => {
        const x = M.pad + ci * (M.nodeW + M.colGap); const list = g.nodes.filter(n => n.col === c); const blockH = list.length * rowH - M.rowGap;
        const y0 = M.pad + M.headH + (bodyH - blockH) / 2; headers.push({ col: c, text: HEAD[c], x: x + M.nodeW / 2, y: M.pad + M.headH - 8 });
        list.forEach((n, i) => {
          const t1 = fitText(n.line1, M.nodeW - 2 * M.padX, M.font1), t2 = n.line2 ? fitText(n.line2, M.nodeW - 2 * M.padX, M.font2) : '';
          placed.set(n.id, Object.assign({}, n, { x, y: y0 + i * rowH, w: M.nodeW, h: M.nodeH, t1, t2, truncated: t1 !== n.line1 || t2 !== (n.line2 || ''), w1: textPx(t1, M.font1), w2: textPx(t2, M.font2) }));
        });
      });
      const laid = g.edges.map(e => {
        const a = placed.get(e.from), b = placed.get(e.to); if (!a || !b) return null;
        const [l, r] = a.x <= b.x ? [a, b] : [b, a]; const x1 = l.x + l.w, y1 = l.y + l.h / 2, x2 = r.x, y2 = r.y + r.h / 2, dx = Math.max(12, (x2 - x1) / 2);
        return { from: e.from, to: e.to, rel: e.rel, x1, y1, x2, y2, d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` };
      }).filter(Boolean);
      return { width: W, height: H, nodes: [...placed.values()], edges: laid, headers, metrics: M, center: g.center };
    }

    // ---------- 언급 추출 ----------
    findMentions(text) {
      const lower = text.toLowerCase(); const cands = [];
      for (const s of this.surfaces) {
        let from = 0; const t = s.lower;
        while (true) {
          const i = lower.indexOf(t, from); if (i < 0) break; from = i + 1; const e = i + t.length;
          if (s.lang === 'en') { if (isEnLetter(lower[i - 1]) || isEnLetter(lower[e])) continue; }
          else {
            if (HANGUL.test(lower[i - 1] || '') && t.length <= 3) continue;           // 짧은 이름이 다른 단어 안에서 매칭되는 것 방지
            if (t.length <= 2 && HANGUL.test(lower[e] || '')) {
              const rest = text.slice(e, e + 3); if (!/^(?:은|는|이|가|을|를|의|와|과|도|로|에)/.test(rest)) continue;
            }
          }
          cands.push({ start: i, end: e, text: text.slice(i, e), vtm: s.vtm, kind: s.kind, lang: s.lang });
        }
      }
      cands.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
      const taken = []; const out = [];
      for (const c of cands) { if (taken.some(r => c.start < r[1] && c.end > r[0])) continue; taken.push([c.start, c.end]); out.push(c); }
      return out.sort((a, b) => a.start - b.start);
    }

    // 질문에서 사전 항목(VTM id)을 찾는다: 이름 언급 + 토큰 검색(이름 일치/접두 이상만)
    retrieve(question, max = 5) {
      const ids = []; const push = (id) => { if (!ids.includes(id)) ids.push(id); };
      this.findMentions(question).forEach(m => push(m.vtm.id));
      question.split(/[\s,，、]+/).filter(t => t.length >= 2).forEach(t => this.search(t).filter(x => x.score >= 80).slice(0, 2).forEach(x => push(x.vtm.id)));
      return ids.slice(0, max);
    }

    // ---------- 근거 기반 컨텍스트/프롬프트 ----------
    contextFor(vtmIds, opts = {}) {
      const maxStrengths = opts.maxStrengths || 12;
      return vtmIds.map(id => {
        const d = this.describe(id), v = d.vtm;
        const strengths = [...(this.strengthsOf.get(id) || [])].sort((a, b) => a - b).slice(0, maxStrengths);
        return {
          id: v.id, name_ko: v.label_ko, name_en: v.label_en, alt: [...(v.alt_ko || []), ...(v.alt_en || [])], brands_ko: v.brands_ko || [],
          rxcui: v.rxcui, snomed_ct: v.snomed_ct || [], review_status: v.review_status,
          atc: d.atc.map(a => ({ code: a.code, class4: (a.path.find(p => p.code.length === 5) || {}).name || null })),
          unit_strengths_mg_rxnorm_us: strengths
        };
      });
    }
    buildGroundedPrompt(question, vtmIds) {
      const ctx = this.contextFor(vtmIds);
      const system = [
        '당신은 약무용어 사전에 근거해서만 답하는 보조자입니다.',
        '규칙 1) 아래 <사전> 항목에 있는 사실(이름, RxCUI, ATC 코드/계열, 단위용량)만 사용하고, 항목 ID(예: MT:VTM:7646)를 근거로 표기하세요.',
        '규칙 2) <사전>에 없는 약물·코드·용량은 추측하지 말고 "사전에 없어 확인할 수 없음"이라고 답하세요.',
        '규칙 3) 개인별 복용량·진단·처방 판단은 하지 말고, 의사·약사 상담을 안내하세요.',
        '규칙 4) 단위용량은 미국 RxNorm 기준이며 국내 허가 규격과 다를 수 있음을 명시하세요.'
      ].join('\n');
      const body = ctx.length ? JSON.stringify(ctx, null, 1) : `(이 질문과 일치하는 사전 항목이 없음. 사전 전체에는 ${this.vtms.length}개 성분이 수록되어 있으나 이 질문의 약물은 포함되어 있지 않음)`;
      const user = '<사전>\n' + body + '\n</사전>\n\n질문: ' + question;
      return { system, user, context: ctx };
    }

    // ---------- 답변 검증 ----------
    verify(text) {
      const findings = []; const mentions = this.findMentions(text);
      const sentBounds = []; { const re = /[!?。\n]|\.(?!\d)/g; let last = 0, m; while ((m = re.exec(text))) { sentBounds.push([last, m.index + 1]); last = m.index + 1; } sentBounds.push([last, text.length]); }
      const sentOf = (pos) => sentBounds.find(b => pos >= b[0] && pos < b[1]) || [0, text.length];
      const mentionsIn = (b) => mentions.filter(m => m.start >= b[0] && m.end <= b[1]);
      const nearest = (list, start, end) => list.slice().sort((a, b) => Math.min(Math.abs(start - a.end), Math.abs(a.start - end)) - Math.min(Math.abs(start - b.end), Math.abs(b.start - end)))[0];
      const F = (severity, type, start, end, message, extra = {}) => findings.push({ severity, type, start, end, text: text.slice(start, end), message, ...extra });

      // 1) 알려진 약물 언급 + 철자 변형(near-miss)
      const claimed = []; // near-miss 영역(알려진 이름 뒤에 붙은 비허용 접미)
      for (const m of mentions) {
        let end = m.end, flagged = false;
        if (m.lang === 'ko' && m.start > 0 && HANGUL.test(text[m.start - 1])) {
          let rs = m.start; while (rs > 0 && HANGUL.test(text[rs - 1])) rs--;
          let re2 = m.end; while (re2 < text.length && HANGUL.test(text[re2])) re2++;
          let tail = text.slice(m.end, re2); let w2 = text.slice(rs, re2);
          for (let k = 0; k <= Math.min(3, tail.length); k++) { if (PARTICLE_CHAIN.test(tail.slice(tail.length - k))) { w2 = text.slice(rs, re2 - k); break; } }
          flagged = true; claimed.push([rs, re2]);
          F('warn', 'near_miss', rs, rs + w2.length, `'${w2}'은(는) 사전에 없으며 사전의 '${m.text}' 앞에 다른 음절이 붙은 형태입니다(다른 약물명이거나 변형일 수 있음).`, { suggest: m.vtm.label_ko });
        }
        else if (m.lang === 'ko') {
          let re = end; while (re < text.length && HANGUL.test(text[re])) re++;
          const left = text.slice(end, re);
          if (left && !PARTICLE_CHAIN.test(left) && !NOUN_SUFFIX.test(left) && left.length <= 3) {
            flagged = true; claimed.push([m.start, re]);
            F('warn', 'near_miss', m.start, re, `'${text.slice(m.start, re)}'은(는) 사전의 '${m.text}'과(와) 철자가 다릅니다(변형·오타 의심). 사전에 없는 이름입니다.`, { suggest: m.vtm.label_ko });
          }
        }
        if (!flagged) F('ok', 'known_term', m.start, m.end, `사전 일치: ${m.vtm.label_ko || m.vtm.label_en} (${m.vtm.id}${m.kind === 'brand' ? ', 상품명→성분' : ''})`, { vtm: m.vtm.id });
      }
      const covered = (s, e) => mentions.some(m => s < m.end && e > m.start) || claimed.some(r => s < r[1] && e > r[0]) ||
        findings.some(f => (f.type === 'unknown_drug' || f.type === 'near_miss') && s < f.end && e > f.start);

      // 2) 사전에 없는 약물명 후보(INN 어간 휴리스틱) — 한국어
      const koRe = /[가-힣]{3,}/g; let km;
      while ((km = koRe.exec(text))) {
        const tok = km[0], s0 = km.index; if (covered(s0, s0 + tok.length)) continue;
        // 어미가 조사일 수도, 이름의 일부일 수도 있다(예: 다비가트란 vs 이란) → 어간으로 끝나는 가장 짧은 절단을 우선
        let w = null, wStrip = tok;
        for (let k = 0; k <= Math.min(3, tok.length - 2); k++) {
          const head = tok.slice(0, tok.length - k), tail = tok.slice(tok.length - k);
          if (k > 0 && !PARTICLE_CHAIN.test(tail)) continue;
          if (KO_STEMS.some(st => head.endsWith(st))) { w = head; break; }
          wStrip = head;
        }
        if (w === null) w = wStrip;
        if (w.length < 4) continue;
        if (this.knownNames.has(w.toLowerCase()) || this.classWords.has(w.toLowerCase())) continue;
        const stem = KO_STEMS.find(st => w.endsWith(st));
        const near = this.surfaces.filter(s => s.lang === 'ko' && s.kind === 'ingredient' && s.text.length >= 4).map(s => [lev(w, s.text), s]).sort((a, b) => a[0] - b[0])[0];
        if (!stem && !(near && near[0] <= 1)) continue;
        if (near && near[0] <= (stem ? 2 : 1)) F('warn', 'near_miss', s0, s0 + w.length, `'${w}'은(는) 사전에 없으며 '${near[1].text}'과(와) 비슷합니다(철자 변형 의심).`, { suggest: near[1].text });
        else F('warn', 'unknown_drug', s0, s0 + w.length, `'${w}'은(는) 약물명 어미(-${stem})를 가졌으나 사전에 없습니다. 실존 약물일 수도, 생성된 이름일 수도 있어 확인이 필요합니다.`);
      }
      // 영어
      const enRe = /[A-Za-z][A-Za-z\-]{5,}/g; let em;
      while ((em = enRe.exec(text))) {
        const w = em[0], s0 = em.index; if (covered(s0, s0 + w.length)) continue;
        const lw = w.toLowerCase(); if (this.knownNames.has(lw)) continue;
        const stem = EN_STEMS.find(st => lw.endsWith(st) && lw.length >= 7);
        const near = this.surfaces.filter(s => s.lang === 'en' && s.kind === 'ingredient' && s.text.length >= 7).map(s => [lev(lw, s.lower), s]).sort((a, b) => a[0] - b[0])[0];
        const tol = lw.length >= 9 ? 2 : 1;
        if (!stem && !(near && near[0] <= tol)) continue;
        if (near && near[0] <= (stem ? 2 : tol)) F('warn', 'near_miss', s0, s0 + w.length, `'${w}'은(는) 사전에 없으며 '${near[1].text}'과(와) 비슷합니다(철자 변형 의심).`, { suggest: near[1].text });
        else F('warn', 'unknown_drug', s0, s0 + w.length, `'${w}'은(는) 약물명 어미(-${stem})를 가졌으나 사전에 없습니다. 확인이 필요합니다.`);
      }

      // 3) ATC 코드
      const atcRe = /\b[A-Z]\d{2}[A-Z]{2}(?:\d{2})?\b/g; let am;
      while ((am = atcRe.exec(text))) {
        const code = am[0], s0 = am.index, e0 = s0 + code.length, b = sentOf(s0), ms = mentionsIn(b);
        const owners = new Set(); for (const [c, ids] of this.atcOwner) if (c.startsWith(code)) ids.forEach(i => owners.add(i));
        if (!ms.length) {
          if (!owners.size) F('warn', 'atc_unverifiable', s0, e0, `ATC 코드 ${code}: 같은 문장에 사전 약물이 없고, 사전의 어떤 약물 코드와도 일치하지 않아 검증할 수 없습니다.`);
          continue;
        }
        const ok = ms.find(m => (m.vtm.atc_codes || []).some(c => c.startsWith(code)));
        if (ok) F('ok', 'atc_ok', s0, e0, `ATC ${code} ↔ ${ok.vtm.label_ko} 일치`);
        else {
          const nm = nearest(ms, s0, e0), ownerNames = [...owners].map(i => this.byId.get(i).label_ko).join(', ');
          if (COMBO_CTX.test(text.slice(b[0], b[1]))) { F('info', 'combo_context', s0, e0, `ATC ${code}: 복합제 맥락이라 단일 성분 사전으로는 검증할 수 없습니다.`); continue; }
          F('error', 'atc_mismatch', s0, e0, `ATC ${code}는 '${nm.vtm.label_ko}'의 코드가 아닙니다. 사전 기준 ${nm.vtm.label_ko}: ${(nm.vtm.atc_codes || []).join(', ')}.` + (ownerNames ? ` (${code}는 ${ownerNames}의 코드)` : ''), { expected: nm.vtm.atc_codes });
        }
      }
      // 4) RxCUI
      const rxRe = /rxcui\s*[:=]?\s*(\d{2,7})/gi; let rm;
      while ((rm = rxRe.exec(text))) {
        const id = rm[1], s0 = rm.index, e0 = s0 + rm[0].length, b = sentOf(s0), ms = mentionsIn(b), owner = this.rxcuiOwner.get(id);
        if (!owner) { F('warn', 'rxcui_unverifiable', s0, e0, `RxCUI ${id}는 사전에 없어 검증할 수 없습니다.`); continue; }
        if (!ms.length) continue;
        if (ms.some(m => m.vtm.id === owner)) F('ok', 'rxcui_ok', s0, e0, `RxCUI ${id} 일치`);
        else { const nm = nearest(ms, s0, e0); F('error', 'rxcui_mismatch', s0, e0, `RxCUI ${id}는 '${this.byId.get(owner).label_ko}'의 식별자이며 '${nm.vtm.label_ko}'가 아닙니다.`); }
      }
      // 5) 계열(ATC 분류) 주장 — 더 긴 용어에 포함된 짧은 용어는 제외(예: '비스테로이드성 소염진통제' 속 '스테로이드'/'진통제')
      const lowerAll = text.toLowerCase(), clsHits = [];
      for (const cl of this.classes) for (const alias of cl.aliases) {
        const al = alias.toLowerCase(); let from = 0;
        while (true) {
          const i = lowerAll.indexOf(al, from); if (i < 0) break; from = i + al.length; const e = i + al.length;
          if (/[A-Za-z]/.test(alias[0]) && (isEnLetter(lowerAll[i - 1]) || isEnLetter(lowerAll[e]))) continue;
          if (covered(i, e)) continue;
          if (alias.startsWith('스테로이드') && lowerAll[i - 1] === '비') continue;   // '비스테로이드성 …'(NSAID)
          clsHits.push({ cl, alias, i, e });
        }
      }
      clsHits.sort((a, b) => (b.e - b.i) - (a.e - a.i));
      const keptCls = []; for (const h of clsHits) { if (keptCls.some(k => h.i >= k.i && h.e <= k.e)) continue; keptCls.push(h); }
      for (const { cl, i, e } of keptCls.sort((a, b) => a.i - b.i)) {
        const b = sentOf(i), ms = mentionsIn(b); if (!ms.length) continue;
        const consistent = ms.find(m => (m.vtm.atc_codes || []).some(c => cl.atc.some(p => c.startsWith(p))));
        const distinct = new Set(ms.map(m => m.vtm.id)).size;
        if (consistent) F('ok', 'class_ok', i, e, `계열 '${cl.label}' ↔ ${consistent.vtm.label_ko} 일치(ATC ${cl.atc.join('/')})`);
        else if (COMBO_CTX.test(text.slice(b[0], b[1]))) F('info', 'combo_context', i, e, `계열 '${cl.label}': 복합제 맥락이라 단일 성분 사전으로는 검증할 수 없습니다.`);
        else { const nm = nearest(ms, i, e); F(distinct === 1 ? 'error' : 'warn', 'class_mismatch', i, e, `'${nm.vtm.label_ko}'은(는) 사전 기준 '${cl.label}'(ATC ${cl.atc.join('/')})에 속하지 않습니다. 사전 ATC: ${(nm.vtm.atc_codes || []).join(', ')}.`, { expected: nm.vtm.atc_codes }); }
      }
      // 6) 단위용량 (약물 언급 직후 창)
      const numRe = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(mg|mcg|μg|µg|㎍|㎎|g|밀리그램|마이크로그램|그램)(?![A-Za-z\/])/gi;
      for (let i = 0; i < mentions.length; i++) {
        const m = mentions[i]; const b = sentOf(m.start);
        const stop = Math.min(b[1], i + 1 < mentions.length ? mentions[i + 1].start : text.length, m.end + 30);
        const win = text.slice(m.end, stop); numRe.lastIndex = 0; let nm;
        while ((nm = numRe.exec(win))) {
          const s0 = m.end + nm.index, e0 = s0 + nm[0].length; const val = parseFloat(nm[1].replace(/,/g, '')); const mg = mgOf(val, nm[2]);
          if (mg === null) continue;
          const pre = win.slice(Math.max(0, nm.index - 10), nm.index);
          if (DAILY_CTX.test(pre)) { F('info', 'dose_context', s0, e0, `${nm[0]}: 1일 총량/최대량 맥락이라 단위용량 사전으로는 검증할 수 없습니다(임상 판단 필요).`); continue; }
          const allowed = this.strengthsOf.get(m.vtm.id) || new Set();
          if (allowed.has(round6(mg))) F('ok', 'strength_ok', s0, e0, `${m.vtm.label_ko} ${nm[0]}: RxNorm(미국) 단위용량 목록에 있음`);
          else F('warn', 'strength_not_listed', s0, e0, `${m.vtm.label_ko} ${nm[0]}: RxNorm(미국) 단위용량 목록에 없습니다(국내 규격은 별도 확인 필요). 목록: ${[...allowed].sort((a, b) => a - b).slice(0, 12).join(', ')} mg`, { allowed: [...allowed] });
        }
      }
      findings.sort((a, b) => a.start - b.start || a.end - b.end);
      const count = (s) => findings.filter(f => f.severity === s).length;
      const summary = { error: count('error'), warn: count('warn'), info: count('info'), ok: count('ok'), mentions: mentions.length };
      summary.verdict = summary.error ? 'inconsistent' : summary.warn ? 'needs_review' : 'no_conflict_found';
      return { findings, mentions, summary };
    }

    // 하이라이트용 구간 분할(우선순위 error > warn > info > ok)
    annotate(text, findings) {
      const rank = { error: 4, warn: 3, info: 2, ok: 1 }; const cut = new Set([0, text.length]);
      findings.forEach(f => { cut.add(f.start); cut.add(f.end); });
      const pts = [...cut].sort((a, b) => a - b), segs = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const s = pts[i], e = pts[i + 1]; if (s === e) continue;
        const cover = findings.filter(f => f.start <= s && f.end >= e).sort((a, b) => rank[b.severity] - rank[a.severity]);
        segs.push({ text: text.slice(s, e), severity: cover[0] ? cover[0].severity : null, findings: cover });
      }
      return segs;
    }
  }
  return { MedTerm, lev, mgOf, textPx, fitText };
});
