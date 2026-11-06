// MedTerm-KR 접근성 자동 점검(axe-core, 실제 크롬). 사용: node tests/a11y.cjs [dist 파일명]
// 주요 화면 상태(검색·그래프·검증·질의·정보 · 서랍·시트가 열린 상태)를 휴대폰·태블릿·데스크톱, 밝은·어두운 화면으로 열어
// axe 규칙(WCAG 2.0/2.1/2.2 A·AA + 모범 사례) 위반이 하나도 없어야 통과한다. 외부 요청은 모두 막고(오프라인) 콘솔 오류도 실패로 센다.
// axe 는 "자동으로 잡히는 것"만 본다(전체 접근성의 일부). 화면 읽기 프로그램·키보드 흐름은 tests/ui.cjs 가 따로 본다.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const FILE = process.argv[2] || 'MedTerm-KR_react.html';
const URL = 'file://' + path.join(process.env.MEDTERM_DIST || path.join(ROOT, 'dist'), FILE);
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

let bad = 0, total = 0;
const ck = (name, ok, extra) => { total++; if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 일부만 돌려 볼 때: A11Y_VIEW="휴대폰 390" A11Y_STATE="질의" node tests/a11y.cjs (이름에 포함된 것만)
const ONLY_VIEW = process.env.A11Y_VIEW || '', ONLY_STATE = process.env.A11Y_STATE || '';

const VIEWS = [
  { name: '휴대폰 320', w: 320, h: 640, mobile: true, touch: true, phone: true },
  { name: '휴대폰 390', w: 390, h: 844, mobile: true, touch: true, phone: true },
  { name: '태블릿 768', w: 768, h: 1024, touch: true },
  { name: '데스크톱 1280', w: 1280, h: 800 },
];

const tab = async (p, name) => { await p.getByRole('tab', { name, exact: true }).click(); await sleep(200); };
const tap = (v, loc) => (v.touch ? loc.tap() : loc.click());
// 상태마다 처음부터 열어(서로 영향 없게) 한 가지 화면을 만든다.
const STATES = [
  { id: '처음 화면', run: async () => {} },
  { id: '검색 "오메프라졸"', run: async (p) => { await p.fill('#q', '오메프라졸'); await sleep(350); } },
  { id: '검색 "에페리손"(확장 수록)', run: async (p) => { await p.fill('#q', '에페리손'); await sleep(350); } },
  { id: '검색 결과 없음', run: async (p) => { await p.fill('#q', '없는약이름xyz'); await sleep(300); } },
  { id: '그래프 탭(성분 선택 전)', run: async (p) => { await tab(p, '관계 그래프'); await sleep(300); } },
  { id: '그래프 탭(성분 선택 후)', run: async (p) => { await p.fill('#q', '오메프라졸'); await sleep(300); await tab(p, '관계 그래프'); await sleep(600); } },
  { id: '답변 검증(결과 표시)', run: async (p) => { await tab(p, '답변 검증'); await p.fill('#vtext', '와파린은 항응고제이며 오메프라졸 20mg과 에스오메프라졸은 ATC A02BC01입니다. 가짜약정은 혈압약입니다.'); await p.getByRole('button', { name: '검증', exact: true }).click(); await sleep(300); } },
  { id: '근거 기반 질의(질의문·예시 답변 검증)', run: async (p) => { await tab(p, '근거 기반 질의'); await p.fill('#rq', '오메프라졸과 에스오메프라졸의 ATC 코드와 단위용량을 알려줘'); await p.getByRole('button', { name: '사전에서 근거 찾기' }).click(); await sleep(250); await p.getByRole('button', { name: '예시 답변 넣기(오류 포함)' }).click(); await p.getByRole('button', { name: '이 답변 검증' }).click(); await sleep(300); } },
  { id: '데이터·한계 탭', run: async (p) => { await tab(p, '데이터·한계'); await sleep(300); } },
  { id: '국내 제품 탭(처음)', run: async (p) => { await tab(p, '국내 제품'); await sleep(300); } },
  { id: '국내 제품 검색 "반하사심탕" + 상세', run: async (p) => { await tab(p, '국내 제품'); await p.fill('#pq', '반하사심탕'); await sleep(450); await p.locator('#panel-product section[aria-labelledby="plist-title"] > ul > li > button').first().click(); await sleep(350); } },
  { id: '국내 제품 증상어 "감기"(묶음 안내)', run: async (p) => { await tab(p, '국내 제품'); await p.fill('#pq', '감기'); await sleep(450); } },
  { id: '국내 제품 "숙취해소"(안내·결과 없음)', run: async (p) => { await tab(p, '국내 제품'); await p.fill('#pq', '숙취해소'); await sleep(450); } },
  { id: '최신·임상 탭(처음)', run: async (p) => { await tab(p, '최신·임상'); await sleep(300); } },
  { id: '최신·임상 신약 카드 펼침', run: async (p) => { await tab(p, '최신·임상'); await p.locator('#panel-new section[aria-labelledby="nlist-title"] summary').first().click(); await sleep(300); } },
  { id: '최신·임상 임상 진행·예정(카드 펼침)', run: async (p) => { await tab(p, '최신·임상'); await p.getByRole('button', { name: '임상 진행·예정 성분' }).click(); await sleep(300); await p.locator('#panel-new section[aria-labelledby="nlist-title"] summary').first().click(); await sleep(300); } },
  { id: '약무·제도 탭(처음)', run: async (p) => { await tab(p, '약무·제도'); await sleep(300); } },
  { id: '약무·제도 "협의회"(안내 문단·항목 단추)', run: async (p) => { await tab(p, '약무·제도'); await p.fill('#lawq', '약사협의회'); await sleep(300); } },
  { id: '약무·제도 시행 예정 항목 + 원문 펼침', run: async (p) => { await tab(p, '약무·제도'); await p.getByLabel(/시행 예정·개정 예정 항목만/).check(); await sleep(200); await p.locator('#panel-law section[aria-labelledby="llist-title"] summary').first().click(); await sleep(300); } },
  { id: '상세(핵심 성분) 서랍·시트', drawerOnly: true, run: async (p, v) => { await p.fill('#q', '메트포르민'); await sleep(300); await tap(v, p.locator('#panel-search ul.feed-grid button').first()); await sleep(450); } },
  { id: '상세(확장 수록) 서랍·시트', drawerOnly: true, run: async (p, v) => { await p.fill('#q', '에페리손'); await sleep(300); await tap(v, p.locator('#panel-search ul.feed-grid button').first()); await sleep(450); } },
  { id: '상세(신약·임상·화합물 블록) 서랍·시트', drawerOnly: true, run: async (p, v) => { await p.fill('#q', 'tiratricol'); await sleep(350); await tap(v, p.locator('#panel-search ul.feed-grid button').first()); await sleep(500); } },
  { id: '상세(국내 제품 블록) 서랍·시트', drawerOnly: true, run: async (p, v) => { await p.fill('#q', '아세트아미노펜'); await sleep(350); await tap(v, p.locator('#panel-search ul.feed-grid button').first()); await sleep(500); } },
  { id: '분류 트리 서랍(펼침)', phoneOnly: true, run: async (p, v) => { await tap(v, p.locator('#nav-toggle')); await sleep(400); await tap(v, p.locator('#tree button[aria-expanded]').first()); await sleep(200); } },
];

const axeFn = () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations', 'incomplete'] })
  .then((r) => ({
    violations: r.violations.map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length, target: x.nodes[0] ? x.nodes[0].target.join(' ') : '', html: x.nodes[0] ? x.nodes[0].html.replace(/\s+/g, ' ').slice(0, 110) : '' })),
    incomplete: r.incomplete.map((x) => x.id),
  }));

