/* MedTerm layers — 최신 승인·임상·화합물 연결(data/medterm_new.json) · 국내 제품(품목) 계층(data/medterm_kr_products.json) · 약사법 용어·기구 층(data/medterm_law.json)
 * core.js(MedTerm) 위에 얹는 읽기 전용 층이다. 핵심·확장 사전 자체는 바꾸지 않는다. 브라우저/Node 공용, 의존성 없음.
 * 주의: 임상시험 수치는 등록 건수 요약이고, 제품 묶음·한약 표시는 규칙 기반 추정이며, 대체 후보는 같은 일반명코드일 뿐 대체조제 판정이 아니다.
 *       약사법 층은 법령 원문의 짧은 발췌와 쉬운 풀이(초안)이며 법률 자문이 아니다(약사 검수 전, 법제처 현행본 대조 전). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MedTermLayers = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PHASE_ORDER = ['4', '3', '2/3', '2', '1/2', '1', '0'];                       // 앞선 단계부터(허가 후 4상이 가장 뒤 단계)
  const PHASE_RANK = { '4': 6, '3': 5, '2/3': 4, '2': 3, '1/2': 2, '1': 1, '0': 0 };
  const KIND = ['전문의약품', '일반의약품'];
  const lc = (s) => String(s == null ? '' : s).toLowerCase();

  class Layers {
    constructor(mt, news, prods, law) {
      this.mt = mt;
      this._initNew(news);
      this._initProducts(prods);
      this._initLaw(law);
    }

    // ================= 최신 승인 · 임상 · 화합물 =================
    _initNew(news) {
      this.news = news && Array.isArray(news.novel) ? news : null;
      this.newMeta = this.news ? (this.news.meta || {}) : null;
      this.entKeys = new Map();     // 사전 항목 id → [성분 이름 열쇠]
      this.novelByKey = new Map();  // 성분 이름 열쇠 → [FDA 신약 항목]
      this.skOf = new Map();        // 성분 이름 열쇠 → 같은 골격 묶음의 다른 이름들
      this.unq = { tr: new Set(), ch: new Set() };   // 아직 조회하지 않은 이름(수집이 끝나지 않았을 때만 있음)
      if (!this.news) return;
      if (this.news.unq) this.unq = { tr: new Set(this.news.unq.tr || []), ch: new Set(this.news.unq.ch || []) };
      for (const [k, id] of Object.entries(this.news.ent || {})) { if (!this.entKeys.has(id)) this.entKeys.set(id, []); this.entKeys.get(id).push(k); }
      for (const x of this.news.novel) { if (!this.novelByKey.has(x.k)) this.novelByKey.set(x.k, []); this.novelByKey.get(x.k).push(x); }
      for (const ks of Object.values(this.news.sk || {})) for (const k of ks) this.skOf.set(k, ks.filter((o) => o !== k));
    }
    get hasNew() { return !!this.news; }
    novelYears() { return this.news ? [...new Set(this.news.novel.map((x) => x.y))].sort((a, b) => b - a) : []; }

    /** FDA 신약 목록(승인일 내림차순). opts: {year, q, linked(사전 연결만)} */
    novelList(opts = {}) {
      if (!this.news) return [];
      const q = lc(opts.q).trim();
      return this.news.novel.filter((x) => (!opts.year || x.y === opts.year) && (!opts.linked || x.e) && (!q || lc(x.b).includes(q) || lc(x.g).includes(q) || lc(x.u).includes(q) || lc(x.d).startsWith(q)));
    }
    /** 이름(상표·성분)으로 신약 찾기 — 사전 검색 화면의 보조 결과용 */
    searchNovel(q, limit = 8) {
      const n = lc(q).trim(); if (!this.news || n.length < 3) return [];
      const out = [];
      for (const x of this.news.novel) {
        const b = lc(x.b), g = lc(x.g);
        const s = b === n || g === n ? 100 : b.startsWith(n) || g.startsWith(n) ? 80 : b.includes(n) || g.includes(n) ? 60 : 0;
        if (s) out.push({ x, s });
      }
      return out.sort((a, b) => b.s - a.s || (a.x.d < b.x.d ? 1 : -1)).slice(0, limit).map((o) => o.x);
    }
    /** 임상이 진행·예정인 성분 이름(열쇠) 목록 — 최근 시작(예정 포함) 순.
     *  opts: {filter: 'p3'|'p2'|'nyr'|'recent'|'all'(기본 all), industry(산업체 주관 시험이 있는 것만), hideCommon(등록 1,000건 이상 = 흔히 쓰는 약·비교약 제외),
     *         hideKr(국내 등재 단일성분이 있는 성분 제외), today('YYYY-MM', 기본 오늘)}.
     *  진행·예정 = 진행 중(act) 또는 모집 예정(nyr) 시험이 하나라도 있음. 3상 = 3상 또는 2/3상, 2상 = 2상·2/3상·1/2상이 있음. */
    pipelineList(opts = {}) {
      if (!this.news) return [];
      const f = opts.filter || 'all', tr = this.news.tr, ent = this.news.ent || {};
      let today = opts.today; if (!today) { const d = new Date(); today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
      const [ty, tm] = today.split('-').map(Number), tt = ty * 12 + (tm - 1) - 12, from = `${Math.floor(tt / 12)}-${String((tt % 12) + 1).padStart(2, '0')}`;
      const out = [];
      for (const k of Object.keys(tr)) {
        const t = tr[k], st = t.st || {}, ph = t.ph || {};
        if (!((st.act || 0) + (st.nyr || 0) > 0)) continue;
        if (opts.industry && !t.ind) continue;
        if (opts.hideCommon && t.cap) continue;
        const e = ent[k] || '';
        if (opts.hideKr && e && this.mt && this.mt.extById && ((this.mt.extById.get(e) || {}).rec || {}).kr) continue;
        const late = ph['3'] || ph['2/3'], mid = ph['2'] || ph['2/3'] || ph['1/2'];
        if (f === 'p3' && !late) continue;
        if (f === 'p2' && !mid) continue;
        if (f === 'nyr' && !st.nyr) continue;
        if (f === 'recent' && !(t.ls && t.ls >= from)) continue;
        out.push({ k, t, e });
      }
      return out.sort((a, b) => { const x = a.t.ls || '', y = b.t.ls || ''; return x < y ? 1 : x > y ? -1 : (b.t.n - a.t.n) || (a.k < b.k ? -1 : 1); });
    }
    trialsFor(key) { return this.news ? (this.news.tr[key] || null) : null; }
    chemFor(key) { return this.news ? (this.news.ch[key] || null) : null; }
    /** 임상 요약을 화면용 값으로: 가장 앞선 단계, 상태별 건수, 단계별 건수(앞선 단계부터) */
    trialStage(tr) {
      if (!tr) return null;
      const ph = tr.ph || {}; const st = tr.st || {};
      const top = PHASE_ORDER.find((p) => ph[p]) || (ph.NA ? 'NA' : null);
      const phases = [...PHASE_ORDER, 'NA'].filter((p) => ph[p]).map((p) => ({ phase: p, n: ph[p] }));
      return { top, phases, active: st.act || 0, planned: st.nyr || 0, done: st.done || 0, stopped: st.stop || 0, unknown: st.unk || 0, total: tr.n, capped: !!tr.cap, industry: tr.ind || 0 };
    }
    phaseLabel(p) { const L = (this.newMeta && this.newMeta.phase_legend) || {}; return L[p] || (p === 'NA' ? '해당 없음' : p + '상'); }
    /** 같은 성분이 아닌, 구조가 가까운 사전 성분들: 같은 골격(입체이성질체 등)과 2D 유사 이웃 */
    linksOf(key) {
      if (!this.news) return { skeleton: [], similar: [] };
      const nameOf = (k) => { const id = (this.news.ent || {})[k]; const v = id ? this.mt.anyById(id) : null; return { key: k, id: id || null, label: v ? (v.label_ko || v.label_en) : k, inDict: !!v, cid: (this.news.ch[k] || {}).cid || null }; };
      return { skeleton: (this.skOf.get(key) || []).map(nameOf), similar: ((this.news.sim || {})[key] || []).map(nameOf) };
    }
    /** 사전 항목(id)에 붙는 신약·임상·화합물 정보. 이름 열쇠가 여럿이면 임상 건수가 많은 것을 대표로 쓴다. */
    forEntity(id) {
      if (!this.news) return null;
      const keys = this.entKeys.get(id) || []; if (!keys.length) return null;
      const key = [...keys].sort((a, b) => ((this.news.tr[b] || {}).n || 0) - ((this.news.tr[a] || {}).n || 0))[0];
      const tr = this.trialsFor(key), ch = this.chemFor(key);
      const novel = keys.flatMap((k) => this.novelByKey.get(k) || []);
      const trPending = !tr && this.unq.tr.has(key);
      if (!tr && !ch && !novel.length && !trPending) return null;
      return { key, tr, stage: this.trialStage(tr), ch, novel, links: this.linksOf(key), trPending };
    }
    /** 새 약 이름(열쇠)로 직접 찾은 정보 — 사전에 없는 신약용 */
    forKey(key) {
      if (!this.news) return null;
      const tr = this.trialsFor(key), ch = this.chemFor(key);
      return { key, tr, stage: this.trialStage(tr), ch, novel: this.novelByKey.get(key) || [], links: this.linksOf(key), trPending: !tr && this.unq.tr.has(key) };
    }

    // ================= 약사법 용어·기구 (data/medterm_law.json) =================
    _initLaw(law) {
      this.law = law && Array.isArray(law.e) ? law : null;
      this.lawMeta = this.law ? (this.law.meta || {}) : null;
      this._lawById = new Map(); this._lawHay = null;
      if (!this.law) return;
      for (const e of this.law.e) this._lawById.set(e.id, e);
    }
    get hasLaw() { return !!this.law; }
    lawGroups() { return this.law ? (this.lawMeta.groups || []) : []; }
    lawEntry(id) { return this._lawById.get(id) || null; }
    /** 시행 상태를 오늘(또는 today='YYYY-MM-DD') 기준으로 풀어 준다.
     *  kind: cur(현행) · chg(현행이며 개정이 예정됨) · new(시행 예정 신설). 시행일(upcoming_effective)이 지났으면 passed=true — 그때는 법제처 현행본으로 다시 확인해야 한다. */
    lawStatus(e, today) {
      const eff = (this.lawMeta && this.lawMeta.upcoming_effective) || '';
      if (!today) { const d = new Date(); today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
      const passed = !!eff && today >= eff;
      if (e.st === 'chg') return { kind: 'chg', passed, eff, tone: passed ? 'draft' : 'info', label: passed ? `${eff} 개정 시행(현행본 확인 필요)` : `현행 · ${eff} 개정 예정` };
      if (e.st === 'new') return { kind: 'new', passed, eff, tone: passed ? 'draft' : 'info', label: passed ? `${eff} 시행(현행본 확인 필요)` : `${eff} 시행 예정` };
      return { kind: 'cur', passed: false, eff: '', tone: 'ok', label: e.effn ? `현행 · ${e.effn}` : '현행' };
    }
    _ensureLawHay() {
      if (this._lawHay) return;
      this._lawHay = this.law.e.map((e) => ({
        key: lc([e.t, e.a, e.ti].join(' ')),
        kw: (e.kw || []).map(lc),
        body: lc([e.pl, e.ex || '', e.exn || ''].join(' ')),
      }));
    }
    /** 약사법 항목 찾기. opts: {q, group(id), upcoming(true 이면 시행 예정·개정 예정만)}. 질의 낱말(공백으로 나눔)은 모두 맞아야 한다.
     *  용어·조문 이름이 맞으면 높은 점수, 별칭, 풀이·원문 순. 질의가 없으면 법 조문 순서(자료 순서) 그대로. */
    searchLaw(opts = {}) {
      if (!this.law) return [];
      this._ensureLawHay();
      const toks = lc(opts.q).trim().split(/\s+/).filter(Boolean);
      const out = [];
      this.law.e.forEach((e, i) => {
        if (opts.group && e.g !== opts.group) return;
        if (opts.upcoming && e.st === 'cur') return;
        const h = this._lawHay[i];
        let s = 0;
        if (toks.length) {
          let all = true; let sum = 0;
          for (const t of toks) {
            const tn = lc(e.t);
            const sc = tn === t ? 100 : tn.startsWith(t) ? 80 : h.key.includes(t) ? 60 : h.kw.some((k) => k === t) ? 58 : h.kw.some((k) => k.includes(t)) ? 50 : h.body.includes(t) ? 20 : 0;
            if (!sc) { all = false; break; }
            sum += sc;
          }
          if (!all) return;
          s = sum;
        }
        out.push([e, s, i]);
      });
      if (toks.length) out.sort((a, b) => b[1] - a[1] || a[2] - b[2]);
      return out.map((o) => o[0]);
    }

    // ================= 국내 제품(품목) =================
    _initProducts(prods) {
      this.prods = prods && Array.isArray(prods.p) ? prods : null;
      this.prodMeta = this.prods ? (this.prods.meta || {}) : null;
      this.entProducts = new Map(); this._hay = null; this._codeProducts = null; this._coProducts = null;
      if (!this.prods) return;
      const M = this.prodMeta;
      this.groups = (M.groups || []).map((g, i) => ({ ...g, bit: 1 << i }));
      this._groupById = new Map(this.groups.map((g) => [g.id, g]));
      const P = this.prods.p, n = P.length;
      this._mask = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        const a = P[i][5] >= 0 ? this.prods.atc[P[i][5]] : ''; if (!a) continue;
        let m = 0; for (const g of this.groups) if (g.atc.some((p) => a.startsWith(p))) m |= g.bit;
        this._mask[i] = m;
      }
      // 사전 성분 → 제품: 성분 구성의 영문 일반명이 사전 항목에 이미 연결된 경우만(build/prod_build.py)
      const ingEnt = this.prods.ing_ent || {}; this._cmpEnts = this.prods.cmp.map((c) => [...new Set(c[1].map((r) => ingEnt[r[0]]).filter(Boolean))]);
      for (let i = 0; i < n; i++) {
        const seen = new Set();
        for (const g of this.codesOf(i)) for (const e of this._cmpEnts[g] || []) if (!seen.has(e)) { seen.add(e); if (!this.entProducts.has(e)) this.entProducts.set(e, []); this.entProducts.get(e).push(i); }
      }
    }
    get hasProducts() { return !!this.prods; }
    get productCount() { return this.prods ? this.prods.p.length : 0; }
    /** 품목 한 줄(배열)을 읽기 좋은 객체로 */
    product(i) {
      const r = this.prods.p[i], D = this.prods;
      return { i, key: r[0], name: r[1], co: D.co[r[2]], coIx: r[2], kind: r[3], kindLabel: KIND[r[3]], atc: r[5] >= 0 ? D.atc[r[5]] : '', permit: r[6], herbalRule: r[7], herbal: r[7] > 0, spec: r[8], special: r[9] >= 0 ? D.sp[r[9]] : '', codes: this.codesOf(i), groups: this.groupsOf(i) };
    }
    codesOf(i) { const g = this.prods.p[i][4]; return Array.isArray(g) ? g : g >= 0 ? [g] : []; }
    groupsOf(i) { return this.groups.filter((g) => this._mask[i] & g.bit).map((g) => g.id); }
    /** 성분 구성: [{code, form, rows:[{name, strength, unit, ent}]}] — 일반명코드 하나 = 성분·함량 한 벌 */
    compositionOf(i) {
      const D = this.prods;
      return this.codesOf(i).map((c) => { const [f, rows] = D.cmp[c]; return { code: D.cd[c], form: D.fm[f], rows: rows.map((r) => ({ name: D.ing[r[0]], strength: r[1], unit: D.un[r[2]], ent: (D.ing_ent || {})[r[0]] || null })) }; });
    }
    compText(c) { return c.rows.map((r) => `${r.name} ${r.strength}${r.unit ? ' ' + r.unit : ''}`.trim()).join(' · '); }
    _ensureHay() {
      if (this._hay) return;
      const D = this.prods; this._hay = D.p.map((r) => lc(r[1])); this._coHay = D.co.map((c) => lc(c));
      this._ingByCode = D.cmp.map((c) => c[1].map((r) => lc(D.ing[r[0]])).join(' '));
      this._codeProducts = new Map(); this._coProducts = new Map();
      D.p.forEach((r, i) => {
        for (const g of this.codesOf(i)) { if (!this._codeProducts.has(g)) this._codeProducts.set(g, []); this._codeProducts.get(g).push(i); }
        if (!this._coProducts.has(r[2])) this._coProducts.set(r[2], []); this._coProducts.get(r[2]).push(i);
      });
    }
    /** 증상어·안내 문구: 질의에 증상어가 있으면 관련 묶음을, 안내 대상 낱말(숙취 등)이 있으면 안내 문구를 돌려준다. */
    hints(q) {
      const n = lc(q).trim(); if (!this.prods || !n) return { groups: [], notes: [] };
      const gs = new Set(), notes = [];
      for (const s of this.prodMeta.symptoms || []) if (s.kw.some((k) => n.includes(lc(k)))) s.groups.forEach((g) => gs.add(g));
      for (const t of this.prodMeta.notes || []) if (t.kw.some((k) => n.includes(lc(k)))) notes.push(t.text);
      return { groups: [...gs].map((id) => this._groupById.get(id)).filter(Boolean), notes };
    }
    /** 제품 검색. opts: {q, kind(0|1), group(id 또는 id 배열 — 배열이면 하나라도 속하면 포함), herbal(true), co(업체 색인), limit, offset}
     *  질의 낱말(공백으로 나눔)은 모두 맞아야 하며, 품목명·업체명·영문 성분명에서 찾는다. 사전 성분(한글·영문)이 질의와 정확/앞부분 일치하면 그 성분이 든 제품도 포함한다. */
    searchProducts(opts = {}) {
      if (!this.prods) return { total: 0, items: [], via: {} };
      this._ensureHay();
      const q = lc(opts.q).trim(), toks = q ? q.split(/\s+/) : [], D = this.prods;
      const gbit = [].concat(opts.group || []).reduce((m, id) => m | (this._groupById.get(id) ? this._groupById.get(id).bit : 0), 0);
      let entSet = null;
      if (q && this.mt) {                                  // 사전 성분 일치 → 그 성분이 든 제품
        const ids = new Set();
        for (const h of this.mt.search(q)) if (h.score >= 80) ids.add(h.vtm.id);
        for (const h of this.mt.searchExt(q, { classes: false })) if (h.score >= 80) ids.add(h.vtm ? h.vtm.id : h.ext.id);
        if (ids.size) { entSet = new Set(); for (const id of ids) for (const i of this.entProducts.get(id) || []) entSet.add(i); }
      }
      const out = [];
      for (let i = 0; i < D.p.length; i++) {
        const r = D.p[i];
        if (opts.kind != null && r[3] !== opts.kind) continue;
        if (gbit && !(this._mask[i] & gbit)) continue;
        if (opts.herbal && !r[7]) continue;
        if (opts.co != null && r[2] !== opts.co) continue;
        let s = 0;
        if (toks.length) {
          const nm = this._hay[i], co = this._coHay[r[2]];
          let ing = null;                                  // 성분 문자열은 이름·업체에서 못 찾았을 때만 만든다(전체 훑기 속도)
          let all = true, best = 0;
          for (const t of toks) {
            const sc = nm.startsWith(t) ? 4 : nm.includes(t) ? 3 : co.includes(t) ? 2 : (ing === null && (ing = this.codesOf(i).map((g) => this._ingByCode[g]).join(' ')), ing.includes(t)) ? 1 : 0;
            if (!sc) { all = false; break; } best = best ? Math.min(best, sc) : sc;
          }
          if (all) s = best; else if (entSet && entSet.has(i)) s = 1; else continue;
        }
        out.push([i, s]);
      }
      out.sort((a, b) => (b[1] - a[1]) || (D.p[a[0]][1].length - D.p[b[0]][1].length) || (D.p[a[0]][1] < D.p[b[0]][1] ? -1 : D.p[a[0]][1] > D.p[b[0]][1] ? 1 : 0));
      const off = opts.offset || 0, lim = opts.limit || 100;
      return { total: out.length, items: out.slice(off, off + lim).map((o) => o[0]) };
    }
    /** 같은 일반명코드(성분·함량·제형 큰 갈래가 같음) 품목 — 대체조제 가능 판정이 아니다(약사법 제27조). 코드별로 묶어 돌려준다. */
    alternatives(i, limit = 12) {
      this._ensureHay(); const D = this.prods;
      return this.codesOf(i).map((g) => {
        const all = (this._codeProducts.get(g) || []).filter((j) => j !== i);
        const f = D.cmp[g][0];
        return { code: D.cd[g], form: D.fm[f], text: this.compText(this.compositionOf(i).find((c) => c.code === D.cd[g])), total: all.length, items: all.slice(0, limit), companies: new Set(all.map((j) => D.p[j][2])).size };
      });
    }
    productsOfCompany(coIx) { this._ensureHay(); return this._coProducts.get(coIx) || []; }
    /** 업체 목록: 품목 수 내림차순. opts.q 가 있으면 이름에 포함된 업체만. */
    companies(opts = {}) {
      if (!this.prods) return [];
      this._ensureHay(); const q = lc(opts.q).trim(); const out = [];
      this.prods.co.forEach((name, ix) => {
        if (q && !this._coHay[ix].includes(q)) return;
        const items = this._coProducts.get(ix) || []; const rx = items.filter((i) => this.prods.p[i][3] === 0).length;
        out.push({ ix, name, total: items.length, rx, otc: items.length - rx });
      });
      return out.sort((a, b) => b.total - a.total || (a.name < b.name ? -1 : 1));
    }
    /** 사전 성분(id)이 든 국내 품목: 전체 건수·단일 성분 건수·업체 수·앞쪽 몇 건 */
    productsOfEntity(id, limit = 8) {
      if (!this.prods) return null;
      const all = this.entProducts.get(id) || []; if (!all.length) return null;
      const single = all.filter((i) => this.compositionOf(i).every((c) => c.rows.length === 1));
      return { total: all.length, single: single.length, companies: new Set(all.map((i) => this.prods.p[i][2])).size, items: (single.length ? single : all).slice(0, limit) };
    }
    /** ATC 코드의 분류 경로(1·3·4·5자리 앞부분의 이름이 있는 것만) */
    atcPath(code) {
      if (!code || !this.mt) return [];
      return [1, 3, 4, 5].filter((n) => code.length >= n).map((n) => ({ code: code.slice(0, n), label: this.mt.atcLabel(code.slice(0, n)) })).filter((x) => x.label);
    }
  }

  return { Layers, PHASE_ORDER, PHASE_RANK };
});
