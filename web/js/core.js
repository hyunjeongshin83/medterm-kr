
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
  // 확장 수록(ext)의 영어 이름 중 일상 낱말·부형제와 겹쳐 답변 검증 결과를 어지럽히는 것(검색에는 그대로 쓴다)
  const EXT_EN_STOP = new Set(['alcohol', 'ethanol', 'methanol', 'glucose', 'sucrose', 'fructose', 'lactose', 'glycerin', 'glycerol', 'nitrogen', 'hydrogen', 'calcium', 'sodium', 'potassium', 'magnesium', 'chloride', 'vitamin', 'protein', 'starch', 'petrolatum', 'paraffin']);

  // NLM 이 응용 프로그램에 넣어 달라고 요청한 문구(RxNav 이용 약관 'Your Own Apps' 항목, 2026-11-04 확인). 번역하거나 줄이지 않고 그대로 쓴다. NLM 이름·로고는 따로 쓰지 않는다(약관이 금지).
  const NLM_STATEMENT = 'This product uses publicly available data from the U.S. National Library of Medicine (NLM), National Institutes of Health, Department of Health and Human Services; NLM is not responsible for the product and does not endorse or recommend this or any other product.';

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
  // 검색어 정규화: 전각→반각·조합형→완성형 한글(NFKC), 연속 공백은 하나로, 앞뒤 공백 제거, 소문자.
  // (답변 검증은 원문 위치를 그대로 써야 하므로 이 정규화를 쓰지 않는다 — 검색 상자 전용)
  function normalizeQuery(q) {
    if (q === null || q === undefined) return '';
    let s = String(q); try { s = s.normalize('NFKC'); } catch (e) { /* normalize 가 없는 아주 옛 환경: 그대로 */ }
    return s.replace(/\s+/g, ' ').trim().toLowerCase();
  }


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
    constructor(data, classLexicon, ext) {
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
      // 분류 → 사전에 있는 성분(ATC 코드 앞부분이 맞는 것). 비어 있으면 "분류는 알지만 이 사전에 그 성분이 없음"이다.
      this.classMembers = new Map();
      for (const cl of this.classes) this.classMembers.set(cl, this.vtms.filter(v => (v.atc_codes || []).some(c => cl.atc.some(p => c.startsWith(p)))));
      // 분류 검색용 표면형: 별칭과 분류 이름을 정규화하고 띄어쓰기를 없앤 형태(sp)로 둔다.
      this.classSurfaces = [];
      for (const cl of this.classes) {
        const seenSp = new Set();
        for (const a of [...cl.aliases, cl.label]) {
          const sp = normalizeQuery(a).replace(/ /g, ''); if (!sp || seenSp.has(sp)) continue; seenSp.add(sp);
          this.classSurfaces.push({ cl, alias: a, sp });
        }
      }
      this._initExt(ext);   // 확장 수록(선택). ext 가 없으면 아무것도 바뀌지 않는다
    }

    atcLabel(code) { return this.atcNames[code] || this.extAtcNames[code] || null; }

    // ---------- 검색 ----------
    // 입력 형식: 이름·상품명·ATC 코드·RxCUI·SNOMED CT ID 에 더해
    //  · ID 표기  MT:VTM:161 · [MT:VTM:161] · MT:VMP:… · MT:AMP:… (질의문이 근거 표기로 쓰는 형식. 여러 개를 붙여 넣어도 됨)
    //  · RxCUI 표기  "RxCUI 161" · "rxcui:161" · 주소 표기 "#v-161"
    //  · 분류 별칭  "PPI" · "진통제" · "항응고제" … → 그 분류에 속한 사전 성분(점수 88/72/62, "분류: …")
    //  · 전각 글자·조합형 한글은 NFKC 로 같게 본다.
    // opts.classes === false 이면 분류 별칭을 보지 않는다(근거 항목 찾기·CLI 의 이름 해석처럼 성분 하나를 가리켜야 할 때).
    search(q, opts = {}) {
      const nq = normalizeQuery(q); if (!nq) return [];
      if (/mt\s*:\s*(?:vtm|vmp|amp)\s*:/.test(nq)) return this._searchIds(nq);
      const idm = /^(?:rxcui\s*[:=#]?\s*|#?v-)(\d+)$/.exec(nq);
      q = idm ? idm[1] : nq;
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
          else if (/^\d+$/.test(q) && vmps.some(m => (this.ampsOfVmp.get(m.id) || []).some(a => a.rxcui === q))) { score = 90; via = 'AMP RxCUI'; }
          else {
            for (const m of vmps) for (const a of (this.ampsOfVmp.get(m.id) || [])) if (a.brand_en && a.brand_en.toLowerCase().includes(q)) { score = 50; via = `브랜드(${a.brand_en})`; break; }
          }
        }
        if (score) hits.push({ vtm: v, score, via });
      }
      if (opts.classes !== false) {   // 분류 별칭: 이미 이름 등으로 찾은 성분은 더 높은 점수일 때만 바꾼다(순서는 그대로)
        const at = new Map(hits.map((h, i) => [h.vtm.id, i]));
        for (const c of this.searchClass(nq)) for (const v of c.members) {
          const via = '분류: ' + c.cl.label;
          if (at.has(v.id)) { const h = hits[at.get(v.id)]; if (c.score > h.score) { h.score = c.score; h.via = via; } }
          else { at.set(v.id, hits.length); hits.push({ vtm: v, score: c.score, via }); }
        }
      }
      return hits.sort((a, b) => b.score - a.score);
    }

    // "MT:VTM:161" 같은 ID 표기를 소속 성분으로 바꾼다(VMP·AMP ID 도 그 성분). 사전에 없는 ID 면 빈 목록.
    _searchIds(nq) {
      const out = [], seen = new Set(), re = /mt\s*:\s*(vtm|vmp|amp)\s*:\s*(\d+)/g; let m;
      while ((m = re.exec(nq))) {
        const type = m[1].toUpperCase(), c = this.byId.get(`MT:${type}:${m[2]}`); if (!c) continue;
        const v = type === 'VTM' ? c : this.byId.get(c.ingredient); if (!v || seen.has(v.id)) continue; seen.add(v.id);
        out.push({ vtm: v, score: type === 'VTM' ? 95 : 90, via: type === 'VTM' ? 'ID 일치' : `${type} ID` });
      }
      return out.sort((a, b) => b.score - a.score);
    }

    // ---------- 확장 수록(ext) ----------
    // data/medterm_ext.json — 공개 자료(RxNorm·심평원 약가마스터·Wikidata)로 자동 수집·연결한 초안(약사 검수 전).
    // ext 인자가 없으면 아래가 모두 비어 있어 핵심 사전만으로 이전과 똑같이 동작한다.
    // 핵심 수록분과 같은 RxCUI 인 항목(core:true)은 목록에 따로 나오지 않고, 핵심 성분의 '국내 등재 현황' 보강(extOfCore)에만 쓴다.
    _initExt(ext) {
      this.ext = ext && Array.isArray(ext.entities) ? ext : null;
      this.extMeta = this.ext ? (this.ext.meta || {}) : null;
      this.extAll = []; this.extList = []; this.extById = new Map(); this.extOfCore = new Map();
      this.extAtcNames = (this.extMeta && this.extMeta.atc_names) || {};
      this.extSurfaces = []; this.extNames = new Set(); this.extAtcOwner = new Map(); this.extRxOwner = new Map(); this.classMembersExt = new Map();
      this._nearPool = this.surfaces;   // 철자 변형(near-miss) 후보: 핵심 + (있으면) 확장 이름
      this._coll = (typeof Intl !== 'undefined' && Intl.Collator) ? new Intl.Collator('ko') : null;
      if (!this.ext) return;
      const lowerOf = (arr) => arr.filter(Boolean).map(t => String(t).toLowerCase());
      const nameIdx = new Map();   // 검증용 이름 → 그 이름을 가진 확장 성분(2개 이상이면 어느 성분인지 정할 수 없어 쓰지 않는다)
      for (const r of this.ext.entities) {
        const ko = (r.ko || []).map(x => x.n);
        const v = {
          id: r.id, type: 'EXT', ext: true, core: !!r.core && this.byId.has(r.id), rxcui: r.rxcui || null,
          label_ko: ko[0] || '', label_en: r.label_en || '', alt_ko: ko.slice(1), ko_base: r.ko_base || [], ko_alias: r.ko_alias || [],
          alt_en: r.alt_en || [], brands_ko: r.brands_ko || [], atc_codes: r.atc || [], atc_class: r.atc_class || [],
          review_status: r.review_status || 'draft', grade: r.grade || '-', rec: r
        };
        v._n = lowerOf([v.label_ko, v.label_en, ...v.alt_ko, ...v.ko_base, ...v.alt_en]); v._b = lowerOf(v.brands_ko); v._a = lowerOf(v.ko_alias);
        this.extAll.push(v); this.extById.set(v.id, v);
        for (const t of [...v._n, ...v._b, ...v._a]) this.extNames.add(t);
        if (v.core) { this.extOfCore.set(v.id, v); continue; }
        this.extList.push(v);
        for (const c of v.atc_codes) { if (!this.extAtcOwner.has(c)) this.extAtcOwner.set(c, []); this.extAtcOwner.get(c).push(v.id); }
        if (v.rxcui) this.extRxOwner.set(v.rxcui, v.id);
        // 답변 검증에 쓰는 이름은 성분 이름(한글 3자 이상 · 영문 7자 이상)만이다. 상품명·별칭은 자동 추출이라 검증에는 쓰지 않는다(검색에만 쓴다).
        for (const [t, lang] of [...[v.label_ko, ...v.alt_ko, ...v.ko_base].map(t => [t, 'ko']), ...[v.label_en, ...v.alt_en].map(t => [t, 'en'])]) {
          const lower = String(t || '').toLowerCase();
          if (lang === 'ko' ? lower.length < 3 : (lower.length < 7 || EXT_EN_STOP.has(lower) || !/[a-z]{3}/.test(lower))) continue;
          if (!nameIdx.has(lower)) nameIdx.set(lower, { ids: new Set(), text: t, lang });
          nameIdx.get(lower).ids.add(v.id);
        }
      }
      for (const [lower, o] of nameIdx) {
        if (o.ids.size !== 1 || this.knownNames.has(lower) || this.classWords.has(lower)) continue;
        this.extSurfaces.push({ text: o.text, lower, vtm: this.extById.get([...o.ids][0]), kind: 'ingredient', lang: o.lang, ext: true });
      }
      this.extSurfaces.sort((a, b) => b.text.length - a.text.length);
      this._nearPool = this.surfaces.concat(this.extSurfaces);
      for (const cl of this.classes) this.classMembersExt.set(cl, this.extList.filter(v => v.atc_codes.some(c => cl.atc.some(p => c.startsWith(p)))));
    }

    anyById(id) { return this.byId.get(id) || this.extById.get(id) || null; }
    hasId(id) { return this.byId.has(id) || this.extById.has(id); }
    _nm(v) { return v.label_ko || v.label_en; }
    nameOfId(id) { const v = this.anyById(id); return v ? this._nm(v) : id; }
    _cmpName(a, b) {
      const x = String(a.label_ko || a.label_en), y = String(b.label_ko || b.label_en);
      return (this._coll ? this._coll.compare(x, y) : x.localeCompare(y, 'ko')) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    }

    // 확장 수록 검색 — 핵심 사전 search() 와 같은 점수 체계(이름 일치 100·접두 80·포함 60, 상품명은 1점·별칭은 2점 낮게, ATC 70, RxCUI 95, ID 95).
    // 결과: {ext: 확장 성분(뷰), vtm: 핵심 VTM 또는 null, score, via}. 핵심 성분(core:true)이 상품명·별칭으로 찾아지면 vtm 에 핵심 VTM 이 들어 있다(화면은 핵심 목록에 합친다).
    // 이름 검색은 두 글자 이상부터(한 글자는 수천 건이 걸려 쓸모가 없다). ID 표기: MT:KRI:slug · MT:VTM:숫자 · 주소 표기 #k-slug.
    searchExt(q, opts = {}) {
      if (!this.ext) return [];
      const nq = normalizeQuery(q); if (!nq) return [];
      const mk = (v, score, via) => ({ ext: v, vtm: v.core ? this.byId.get(v.id) : null, score, via });
      const hashK = /^#?k-([a-z0-9-]+)$/.exec(nq);
      if (hashK || /mt\s*:\s*(?:vtm|kri)\s*:/.test(nq)) {
        const out = [], seen = new Set(), idRe = /mt\s*:\s*(vtm|kri)\s*:\s*([a-z0-9_]+)/g; let im;
        const push = (id) => { const v = this.extById.get(id); if (v && !seen.has(id)) { seen.add(id); out.push(mk(v, 95, 'ID 일치')); } };
        if (hashK) push('MT:KRI:' + hashK[1].replace(/-/g, '_'));
        while ((im = idRe.exec(nq))) push(`MT:${im[1].toUpperCase()}:${im[2]}`);
        return out;
      }
      const idm = /^(?:rxcui\s*[:=#]?\s*|#?v-)(\d+)$/.exec(nq);
      const k = idm ? idm[1] : nq, nameOk = k.length >= 2 && !idm;
      const grade = (names, drop, label) => {   // 이름 목록에서 가장 높은 점수와 이유. drop: 일치 점수에서 깎는 값(이름 0 · 상품명 1 · 별칭 2)
        let sc = 0, via = null;
        for (const n of names) {
          if (n === k) return [100 - drop, label + ' 일치'];
          if (n.startsWith(k)) { if (80 - drop > sc) { sc = 80 - drop; via = label + ' 접두'; } }
          else if (n.includes(k) && 60 - drop > sc) { sc = 60 - drop; via = label + ' 포함'; }
        }
        return [sc, via];
      };
      const hits = [];
      for (const v of this.extAll) {
        let score = 0, via = null;
        if (nameOk) for (const [names, drop, label] of [[v._n, 0, '이름'], [v._b, 1, '상품명'], [v._a, 2, '별칭']]) { const [sc, w] = grade(names, drop, label); if (sc > score) { score = sc; via = w; } }
        if (!score) {
          if (v.rxcui && v.rxcui === k) { score = 95; via = 'RxCUI'; }
          else if (!idm && k.length >= 3 && v.atc_codes.some(c => c.toLowerCase().startsWith(k))) { score = 70; via = 'ATC 코드'; }
        }
        if (score) hits.push(mk(v, score, via));
      }
      if (opts.classes !== false) {   // 분류 별칭: 이미 찾은 성분은 더 높은 점수일 때만 바꾼다
        const at = new Map(hits.map((h, i) => [h.ext.id, i]));
        for (const c of this.searchClass(nq)) for (const v of c.extMembers) {
          const via = '분류: ' + c.cl.label;
          if (at.has(v.id)) { const h = hits[at.get(v.id)]; if (c.score > h.score) { h.score = c.score; h.via = via; } }
          else { at.set(v.id, hits.length); hits.push(mk(v, c.score, via)); }
        }
      }
      return hits.sort((a, b) => (b.score - a.score) || this._cmpName(a.ext, b.ext));
    }

    atcPath(code) { return [code[0], code.slice(0, 3), code.slice(0, 4), code.slice(0, 5)].map(c => ({ code: c, name: this.atcLabel(c) })); }

    // 확장 성분 상세(화면용): ATC(출처 표시)·한글 이름 후보(출처 표시)·국내 등재 현황·연결 등급 설명.
    describeExt(id) {
      const v = this.extById.get(id); if (!v) return null; const r = v.rec;
      const legend = (this.extMeta && this.extMeta.grade_legend) || {};
      return {
        ext: v, rec: r, coreVtm: this.byId.get(id) || null,
        atc: (r.atc || []).map(code => ({ code, src: (r.atc_src || {})[code] || '', path: this.atcPath(code) })),
        atcClass: (r.atc_class || []).map(code => ({ code, name: this.atcLabel(code) })),
        names: (r.ko || []).map(x => ({ ...x })), grade: v.grade, gradeText: legend[v.grade] || '', kr: r.kr || null
      };
    }

    // ---------- 출처·이용 조건 ----------
    // 확장 성분 한 개가 어느 공개 자료에서 왔는지: 출처별 식별자·원자료 주소·이용 조건·받은 날/자료 시점.
    // 빠진 것(식별자 없음·이용 조건 표시 없음 등)은 missing 에 이유를 적는다 — 시험이 표본 50개에서 0건인지 확인한다.
    // 확장 항목이 아니거나 확장 수록이 없으면 null. 핵심 성분(core:true)은 확장 쪽 기록의 출처를 돌려준다(핵심 사전 자체의 출처는 meta.sources).
    provenance(id) {
      const v = this.extById && this.extById.get(id); if (!v) return null;
      const r = v.rec, M = this.extMeta || {}, files = M.files || {};
      const srcById = new Map((M.sources || []).map(s => [s.id, s]));
      const fill = (t, o) => String(t).replace(/\{(\w+)\}/g, (m, k) => encodeURIComponent(o[k] == null ? '' : o[k]));
      const ymd = (t) => { const m = /_(\d{4})(\d{2})(\d{2})$/.exec(t || ''); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
      const letters = new Set(String(r.src || ''));
      if ((r.atc && r.atc.length) || (r.atc_class && r.atc_class.length)) letters.add('A');   // ATC 분류 이름은 RxClass(WHO ATC)에서 온다
      const sources = [], missing = [];
      for (const L of ['R', 'H', 'W', 'A']) {
        if (!letters.has(L)) continue;
        const s = srcById.get(L);
        if (!s) { missing.push(`${L}: 출처 설명 없음`); continue; }
        const fk = (s.files || []).map(k => files[k]).filter(Boolean);
        const o = { id: L, name: s.name, use: s.use, license: s.license, license_tag: s.license_tag || '', license_class: s.license_class || '', credit: s.credit || '',
          ids: [], links: [], asof: [], fetched: [...new Set(fk.map(f => f.fetched).filter(Boolean))].sort(), note: '' };
        if (!o.license_tag) missing.push(`${L}: 이용 조건 표시 없음`);
        if (L === 'R') {
          if (r.rxcui) { o.ids.push({ label: 'RxCUI', value: String(r.rxcui) }); if (s.rec_url) o.links.push({ label: 'RxNav 원자료(JSON)', url: fill(s.rec_url, { rxcui: r.rxcui }) }); }
          else missing.push('R: RxCUI 없음');
        } else if (L === 'W') {
          if (r.wd) { o.ids.push({ label: 'Wikidata', value: r.wd }); if (s.rec_url) o.links.push({ label: 'Wikidata 항목', url: fill(s.rec_url, { wd: r.wd }) }); }
          else missing.push('W: Wikidata 번호 없음');
        } else if (L === 'H') {
          if ((r.hira_codes || []).length) { const hc = r.hira_codes; o.ids.push({ label: '심평원 일반명코드', value: hc.length > 6 ? `${hc.slice(0, 6).join(', ')} 외 ${hc.length - 6}개` : hc.join(', ') }); }
          else if (r.label_en) { o.ids.push({ label: '심평원 일반명', value: r.label_en }); o.note = '단일성분 일반명코드가 없어(복합제 행에서만 나옴) 영문 일반명으로 찾습니다.'; }
          else missing.push('H: 식별자 없음');
          const fu = s.file_urls || {}, kr = r.kr || {};
          if (fu.hira_ing) o.links.push({ label: '의약품주성분(15067461)', url: fu.hira_ing });
          if (fu.hira_std && (kr.items || kr.combo || Object.values(r.atc_src || {}).some(x => String(x).includes('H')))) o.links.push({ label: '의약품표준코드(15067462)', url: fu.hira_std });
          const f1 = files.hira_ing || {}, f2 = files.hira_std || {};
          const d1 = ymd((f1.portal || {}).title), d2 = f2.file_date || ymd((f2.portal || {}).title);
          if (d1) o.asof.push(`의약품주성분 ${d1}`);
          if (d2) o.asof.push(`의약품표준코드 ${d2}`);
        } else if (L === 'A') {
          o.note = 'ATC 분류 이름(WHO ATC)은 재배포 조건이 정해지지 않았습니다.';
        }
        sources.push(o);
      }
      const dates = sources.flatMap(s => s.fetched).sort();
      return {
        id, review_status: r.review_status || 'draft',
        ids: { rxcui: r.rxcui || null, hira_codes: r.hira_codes || [], wd: r.wd || null },
        sources, license_tags: [...new Set(sources.map(s => s.license_tag).filter(Boolean))],
        pending: sources.filter(s => s.license_class === 'pending').map(s => s.id),
        urls: sources.flatMap(s => s.links.map(l => l.url)),
        retrieved_at: dates.length ? dates[dates.length - 1] : null, missing
      };
    }

    // 확장 수록 전체의 출처 현황(소개 탭·공개 전 검토용): 출처별로 쓰는 항목 수 / 재배포 조건이 정해지지 않은 출처를 쓰는 항목 수 / 빠진 것이 있는 항목 수.
    provenanceStats() {
      if (!this.ext) return null;
      if (this._provStats) return this._provStats;
      const by = { R: 0, H: 0, W: 0, A: 0 }; let pending = 0, missing = 0, withHiraCodes = 0;
      for (const v of this.extAll) {
        const p = this.provenance(v.id);
        p.sources.forEach(s => { by[s.id] += 1; });
        if (p.pending.length) pending += 1;
        if (p.missing.length) missing += 1;
        if (p.ids.hira_codes.length) withHiraCodes += 1;
      }
      return (this._provStats = { total: this.extAll.length, bySource: by, pending, missing, withHiraCodes });
    }

    // 출처 표기 문구(화면 하단·소개 탭). nlm_en 은 NLM 이 요청한 영문 문구 그대로이고, kogl 은 공공누리 제1유형의 표시 방식(기관명·연도·무료 내려받기 안내)에 맞춘 문장이다.
    // 확장 수록이 없으면 심평원 자료를 쓰지 않았으므로 kogl 은 null.
    attribution() {
      const M = this.extMeta, files = (M && M.files) || {};
      const ymd = (t) => { const m = /_(\d{4})(\d{2})(\d{2})$/.exec(t || ''); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
      let kogl = null;
      if (M && (files.hira_ing || files.hira_std)) {
        const d1 = ymd(((files.hira_ing || {}).portal || {}).title), d2 = (files.hira_std || {}).file_date || ymd(((files.hira_std || {}).portal || {}).title);
        const ys = [d1, d2].filter(Boolean).map(d => d.slice(0, 4)).sort();
        const yr = ys.length ? (ys[0] === ys[ys.length - 1] ? `${ys[0]}년 ` : `${ys[0]}~${ys[ys.length - 1]}년 `) : '';
        kogl = `본 저작물은 건강보험심사평가원에서 ${yr}작성하여 공공누리 제1유형으로 개방한 ‘약가마스터 의약품주성분’${d1 ? `(자료명 날짜 ${d1})` : ''}과 ‘약가마스터 의약품표준코드’${d2 ? `(자료명 날짜 ${d2})` : ''}를 가공하여 이용하였으며, 해당 저작물은 건강보험심사평가원, 공공데이터포털(www.data.go.kr)에서 무료로 내려받으실 수 있습니다.`;
      }
      return {
        nlm_en: NLM_STATEMENT,
        nlm_ko: '위 영문 문구의 한국어 풀이입니다(공식 문구는 영문). 이 제품은 미국 국립의학도서관(NLM)·국립보건원(NIH)·보건복지부(HHS)가 공개한 자료를 이용하며, NLM은 이 제품에 책임이 없고 이 제품이나 다른 어떤 제품도 보증·추천하지 않습니다.',
        kogl,
        wikidata: M ? 'Wikidata의 공개 자료(CC0)를 이용했습니다. 표기 의무는 없으나 출처를 밝힙니다.' : null,
        sources: ['미국 NLM RxNorm(RxNav)', ...(kogl ? ['건강보험심사평가원 약가마스터(공공누리 제1유형)', 'Wikidata(CC0)'] : [])]
      };
    }

    _contextForExt(v) {
      const kr = v.rec.kr;
      const o = {
        id: v.id, tier: 'ext', name_ko: v.label_ko || null, name_en: v.label_en || null,
        alt: [...v.alt_ko, ...v.ko_base, ...v.alt_en], brands_ko: v.brands_ko.slice(0, 5), rxcui: v.rxcui, review_status: v.review_status,
        note: '확장 수록(공개 자료 자동 수집·약사 검수 전). 한글 이름은 후보',
        atc: v.atc_codes.map(code => ({ code, class4: this.atcLabel(code.slice(0, 5)) }))
      };
      if (kr && kr.items) o.kr_listed = { items: kr.items, forms: kr.forms, strengths_sample: (kr.strengths || []).slice(0, 8), note: '심평원 약가마스터 등재 제품 규격(용법·용량 아님)' };
      return o;
    }

    // ---------- 분류 별칭 검색 ----------
    // "PPI"·"진통제"·"항응고제"처럼 약 하나가 아니라 분류를 가리키는 말. 일치한 분류마다 {cl, alias, score, members} 를 점수 순으로 돌려준다.
    // 점수: 별칭(또는 분류 이름)과 같음 88 · 앞부분이 같음 72(세 글자 이상) · 중간에 들어 있음 62(세 글자 이상). 띄어쓰기는 보지 않고 끝의 "계열·계·류"는 뗀다.
    // members 는 이 사전에 있는 그 분류의 성분이다. 비어 있으면 "분류는 알지만 이 사전에 성분이 없음" — 약이 없다는 뜻이 아니라 확인이 필요하다는 뜻이다.
    searchClass(q) {
      const nq = normalizeQuery(q); if (!nq) return [];
      const forms = new Set([nq.replace(/ /g, '')]);
      const stripped = nq.replace(/\s*(계열|계|류)$/, '').replace(/ /g, ''); if (stripped) forms.add(stripped);
      const best = new Map();
      for (const f of forms) {
        for (const s of this.classSurfaces) {
          let score = 0;
          if (s.sp === f && f.length >= 2) score = 88;
          else if (f.length >= 3 && s.sp.startsWith(f)) score = 72;
          else if (f.length >= 3 && s.sp.includes(f)) score = 62;
          if (!score) continue;
          const o = best.get(s.cl); if (!o || score > o.score) best.set(s.cl, { alias: s.alias, score });
        }
      }
      return [...best].map(([cl, o]) => ({ cl, alias: o.alias, score: o.score, members: this.classMembers.get(cl) || [], extMembers: this.classMembersExt.get(cl) || [] })).sort((a, b) => b.score - a.score);
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
      const v = this.byId.get(vtmId) || this.extById.get(vtmId); if (!v || (v.type !== 'VTM' && !v.ext)) return null;
      const o = Object.assign({ maxAtc: 6, maxSiblings: 6, maxVmp: 10, ampPerVmp: 2, maxAmp: 14 }, opts);
      const nodes = [], edges = [], seen = new Set();
      const add = n => { if (seen.has(n.id)) return n; seen.add(n.id); nodes.push(n); return n; };
      const edge = (from, to, rel) => { if (!edges.some(e => e.from === from && e.to === to && e.rel === rel)) edges.push({ from, to, rel }); };
      const totals = { atc: 0, siblings: 0, vmp: 0, amp: 0 }, shown = { atc: 0, siblings: 0, vmp: 0, amp: 0 };
      const rxTxt = v.rxcui ? ` · RxCUI ${v.rxcui}` : '';
      add({ id: v.id, kind: 'vtm', col: 'vtm', line1: v.label_ko || v.label_en, line2: v.ext ? (v.label_ko ? `${v.label_en}${rxTxt}` : (v.rxcui ? `RxCUI ${v.rxcui}` : '확장 수록')) : `${v.label_en} · RxCUI ${v.rxcui}`, title: v.ext ? `${v.label_ko ? v.label_ko + ' (' + v.label_en + ')' : v.label_en} · ${v.id}${rxTxt} · 확장 수록(자동 수집·약사 검수 전)` : `${v.label_ko} (${v.label_en}) · ${v.id} · RxCUI ${v.rxcui}`, action: null });
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
      const inGroup = u => u.id !== v.id && (u.atc_codes || []).some(c => groupCodes.some(g => c.startsWith(g)));
      const sibs = this.vtms.filter(inGroup).sort((a, b) => String(a.label_ko).localeCompare(String(b.label_ko), 'ko')).concat(this.extList.filter(inGroup).sort((a, b) => this._cmpName(a, b)));
      totals.siblings = sibs.length; const shownSibs = sibs.slice(0, o.maxSiblings); shown.siblings = shownSibs.length;
      for (const u of shownSibs) {
        add({ id: u.id, kind: 'sibling', col: 'sibling', line1: u.label_ko || u.label_en, line2: u.label_ko ? u.label_en : '확장 수록', title: `${u.label_ko ? u.label_ko + ' (' + u.label_en + ')' : u.label_en} · ${u.id}${u.ext ? ' · 확장 수록' : ''} — 눌러서 이 성분으로 이동`, action: { type: 'select', id: u.id } });
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
    // opts.ext === true 이면 확장 수록 성분의 이름도 찾는다(핵심 이름과 겹치는 자리는 핵심이 우선, 한글은 단어 시작·조사/접미 끝맺음일 때만).
    findMentions(text, opts = {}) {
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
      if (opts.ext && this.extSurfaces.length) {
        const xc = [];
        for (const s of this.extSurfaces) {
          let from = 0; const t = s.lower;
          while (true) {
            const i = lower.indexOf(t, from); if (i < 0) break; from = i + 1; const e = i + t.length;
            if (s.lang === 'en') { if (isEnLetter(lower[i - 1]) || isEnLetter(lower[e])) continue; }
            else {
              if (/[가-힣A-Za-z0-9]/.test(lower[i - 1] || '')) continue;               // 다른 말의 뒷부분으로 우연히 맞는 것
              let re = e; while (re < lower.length && HANGUL.test(lower[re])) re++;
              const tail = text.slice(e, re); if (tail && !PARTICLE_CHAIN.test(tail) && !NOUN_SUFFIX.test(tail)) continue;   // 더 긴 다른 말의 앞부분인 것
            }
            xc.push({ start: i, end: e, text: text.slice(i, e), vtm: s.vtm, kind: s.kind, lang: s.lang, ext: true });
          }
        }
        xc.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
        for (const c of xc) { if (taken.some(r => c.start < r[1] && c.end > r[0])) continue; taken.push([c.start, c.end]); out.push(c); }
      }
      return out.sort((a, b) => a.start - b.start);
    }

    // 질문에서 사전 항목(VTM id)을 찾는다: 이름 언급 + 토큰 검색(이름 일치/접두 이상만)
    retrieve(question, max = 5) {
      const ids = []; const push = (id) => { if (!ids.includes(id)) ids.push(id); };
      this.findMentions(question, { ext: true }).forEach(m => push(m.vtm.id));
      question.split(/[\s,，、]+/).filter(t => t.length >= 2).forEach(t => {
        this.search(t, { classes: false }).filter(x => x.score >= 80).slice(0, 2).forEach(x => push(x.vtm.id));
        if (this.ext) this.searchExt(t, { classes: false }).filter(x => x.score >= 80).slice(0, 2).forEach(x => push(x.vtm ? x.vtm.id : x.ext.id));
      });
      return ids.slice(0, max);
    }

    // ---------- 근거 기반 컨텍스트/프롬프트 ----------
    contextFor(vtmIds, opts = {}) {
      const maxStrengths = opts.maxStrengths || 12;
      return vtmIds.map(id => {
        if (!this.byId.has(id) && this.extById.has(id)) return this._contextForExt(this.extById.get(id));
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
      const extUsed = ctx.some(c => c.tier === 'ext');
      const system = [
        '당신은 약무용어 사전에 근거해서만 답하는 보조자입니다.',
        '규칙 1) 아래 <사전> 항목에 있는 사실(이름, RxCUI, ATC 코드/계열, 단위용량)만 사용하고, 항목 ID(예: MT:VTM:7646)를 근거로 표기하세요.',
        '규칙 2) <사전>에 없는 약물·코드·용량은 추측하지 말고 "사전에 없어 확인할 수 없음"이라고 답하세요.',
        '규칙 3) 개인별 복용량·진단·처방 판단은 하지 말고, 의사·약사 상담을 안내하세요.',
        '규칙 4) 단위용량은 미국 RxNorm 기준이며 국내 허가 규격과 다를 수 있음을 명시하세요.',
        ...(extUsed ? ['규칙 5) tier 가 "ext" 인 항목은 확장 수록(공개 자료 자동 수집·약사 검수 전)입니다. 한글 이름은 후보이고 국내 등재 규격은 제품 규격일 뿐 용법·용량이 아니므로, 이 항목에서 나온 사실에는 "확장 수록 자료 기준"이라고 밝히세요.'] : [])
      ].join('\n');
      const body = ctx.length ? JSON.stringify(ctx, null, 1) : `(이 질문과 일치하는 사전 항목이 없음. 사전 전체에는 ${this.vtms.length}개 성분${this.extList.length ? '(핵심)과 확장 수록 ' + this.extList.length + '개 성분' : ''}이 수록되어 있으나 이 질문의 약물은 포함되어 있지 않음)`;
      const user = '<사전>\n' + body + '\n</사전>\n\n질문: ' + question;
      return { system, user, context: ctx };
    }

    // ---------- 답변 검증 ----------
    verify(text) {
      const findings = []; const mentions = this.findMentions(text, { ext: true });
      const sentBounds = []; { const re = /[!?。\n]|\.(?!\d)/g; let last = 0, m; while ((m = re.exec(text))) { sentBounds.push([last, m.index + 1]); last = m.index + 1; } sentBounds.push([last, text.length]); }
      const sentOf = (pos) => sentBounds.find(b => pos >= b[0] && pos < b[1]) || [0, text.length];
      const mentionsIn = (b) => mentions.filter(m => m.start >= b[0] && m.end <= b[1]);
      const nearest = (list, start, end) => list.slice().sort((a, b) => Math.min(Math.abs(start - a.end), Math.abs(a.start - end)) - Math.min(Math.abs(start - b.end), Math.abs(b.start - end)))[0];
      const F = (severity, type, start, end, message, extra = {}) => findings.push({ severity, type, start, end, text: text.slice(start, end), message, ...extra });

      // 1) 알려진 약물 언급 + 철자 변형(near-miss)
      const claimed = []; // near-miss 영역(알려진 이름 뒤에 붙은 비허용 접미)
      for (const m of mentions) {
        if (m.ext) { F('ok', 'known_term_ext', m.start, m.end, `확장 수록 일치: ${this._nm(m.vtm)} (${m.vtm.id}) — 자동 수집·약사 검수 전`, { vtm: m.vtm.id, ext: true }); continue; }
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
        if (this.knownNames.has(w.toLowerCase()) || this.classWords.has(w.toLowerCase()) || this.extNames.has(w.toLowerCase())) continue;
        const stem = KO_STEMS.find(st => w.endsWith(st));
        const near = this._nearPool.filter(s => s.lang === 'ko' && s.kind === 'ingredient' && s.text.length >= 4).map(s => [lev(w, s.text), s]).sort((a, b) => a[0] - b[0])[0];
        if (!stem && !(near && near[0] <= 1)) continue;
        if (near && near[0] <= (stem ? 2 : 1)) F('warn', 'near_miss', s0, s0 + w.length, `'${w}'은(는) 사전에 없으며 '${near[1].text}'${near[1].ext ? '(확장 수록)' : ''}과(와) 비슷합니다(철자 변형 의심).`, { suggest: near[1].text });
        else F('warn', 'unknown_drug', s0, s0 + w.length, `'${w}'은(는) 약물명 어미(-${stem})를 가졌으나 사전에 없습니다. 실존 약물일 수도, 생성된 이름일 수도 있어 확인이 필요합니다.`);
      }
      // 영어
      const enRe = /[A-Za-z][A-Za-z\-]{5,}/g; let em;
      while ((em = enRe.exec(text))) {
        const w = em[0], s0 = em.index; if (covered(s0, s0 + w.length)) continue;
        const lw = w.toLowerCase(); if (this.knownNames.has(lw) || this.extNames.has(lw)) continue;
        const stem = EN_STEMS.find(st => lw.endsWith(st) && lw.length >= 7);
        const near = this._nearPool.filter(s => s.lang === 'en' && s.kind === 'ingredient' && s.text.length >= 7).map(s => [lev(lw, s.lower), s]).sort((a, b) => a[0] - b[0])[0];
        const tol = lw.length >= 9 ? 2 : 1;
        if (!stem && !(near && near[0] <= tol)) continue;
        if (near && near[0] <= (stem ? 2 : tol)) F('warn', 'near_miss', s0, s0 + w.length, `'${w}'은(는) 사전에 없으며 '${near[1].text}'${near[1].ext ? '(확장 수록)' : ''}과(와) 비슷합니다(철자 변형 의심).`, { suggest: near[1].text });
        else F('warn', 'unknown_drug', s0, s0 + w.length, `'${w}'은(는) 약물명 어미(-${stem})를 가졌으나 사전에 없습니다. 확인이 필요합니다.`);
      }

      // 3) ATC 코드
      const atcRe = /\b[A-Z]\d{2}[A-Z]{2}(?:\d{2})?\b/g; let am;
      while ((am = atcRe.exec(text))) {
        const code = am[0], s0 = am.index, e0 = s0 + code.length, b = sentOf(s0), ms = mentionsIn(b);
        const owners = new Set(); for (const [c, ids] of this.atcOwner) if (c.startsWith(code)) ids.forEach(i => owners.add(i));
        for (const [c, ids] of this.extAtcOwner) if (c.startsWith(code)) ids.forEach(i => owners.add(i));
        if (!ms.length) {
          if (!owners.size) F('warn', 'atc_unverifiable', s0, e0, `ATC 코드 ${code}: 같은 문장에 사전 약물이 없고, 사전의 어떤 약물 코드와도 일치하지 않아 검증할 수 없습니다.`);
          continue;
        }
        const ok = ms.find(m => (m.vtm.atc_codes || []).some(c => c.startsWith(code)));
        if (ok) F('ok', 'atc_ok', s0, e0, `ATC ${code} ↔ ${this._nm(ok.vtm)} 일치${ok.vtm.ext ? '(확장 수록 자료 기준)' : ''}`);
        else {
          const nm = nearest(ms, s0, e0), ownerNames = [...owners].map(i => this.nameOfId(i)).join(', ');
          if (COMBO_CTX.test(text.slice(b[0], b[1]))) { F('info', 'combo_context', s0, e0, `ATC ${code}: 복합제 맥락이라 단일 성분 사전으로는 검증할 수 없습니다.`); continue; }
          F(nm.vtm.ext ? 'warn' : 'error', 'atc_mismatch', s0, e0, `ATC ${code}는 '${this._nm(nm.vtm)}'의 코드가 아닙니다. ${nm.vtm.ext ? '확장 수록 자료(자동 수집·검수 전)' : '사전'} 기준 ${this._nm(nm.vtm)}: ${(nm.vtm.atc_codes || []).join(', ') || (nm.vtm.ext ? '(없음)' : '')}.` + (ownerNames ? ` (${code}는 ${ownerNames}의 코드)` : ''), { expected: nm.vtm.atc_codes, ext: !!nm.vtm.ext });
        }
      }
      // 4) RxCUI
      const rxRe = /rxcui\s*[:=]?\s*(\d{2,7})/gi; let rm;
      while ((rm = rxRe.exec(text))) {
        const id = rm[1], s0 = rm.index, e0 = s0 + rm[0].length, b = sentOf(s0), ms = mentionsIn(b), owner = this.rxcuiOwner.get(id) || this.extRxOwner.get(id);
        if (!owner) { F('warn', 'rxcui_unverifiable', s0, e0, `RxCUI ${id}는 사전에 없어 검증할 수 없습니다.`); continue; }
        if (!ms.length) continue;
        if (ms.some(m => m.vtm.id === owner)) F('ok', 'rxcui_ok', s0, e0, `RxCUI ${id} 일치`);
        else { const nm = nearest(ms, s0, e0); F('error', 'rxcui_mismatch', s0, e0, `RxCUI ${id}는 '${this.nameOfId(owner)}'의 식별자이며 '${this._nm(nm.vtm)}'가 아닙니다.`); }
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
        if (consistent) F('ok', 'class_ok', i, e, `계열 '${cl.label}' ↔ ${this._nm(consistent.vtm)} 일치(ATC ${cl.atc.join('/')})${consistent.vtm.ext ? ' — 확장 수록 자료 기준' : ''}`);
        else if (COMBO_CTX.test(text.slice(b[0], b[1]))) F('info', 'combo_context', i, e, `계열 '${cl.label}': 복합제 맥락이라 단일 성분 사전으로는 검증할 수 없습니다.`);
        else { const nm = nearest(ms, i, e); F(distinct === 1 && !nm.vtm.ext ? 'error' : 'warn', 'class_mismatch', i, e, `'${this._nm(nm.vtm)}'은(는) ${nm.vtm.ext ? '확장 수록 자료(자동 수집·검수 전)' : '사전'} 기준 '${cl.label}'(ATC ${cl.atc.join('/')})에 속하지 않습니다. 사전 ATC: ${(nm.vtm.atc_codes || []).join(', ')}.`, { expected: nm.vtm.atc_codes, ext: !!nm.vtm.ext }); }
      }
      // 6) 단위용량 (약물 언급 직후 창)
      const numRe = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(mg|mcg|μg|µg|㎍|㎎|g|밀리그램|마이크로그램|그램)(?![A-Za-z\/])/gi;
      for (let i = 0; i < mentions.length; i++) {
        const m = mentions[i]; if (m.ext) continue;   // 확장 수록 성분은 단위용량 목록(RxNorm 미국 규격)이 없어 검증하지 않는다
        const b = sentOf(m.start);
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
  return { MedTerm, lev, mgOf, textPx, fitText, normalizeQuery };
});