(async () => {
  const browser = await chromium.launch();
  const unreviewed = new Set();
  for (const v of VIEWS) {
    if (ONLY_VIEW && !v.name.includes(ONLY_VIEW)) continue;
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1, colorScheme: scheme, hasTouch: !!v.touch, isMobile: !!v.mobile });
      const failed = [];
      await ctx.route(/^(?!file:)/, (r) => { failed.push(r.request().url()); return r.abort(); });
      const page = await ctx.newPage(); page.setDefaultTimeout(8000);
      const errs = [];
      page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.type() + ': ' + m.text()); });
      for (const st of STATES) {
        // 서랍·시트는 상세가 서랍이 되는 폭(≤1099px)에서만, 분류 트리 서랍은 휴대폰(≤699px)에서만 의미가 있다.
        if (ONLY_STATE && !st.id.includes(ONLY_STATE)) continue;
        if (st.phoneOnly && !v.phone) continue;
        if (st.drawerOnly && v.w >= 1100) continue;
        await page.goto(URL + '#'); await page.reload(); await page.waitForSelector('#root > *'); await sleep(250);
        await page.addScriptTag({ content: AXE });
        let err = '';
        try { await st.run(page, v); } catch (e) { err = e.message.split('\n')[0]; }
        const r = await page.evaluate(axeFn);
        r.incomplete.forEach((i) => unreviewed.add(i));
        ck(`접근성(${v.name} · ${scheme === 'light' ? '밝게' : '어둡게'}) ${st.id}: axe 위반 없음`, !err && r.violations.length === 0, err ? { err } : r.violations.length ? r.violations : undefined);
      }
      ck(`접근성(${v.name} · ${scheme === 'light' ? '밝게' : '어둡게'}): 콘솔·페이지 오류 없음, 외부 요청 시도 없음`, errs.length === 0 && failed.length === 0, { errs: errs.slice(0, 3), ext: failed.slice(0, 3) });
      await ctx.close();
    }
  }
  await browser.close();
  if (unreviewed.size) console.log('참고(자동으로 판정하지 못해 사람이 볼 항목):', [...unreviewed].join(', '));
  console.log(`\n${total}개 중 ${total - bad}개 통과` + (bad ? `, ${bad}개 실패` : ' — 모두 통과'));
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
