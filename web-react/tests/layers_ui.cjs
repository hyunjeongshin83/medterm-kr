// MedTerm-KR 추가 자료 화면 점검(실제 크롬): 국내 제품 탭 · 최신·임상 탭 · 검색의 교차 안내 · 상세의 추가 블록 · 정보 탭의 추가 자료 절.
// 사용: node tests/layers_ui.cjs [dist 파일명]. 외부 요청은 모두 막고(오프라인) 콘솔 오류·페이지 오류·차단된 요청이 있으면 실패로 센다.
// 기대값은 화면과 따로 계산한다: 페이지 안에서 같은 자료로 Layers(web/js/layers.js)를 새로 만들어 건수를 구하고, 화면의 숫자와 맞는지 본다.
// (Layers 자체의 정확성은 루트의 tests/layers_check.js 가 본다.)
const { chromium } = require('playwright');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const FILE = process.argv[2] || 'MedTerm-KR_react.html';
const URL = 'file://' + path.join(ROOT, 'dist', FILE);

let bad = 0, total = 0;
const ck = (name, ok, extra) => { total++; if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); };
const nf = (n) => Number(n).toLocaleString('ko-KR');
const num = (s) => Number(String(s).replace(/[^\d]/g, ''));

async function open(browser, w, h, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: o.scheme || 'light', hasTouch: !!o.touch, isMobile: !!o.mobile });
  const failed = [];
  await ctx.route(/^(?!file:)/, (r) => { failed.push(r.request().url()); return r.abort(); });
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  page.errs = []; page.failedUrls = failed;
  page.on('pageerror', (e) => page.errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) page.errs.push(m.type() + ': ' + m.text()); });
  if (o.noLayers) await page.addInitScript(() => { for (const k of ['MEDTERM_NEW', 'MEDTERM_PRODUCTS']) Object.defineProperty(window, k, { value: undefined, writable: false, configurable: false }); });
  await page.goto(URL); await page.waitForSelector('#root > *'); await page.waitForTimeout(250);
  return { ctx, page };
}
const tabTo = async (page, name) => { await page.getByRole('tab', { name, exact: true }).click(); await page.waitForTimeout(200); };
const overflow = (page) => page.evaluate(() => { const c = document.getElementById('center'); return { doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, center: c ? c.scrollWidth - c.clientWidth : 0 }; });
const noErr = (label, page) => ck(label + ': 콘솔·페이지 오류 없음, 외부 요청 시도 없음', page.errs.length === 0 && page.failedUrls.length === 0, { errs: page.errs, ext: page.failedUrls });
// 페이지 안에서 독립 계산용 Layers 를 만들어 식을 계산한다.
const calc = (page, fn, arg) => page.evaluate(({ src, arg }) => {
  const mt = new MedTermCore.MedTerm(MEDTERM_DATA, MEDTERM_CLASSES, window.MEDTERM_EXT);
  const L = new MedTermLayers.Layers(mt, window.MEDTERM_NEW, window.MEDTERM_PRODUCTS);
  return (new Function('L', 'mt', 'arg', 'return (' + src + ')(L, mt, arg)'))(L, mt, arg);
}, { src: fn.toString(), arg });
const prodCount = async (page) => num(await page.locator('#plist-title').innerText().catch(() => '0'));
const rowsOf = (page) => page.locator('#panel-product section[aria-labelledby="plist-title"] > ul > li > button');
const setQ = async (page, sel, v) => { await page.fill(sel, v); await page.waitForTimeout(450); };

(async () => {
  const browser = await chromium.launch();

  /* ───── 1. 데스크톱: 탭 구성 · 제품 탭 ───── */
  {
    const { ctx, page } = await open(browser, 1440, 1000);
    const names = await page.getByRole('tab').allInnerTexts();
    ck('탭 7개: 사전 검색 · 국내 제품 · 최신·임상 · 관계 그래프 · 답변 검증 · 근거 기반 질의 · 데이터·한계(앞 두 줄은 분류 트리의 보기 전환 탭)', JSON.stringify(names.slice(2).map((t) => t.trim())) === JSON.stringify(['사전 검색', '국내 제품', '최신·임상', '관계 그래프', '답변 검증', '근거 기반 질의', '데이터·한계']), names);
    const foot = await page.locator('footer, [data-source-footer]').first().innerText().catch(() => '');
    ck('하단 출처 표기에 추가 자료(FDA·ClinicalTrials.gov·PubChem·심평원 제품) 한 줄', foot.includes('FDA') && foot.includes('ClinicalTrials.gov') && foot.includes('PubChem') && foot.includes('의약품표준코드'), foot.slice(0, 200));

    await tabTo(page, '국내 제품');
    const C = await calc(page, (L) => L.prodMeta.counts);
    const head = await page.locator('#prod-title').locator('xpath=..').innerText();
    ck('제품 탭 머리글: 제품 수·전문·일반·업체 수·한약제제(추정) 수가 자료와 같음', [C.products, C.rx, C.otc, C.companies, C.herbal_guess].every((n) => head.includes(nf(n))), head.slice(0, 160));
    ck('제품 탭: 처음에는 전체 제품 수가 목록 제목에 나오고 30건만 먼저 보임 + "더 보기"', (await prodCount(page)) === C.products && (await rowsOf(page).count()) === 30 && (await page.getByRole('button', { name: /^더 보기/ }).count()) === 1);
    await page.getByRole('button', { name: /^더 보기/ }).click(); await page.waitForTimeout(150);
    ck('"더 보기"를 누르면 30건이 더 보임', (await rowsOf(page).count()) === 60);

    // 이름 검색
    await setQ(page, '#pq', '메카인');
    const mk = await calc(page, (L) => L.searchProducts({ q: '메카인', limit: 100000 }).total);
    ck('검색 "메카인": 화면 건수가 API 와 같고 메카인정이 있음', (await prodCount(page)) === mk && mk >= 2 && (await rowsOf(page).first().innerText()).includes('메카인'), { mk });
    await rowsOf(page).first().click(); await page.waitForTimeout(200);
    const det = await page.locator('#prod-detail').innerText();
    ck('제품 상세: 제약회사·허가·ATC·품목기준코드(열쇠가 아님 안내)·성분 구성 표시', ['제약회사', '허가', 'ATC', '품목기준코드', '제품 구별 열쇠가 아닙니다', '성분 구성'].every((s) => det.includes(s)), det.slice(0, 300));
    ck('제품 상세: 대체 후보는 "대체조제 가능 판정이 아닙니다"와 약사법 제27조 안내를 함께 보임(있을 때)', !det.includes('대체 후보') || (det.includes('대체조제 가능 판정이 아닙니다') && det.includes('약사법 제27조')), det.slice(-300));
    ck('제품 상세: 초안·약사 검수 전 표시', det.includes('초안') && det.includes('약사 검수 전'));
    await page.getByRole('button', { name: '제품 상세 닫기' }).click(); await page.waitForTimeout(100);
    ck('제품 상세 닫기', (await page.locator('#prod-detail').count()) === 0);

    // 한약제제
    await setQ(page, '#pq', '반하사심탕');
    const bh = await calc(page, (L) => ({ total: L.searchProducts({ q: '반하사심탕', limit: 100000 }).total, herbal: L.searchProducts({ q: '반하사심탕', herbal: true, limit: 100000 }).total }));
    ck('검색 "반하사심탕": 건수가 API 와 같고 한약제제(추정) 표시가 보임', (await prodCount(page)) === bh.total && bh.total >= 30 && (await page.locator('#panel-product').innerText()).includes('한약제제(추정)'), bh);
    await rowsOf(page).first().click(); await page.waitForTimeout(200);
    const det2 = await page.locator('#prod-detail').innerText();
    ck('한약제제 상세: "이름 규칙으로 추정" + 처방 구성·병명·효능은 자료에 없다는 안내', !det2.includes('한약제제(추정)') || (det2.includes('이름 규칙으로 추정') && det2.includes('처방 구성') && det2.includes('약사 확인')), det2.slice(0, 200));

    // 증상어 → 묶음
    await setQ(page, '#pq', '감기');
    const cold = await calc(page, (L) => ({ direct: L.searchProducts({ q: '감기', limit: 1 }).total, union: L.searchProducts({ group: ['cold', 'pain'], limit: 1 }).total, cold: L.searchProducts({ group: 'cold', limit: 1 }).total }));
    const hint = await page.locator('#prod-hints').innerText();
    ck('검색 "감기": 맞는 묶음(감기·기침·코, 해열·진통·소염)을 안내하고 복약·구매 추천이 아니라고 밝힘', hint.includes('감기·기침·코') && hint.includes('해열·진통·소염') && hint.includes('복약·구매 추천이 아닙니다'), hint.slice(0, 200));
    ck('검색 "감기": 이름에 없으면 관련 묶음 전체를 보여 줌(건수 = 두 묶음의 합집합)', cold.direct === 0 ? (await prodCount(page)) === cold.union && hint.includes('이 묶음 전체를 보여 드립니다') : true, cold);
    await page.locator('#prod-hints').getByRole('button', { name: '감기·기침·코' }).click(); await page.waitForTimeout(300);
    ck('묶음 칩을 누르면 그 묶음만 남고(눌림 표시) 검색어는 비워짐', (await prodCount(page)) === cold.cold && (await page.locator('#pq').inputValue()) === '' && (await page.locator('#panel-product [role="group"][aria-label="제품 묶음·구분 거르기"] button[aria-pressed="true"]').allInnerTexts()).join('|').includes('감기·기침·코'), { n: await prodCount(page), exp: cold.cold });
    await page.getByRole('button', { name: '조건 모두 풀기' }).click(); await page.waitForTimeout(250);
    ck('"조건 모두 풀기": 전체 제품으로 돌아옴', (await prodCount(page)) === C.products);

    // 숙취 · 링거
    await setQ(page, '#pq', '숙취해소');
    const hg = await page.locator('#prod-hints').innerText();
    ck('검색 "숙취해소": 허가 의약품에 없고 건강기능식품이라는 안내 + 제품 0건 + "확인이 필요" 문구', hg.includes('건강기능식품') && hg.includes('약사 확인') && (await rowsOf(page).count()) === 0 && (await page.locator('#panel-product').innerText()).includes('확인이 필요하다'), hg.slice(0, 120));
    await setQ(page, '#pq', '링거');
    const rg = await calc(page, (L) => L.searchProducts({ q: '링거', limit: 100000 }).total);
    const hr = await page.locator('#prod-hints').innerText();
    ck('검색 "링거": 링거 이름 제품이 있고(링거라이트액 등) 수액 묶음·안내가 함께 나옴', (await prodCount(page)) === rg && rg > 0 && hr.includes('수액·링거') && hr.includes('링거라이트액'), { rg });
    await setQ(page, '#pq', '포타스티오다정');
    ck('검색 "포타스티오다정"(자료에 없는 철자): 0건이며 없다는 뜻이 아니라 확인 필요라고 안내', (await rowsOf(page).count()) === 0 && (await page.locator('#panel-product').innerText()).includes('확인이 필요하다'));
    await setQ(page, '#pq', '');

    // 필터
    await page.getByRole('button', { name: '전문의약품', exact: true }).click(); await page.waitForTimeout(250);
    ck('전문의약품 필터: 건수가 자료와 같고 보이는 줄이 모두 전문의약품', (await prodCount(page)) === C.rx && (await rowsOf(page).allInnerTexts()).every((t) => t.includes('전문의약품')));
    await page.getByRole('button', { name: '일반의약품', exact: true }).click(); await page.waitForTimeout(250);
    ck('일반의약품 필터로 바꾸면 건수가 일반의약품 수(전문 필터는 풀림)', (await prodCount(page)) === C.otc);
    await page.getByRole('button', { name: '한약제제(추정)', exact: true }).click(); await page.waitForTimeout(250);
    const oh = await calc(page, (L) => L.searchProducts({ kind: 1, herbal: true, limit: 1 }).total);
    ck('일반의약품 + 한약제제(추정): 건수가 API 와 같음', (await prodCount(page)) === oh, oh);
    await page.getByRole('button', { name: '조건 모두 풀기' }).click(); await page.waitForTimeout(200);

    // 제약회사
    await page.fill('input[aria-label="제약회사 찾기"]', '종근당'); await page.waitForTimeout(250);
    const cos = page.locator('#panel-product section[aria-labelledby="pco-title"] ul button');
    const co0 = (await cos.first().locator('b').innerText()).trim();
    const coN = await calc(page, (L, mt, name) => { const c = L.companies({ q: name })[0]; return { name: c.name, total: c.total, ix: c.ix }; }, '종근당');
    ck('제약회사 찾기: 이름을 넣으면 그 업체가 맨 위에 나옴', co0 === coN.name && co0.includes('종근당'), { co0, coN });
    await cos.first().click(); await page.waitForTimeout(250);
    ck('업체를 고르면 그 업체 제품만 남고 "업체:" 칩이 보임', (await prodCount(page)) === coN.total && (await page.locator('#panel-product').innerText()).includes(`업체: ${coN.name}`), { n: await prodCount(page), exp: coN.total });
    noErr('제품 탭(1440)', page);
    await ctx.close();
  }

  /* ───── 2. 검색의 교차 안내 · 상세의 추가 블록 · 탭 이동 ───── */
  {
    const { ctx, page } = await open(browser, 1440, 1000);
    await page.fill('#q', '아세트아미노펜'); await page.waitForTimeout(450);
    const exp = await calc(page, (L) => L.searchProducts({ q: '아세트아미노펜', limit: 1 }).total);
    const cross = await page.locator('#cross-hits').innerText().catch(() => '');
    ck('사전 검색: 같은 검색어가 제품에도 있으면 "국내 제품 N건" 안내(건수 = API)', cross.includes('다른 자료에도 있습니다') && cross.includes(`국내 제품 ${nf(exp)}건`) && exp > 0, { cross, exp });
    await page.locator('#cross-hits').getByRole('button', { name: /국내 제품/ }).click(); await page.waitForTimeout(500);
    ck('안내 단추를 누르면 국내 제품 탭으로 가서 같은 검색어로 찾음', (await page.locator('#tab-product').getAttribute('aria-selected')) === 'true' && (await page.locator('#pq').inputValue()) === '아세트아미노펜' && (await prodCount(page)) === exp, { n: await prodCount(page), exp });
    await tabTo(page, '사전 검색');
    await page.fill('#q', '없는약이름xyz'); await page.waitForTimeout(350);
    ck('검색 결과가 없으면 교차 안내도 없음', (await page.locator('#cross-hits').count()) === 0);

    // 핵심 성분 상세
    await page.fill('#q', '아세트아미노펜'); await page.waitForTimeout(450);
    await page.locator('section[aria-labelledby="list-title"] button').first().click(); await page.waitForTimeout(500);
    const blk = page.locator('#detail [data-layer-block]');
    ck('성분 상세(아세트아미노펜): 추가 블록 "이 성분이 든 국내 제품"이 보임', (await blk.count()) === 1 && (await blk.innerText()).includes('이 성분이 든 국내 제품') && (await blk.innerText()).includes('심평원 의약품표준코드'));
    const bt = await blk.innerText();
    ck('성분 상세: 제품 수는 "코드+품목명+업체" 단위라는 설명이 있음', bt.includes('품목기준코드+품목명+업체'), bt.slice(0, 200));
    await blk.getByRole('button', { name: '국내 제품 탭에서 모두 보기' }).click(); await page.waitForTimeout(500);
    ck('상세의 "국내 제품 탭에서 모두 보기": 제품 탭으로 가서 성분 이름으로 찾음', (await page.locator('#tab-product').getAttribute('aria-selected')) === 'true' && (await page.locator('#pq').inputValue()).length > 0 && (await prodCount(page)) > 0, await page.locator('#pq').inputValue());

    // 임상 요약이 있는 확장 성분: 신약 중 사전에 연결된 것
    const nv = await calc(page, (L, mt) => { const x = L.news.novel.find((n) => n.e && L.news.tr[n.k] && L.news.ch[n.k]); return x ? { e: x.e, b: x.b, g: x.g, k: x.k, name: mt.nameOfId(x.e) } : null; });
    await tabTo(page, '사전 검색');
    await page.fill('#q', nv.k); await page.waitForTimeout(500);
    const hit = page.locator('#ext-list button, section[aria-labelledby="list-title"] button').first();
    if (await hit.count()) { await hit.click(); await page.waitForTimeout(500); }
    const lb = page.locator('#detail [data-layer-block]');
    const lt = (await lb.count()) ? await lb.innerText() : '';
    ck(`성분 상세(${nv.k}): 최신 승인 · 임상시험 현황 · 화합물 연결 블록이 보임`, lt.includes('최신 승인') && lt.includes('임상시험 현황') && lt.includes('화합물 연결'), lt.slice(0, 200));
    ck('임상 블록: ClinicalTrials.gov 등록 기준 + 효능·안전성의 근거가 아니라는 안내', lt.includes('ClinicalTrials.gov 등록 기준') && lt.includes('효능·안전성의 근거가 아닙니다'));
    ck('화합물 블록: 같은 계열·같은 효과·대체 가능을 뜻하지 않는다는 안내', lt.includes('대체 가능을 뜻하지 않습니다'));
    ck('FDA 승인 블록: 국내 허가·급여를 뜻하지 않는다는 안내', lt.includes('국내 허가·급여를 뜻하지 않으며'));
    const links = await page.locator('#detail [data-layer-block] a').evaluateAll((as) => as.map((a) => ({ h: a.href, t: a.target, r: a.rel })));
    ck('바깥 링크는 새 탭 + noopener noreferrer, 주소는 FDA·PubChem·ClinicalTrials.gov 뿐', links.length > 0 && links.every((l) => l.t === '_blank' && l.r.includes('noopener') && l.r.includes('noreferrer') && /^https:\/\/(www\.fda\.gov|pubchem\.ncbi\.nlm\.nih\.gov|clinicaltrials\.gov)\//.test(l.h)), links.slice(0, 4));
    noErr('교차 안내·상세(1440)', page);
    await ctx.close();
  }

  /* ───── 3. 최신·임상 탭 ───── */
  {
    const { ctx, page } = await open(browser, 1440, 1000);
    await tabTo(page, '최신·임상');
    const C = await calc(page, (L) => ({ ...L.newMeta.counts, years: L.novelYears(), byYear: Object.fromEntries(L.novelYears().map((y) => [y, L.novelList({ year: y }).length])), linked: L.novelList({ linked: true }).length }));
    const listN = async () => num(await page.locator('#nlist-title').innerText().catch(() => '0'));
    ck('FDA 신약 승인: 전체 건수가 자료와 같고 15건만 먼저 보임 + "더 보기"', (await listN()) === C.novel && (await page.locator('section[aria-labelledby="nlist-title"] > ul > li').count()) === 15 && (await page.getByRole('button', { name: /^더 보기/ }).count()) === 1);
    const chips = await page.locator('[role="group"][aria-label="승인 연도"] button').allInnerTexts();
    ck('연도 칩: 전체 + 자료에 있는 연도(최신 연도부터)', JSON.stringify(chips) === JSON.stringify(['전체', ...C.years.map(String)]), chips);
    const y0 = C.years[0];
    await page.locator('[role="group"][aria-label="승인 연도"]').getByRole('button', { name: String(y0), exact: true }).click(); await page.waitForTimeout(250);
    ck(`연도 칩 ${y0}: 건수가 그 해 승인 수와 같음`, (await listN()) === C.byYear[y0], { n: await listN(), exp: C.byYear[y0] });
    await page.locator('[role="group"][aria-label="승인 연도"]').getByRole('button', { name: '전체', exact: true }).click();
    const first = await calc(page, (L) => L.novelList({})[0]);
    await setQ(page, 'input[aria-label="신약 승인 검색"]', first.b);
    ck('상표 검색: 가장 최근 승인 신약이 나옴', (await page.locator('section[aria-labelledby="nlist-title"] > ul > li').first().innerText()).includes(first.b), first.b);
    // 카드 펼치기
    const card = page.locator('section[aria-labelledby="nlist-title"] > ul > li').first();
    await card.locator('summary').click(); await page.waitForTimeout(250);
    const ct = await card.innerText();
    ck('신약 카드 펼치기: 임상시험 현황(등록 기준 또는 확인 필요) · 화합물 연결 표시', ct.includes('임상시험 현황') && (ct.includes('ClinicalTrials.gov 등록 기준')), ct.slice(0, 200));
    await setQ(page, 'input[aria-label="신약 승인 검색"]', 'zzzz없는이름');
    ck('검색 결과가 없으면 "확인이 필요" 안내', (await page.locator('#panel-new').innerText()).includes('확인이 필요하다'));
    await setQ(page, 'input[aria-label="신약 승인 검색"]', '');

    // 임상 진행·예정 성분
    await page.getByRole('button', { name: '임상 진행·예정 성분' }).click(); await page.waitForTimeout(300);
    // 기대값: 화면과 따로(자료에서 직접) 센다. 토글 3개: 산업체 주관(처음 켜짐) · 흔히 쓰는 약 제외(처음 켜짐) · 국내 등재 제외(처음 꺼짐)
    const pipe = await calc(page, (L, mt) => {
      const tr = L.news.tr, ent = L.news.ent || {}; const cnt = (f, ind, common, nokr) => { let n = 0;
        for (const k of Object.keys(tr)) { const t = tr[k], st = t.st || {}, ph = t.ph || {}; if (!((st.act || 0) + (st.nyr || 0) > 0)) continue; if (ind && !t.ind) continue; if (common && t.cap) continue;
          if (nokr && ent[k] && ((mt.extById.get(ent[k]) || {}).rec || {}).kr) continue; const late = ph['3'] || ph['2/3'], mid = ph['2'] || ph['2/3'] || ph['1/2'];
          if (f === 'p3' && !late) continue; if (f === 'p2' && !mid) continue; if (f === 'nyr' && !st.nyr) continue; n++; } return n; };
      return { p3: cnt('p3', true, true, false), p3All: cnt('p3', false, true, false), p3Rare: cnt('p3', false, false, false), p3NoKr: cnt('p3', false, true, true), p2: cnt('p2', false, true, false), nyr: cnt('nyr', false, true, false), all: cnt('all', false, true, false), allRare: cnt('all', false, false, false), capped: Object.values(tr).filter((t) => t.cap).length };
    });
    ck('임상 진행·예정(처음: 3상 + 산업체 주관 + 흔한 약 제외): 건수가 자료에서 따로 센 값과 같음', (await listN()) === pipe.p3, { n: await listN(), pipe });
    await page.getByLabel('산업체 주관 시험이 있는 성분만').uncheck(); await page.waitForTimeout(250);
    ck('산업체 주관 거르기를 풀면 3상 전체 건수', (await listN()) === pipe.p3All, { n: await listN(), pipe });
    await page.getByLabel(/흔히 쓰는 약\(등록 1,000건 이상\) 제외/).uncheck(); await page.waitForTimeout(250);
    ck('"흔히 쓰는 약 제외"를 풀면 비교약으로 많이 쓰인 성분(생리식염수 등)이 다시 들어옴', (await listN()) === pipe.p3Rare && pipe.p3Rare > pipe.p3All, { n: await listN(), pipe });
    await page.getByLabel(/흔히 쓰는 약\(등록 1,000건 이상\) 제외/).check();
    await page.getByLabel(/국내 등재 성분 제외/).check(); await page.waitForTimeout(250);
    ck('"국내 등재 성분 제외"를 켜면 건수가 줄어듦(새 성분 중심)', (await listN()) === pipe.p3NoKr && pipe.p3NoKr < pipe.p3All, { n: await listN(), pipe });
    await page.getByLabel(/국내 등재 성분 제외/).uncheck();
    await page.getByRole('button', { name: '2상 진행·예정' }).click(); await page.waitForTimeout(250);
    ck('2상 진행·예정: 건수가 같음', (await listN()) === pipe.p2, { n: await listN(), pipe });
    await page.getByRole('button', { name: '모집 예정(시작 전)' }).click(); await page.waitForTimeout(250);
    ck('모집 예정(시작 전): 건수가 같음', (await listN()) === pipe.nyr, { n: await listN(), pipe });
    await page.getByRole('button', { name: '진행·예정 전체' }).click(); await page.waitForTimeout(250);
    ck('진행·예정 전체: 건수가 같음', (await listN()) === pipe.all, { n: await listN(), pipe });
    const years = await page.locator('section[aria-labelledby="nlist-title"] > ul > li').evaluateAll((els) => els.map((e) => (/시작\(예정 포함\) (\d{4})/.exec(e.innerText) || [])[1]).filter(Boolean).map(Number));
    ck('진행·예정 카드의 시작(예정) 연도가 모두 현실적인 범위(등록소 입력 오류 2099 등 없음)', years.length > 0 && years.every((y) => y >= 1990 && y <= new Date().getFullYear() + 6), years.slice(0, 8));
    const pc = page.locator('section[aria-labelledby="nlist-title"] > ul > li').first();
    ck('임상 진행 카드: 대상 질환·시작 시기·단계 칩이 있음', /시작\(예정 포함\)/.test(await pc.innerText()) && /단계|진행 중|모집 예정/.test(await pc.innerText()), (await pc.innerText()).slice(0, 160));
    const note = await page.locator('#panel-new').innerText();
    ck('탭 하단: 출처 링크 3곳 + 초안 안내 + 식약처 허가 미연동 안내', note.includes('FDA CDER 신약 승인표') && note.includes('ClinicalTrials.gov') && note.includes('PubChem') && note.includes('식약처 허가 반영'));
    noErr('최신·임상 탭(1440)', page);
    await ctx.close();
  }

  /* ───── 4. 정보 탭의 추가 자료 절 ───── */
  {
    const { ctx, page } = await open(browser, 1440, 1000);
    await tabTo(page, '데이터·한계');
    const sec = await page.locator('#about-layers').innerText();
    const C = await calc(page, (L) => ({ n: L.newMeta.counts, p: L.prodMeta.counts }));
    ck('정보 탭 "추가 자료" 절: 신약·임상·제품 수가 자료와 같음', [C.n.novel, C.n.trials, C.n.chem, C.p.products, C.p.companies].every((n) => sec.includes(nf(n))), sec.slice(0, 200));
    ck('"숫자의 뜻": 제품 1건의 정의 · 임상 건수는 효능 근거가 아님 · 한약제제 추정 · 대체 후보는 판정이 아님', sec.includes('품목기준코드 + 품목명 + 업체') && sec.includes('효능·안전성의 근거가 아닙니다') && sec.includes('한약제제(추정)') && sec.includes('약사법 제27조'));
    ck('"연결하지 못한 자료와 이유": 의약품안전나라 · 식품안전나라 · 약학정보원 · 대한약사회 · 비공개 파이프라인', ['의약품안전나라', '식품안전나라', '약학정보원(health.kr)', '대한약사회(pharm.or.kr)', '비공개 파이프라인'].every((s) => sec.includes(s)));
    ck('출처와 이용 조건: 심평원 공공누리 제1유형 · FDA · NLM(ClinicalTrials.gov·PubChem) 출처 표기', sec.includes('공공누리 제1유형') && sec.includes('U.S. Food and Drug Administration') && sec.includes('ClinicalTrials.gov') && sec.includes('National Center for Biotechnology Information'));
    noErr('정보 탭(1440)', page);
    await ctx.close();
  }

  /* ───── 5. 폭별 가로 넘침 · 터치 크기 ───── */
  for (const [w, h, touch] of [[1024, 800, false], [768, 1024, true], [390, 844, true], [360, 740, true]]) {
    const { ctx, page } = await open(browser, w, h, { touch, mobile: w < 700 });
    let ok = true; const seen = [];
    for (const t of ['국내 제품', '최신·임상', '데이터·한계']) {
      await tabTo(page, t);
      if (t === '국내 제품') { await setQ(page, '#pq', '반하사심탕'); await rowsOf(page).first().click(); await page.waitForTimeout(200); }
      if (t === '최신·임상') { await page.locator('section[aria-labelledby="nlist-title"] summary').first().click(); await page.waitForTimeout(200); }
      const o = await overflow(page); seen.push([t, o]); if (o.doc > 0 || o.center > 0) ok = false;
    }
    ck(`폭 ${w}: 제품(상세 열림)·최신(카드 펼침)·정보 탭에서 가로 넘침 없음`, ok, seen);
    if (touch) {
      await tabTo(page, '국내 제품'); await setQ(page, '#pq', '');
      const small = await page.evaluate(() => [...document.querySelectorAll('#panel-product button, #panel-product input:not([type=hidden])')].filter((e) => e.offsetParent && !e.closest('[aria-hidden="true"]')).map((e) => { const r = e.getBoundingClientRect(); return { t: (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 12), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((b) => b.h < 44 || b.w < 44));
      ck(`폭 ${w}(터치): 제품 탭의 단추·입력칸이 모두 44px 이상`, small.length === 0, small.slice(0, 5));
      await tabTo(page, '최신·임상');
      const small2 = await page.evaluate(() => [...document.querySelectorAll('#panel-new button, #panel-new summary, #panel-new input:not([type=hidden])')].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return { t: (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 12), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((b) => b.h < 44 || (b.w < 44 && b.t !== '')));
      ck(`폭 ${w}(터치): 최신 탭의 단추·펼침 줄이 모두 44px 이상`, small2.length === 0, small2.slice(0, 5));
    }
    noErr(`폭 ${w}`, page);
    await ctx.close();
  }

  /* ───── 5-2. 본문 위 알약 탭 줄: 폭마다 끝 탭이 잘리지 않음 · 좁으면 짧은 이름(접근 가능한 이름은 늘 긴 이름) ───── */
  {
    const LONG = ['사전 검색', '국내 제품', '최신·임상', '관계 그래프', '답변 검증', '근거 기반 질의', '데이터·한계'];
    const SHORT = ['검색', '제품', '최신', '그래프', '검증', '질의', '데이터'];
    const readStrip = (page) => page.evaluate(() => {
      const l = document.querySelector('#center [role="tablist"][data-variant="top"]');
      const lr = l.getBoundingClientRect(), tabs = [...l.querySelectorAll('[role="tab"]')], rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      return {
        client: l.clientWidth, scroll: l.scrollWidth, rem,
        outside: tabs.filter((b) => { const r = b.getBoundingClientRect(); return r.right > lr.right + 0.5 || r.left < lr.left - 0.5; }).length,
        texts: tabs.map((b) => b.innerText.trim()), titles: tabs.map((b) => b.getAttribute('title')), labels: tabs.map((b) => b.getAttribute('aria-label')),
        minW: Math.min(...tabs.map((b) => Math.round(b.getBoundingClientRect().width))), minH: Math.min(...tabs.map((b) => Math.round(b.getBoundingClientRect().height))),
      };
    });
    const rows = []; let okFit = true, okText = true, okName = true, okSize = true;
    for (const w of [700, 768, 900, 1024, 1100, 1180, 1280, 1366, 1440, 1920]) {
      const { ctx, page } = await open(browser, w, 900);
      const m = await readStrip(page);
      const wantLong = m.client >= (32.5 + 5 * (LONG.length - 5)) * m.rem;
      const fit = m.scroll <= m.client && m.outside === 0;
      const textOk = JSON.stringify(m.texts) === JSON.stringify(wantLong ? LONG : SHORT);
      let nameOk = true; for (const n of LONG) if ((await page.getByRole('tab', { name: n, exact: true }).count()) !== 1) nameOk = false;
      const sizeOk = m.minW >= 44 && m.minH >= 44;
      if (!fit) okFit = false; if (!textOk) okText = false; if (!nameOk) okName = false; if (!sizeOk) okSize = false;
      rows.push({ w, strip: m.client, long: wantLong, fit, textOk, nameOk, minW: m.minW });
      await ctx.close();
    }
    ck('탭 줄: 700~1920px 모든 폭에서 7개 탭이 줄 안에 모두 들어옴(옆으로 밀어야 보이는 탭 없음)', okFit, rows.filter((r) => !r.fit));
    ck('탭 줄: 줄 폭이 넉넉하면 긴 이름 · 좁으면 하단 막대와 같은 짧은 이름(검색·제품·최신·그래프·검증·질의·데이터)', okText, rows.filter((r) => !r.textOk));
    ck('탭 줄: 어느 폭에서든 접근 가능한 이름은 긴 이름 그대로(탭마다 하나씩)', okName, rows.filter((r) => !r.nameOk));
    ck('탭 줄: 짧은 이름일 때도 탭 하나가 가로 44px · 세로 44px 이상', okSize, rows.filter((r) => r.minW < 44));
    ck('탭 줄: 대표 폭 확인(1280=짧은 이름 · 1366·1440=긴 이름)', rows.find((r) => r.w === 1280).long === false && rows.find((r) => r.w === 1366).long === true && rows.find((r) => r.w === 1440).long === true, rows.filter((r) => [1280, 1366, 1440].includes(r.w)));
    // 창 크기를 바꾸면 이름도 따라 바뀜(1440 → 1280 → 1440), 짧은 이름일 때 마우스를 올리면 긴 이름이 말풍선(title)으로 보임
    const { ctx, page } = await open(browser, 1440, 900);
    let m = await readStrip(page);
    ck('탭 줄 크기 변경: 1440에서 긴 이름', JSON.stringify(m.texts) === JSON.stringify(LONG) && m.titles.every((t) => t === null), m.texts);
    await page.setViewportSize({ width: 1280, height: 900 }); await page.waitForTimeout(300); m = await readStrip(page);
    ck('탭 줄 크기 변경: 1280으로 줄이면 짧은 이름 + 긴 이름이 title 로 붙음 + 잘림 없음', JSON.stringify(m.texts) === JSON.stringify(SHORT) && JSON.stringify(m.titles) === JSON.stringify(LONG) && m.scroll <= m.client, m);
    await tabTo(page, '근거 기반 질의');
    ck('탭 줄 크기 변경: 짧은 이름 상태에서도 탭 이동이 되고 선택 탭이 aria-selected', (await page.locator('#tab-rag').getAttribute('aria-selected')) === 'true' && (await page.locator('#panel-rag').isVisible()));
    await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(300); m = await readStrip(page);
    ck('탭 줄 크기 변경: 1440으로 되돌리면 다시 긴 이름', JSON.stringify(m.texts) === JSON.stringify(LONG) && m.titles.every((t) => t === null), m.texts);
    noErr('탭 줄 크기 변경', page);
    await ctx.close();
  }

  /* ───── 5-3. 큰 자료 층(최신·임상 · 국내 제품)은 처음 쓸 때 읽음 → 첫 화면이 그만큼 빨리 뜸 ───── */
  {
    const openLazy = async (idle) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
      const failed = []; await ctx.route(/^(?!file:)/, (r) => { failed.push(r.request().url()); return r.abort(); });
      const page = await ctx.newPage(); page.setDefaultTimeout(8000); page.errs = []; page.failedUrls = failed;
      page.on('pageerror', (e) => page.errs.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) page.errs.push(m.type() + ': ' + m.text()); });
      await page.addInitScript((noIdle) => {
        if (noIdle) window.requestIdleCallback = () => 0;   // 미리 읽기를 막아 "처음 쓸 때 읽는지"만 본다
        window.__big = 0; const orig = JSON.parse; JSON.parse = function (t, r) { if (typeof t === 'string' && t.length > 500000) window.__big++; return orig.call(this, t, r); };
      }, idle === 'off');
      await page.goto(URL); await page.waitForSelector('#root > *');
      return { ctx, page };
    };
    {
      const { ctx, page } = await openLazy('off'); await page.waitForTimeout(900);
      ck('지연 읽기: 첫 화면에서는 큰 자료 층(JSON 덩어리 2개)을 해석하지 않음', (await page.evaluate(() => window.__big)) === 0);
      ck('지연 읽기: 읽지 않고도 탭 7개(국내 제품·최신·임상 포함)와 출처 표기의 추가 자료 줄이 있음',
        (await page.locator('[data-variant="bottom"] [role="tab"]').count()) === 7 && (await page.locator('footer, [data-source-footer]').first().innerText()).includes('ClinicalTrials.gov'));
      await page.fill('#q', '메트포르민'); await page.waitForTimeout(500);
      ck('지연 읽기: 검색어를 넣으면(교차 안내를 위해) 그때 읽고 교차 안내가 나옴', (await page.evaluate(() => window.__big)) === 2 && (await page.locator('#cross-hits').count()) === 1, await page.evaluate(() => window.__big));
      await tabTo(page, '국내 제품'); await page.waitForSelector('#plist-title');
      await tabTo(page, '최신·임상'); await page.waitForSelector('#nlist-title');
      ck('지연 읽기: 한 번 읽은 뒤에는 다시 읽지 않고(해석 2회 그대로) 두 탭이 정상 동작', (await page.evaluate(() => window.__big)) === 2 && num(await page.locator('#nlist-title').innerText()) > 0, await page.evaluate(() => window.__big));
      noErr('지연 읽기(미리 읽기 끔)', page); await ctx.close();
    }
    {
      const { ctx, page } = await openLazy('on');
      let big = 0; for (let k = 0; k < 40 && big < 2; k++) { await page.waitForTimeout(250); big = await page.evaluate(() => window.__big); }
      ck('지연 읽기: 건드리지 않아도 화면이 뜬 뒤 한가할 때 미리 읽어 둠(10초 안에 2개 해석)', big === 2, big);
      await tabTo(page, '국내 제품'); await setQ(page, '#pq', '반하사심탕');
      ck('지연 읽기: 미리 읽은 뒤 제품 검색이 바로 동작', (await prodCount(page)) > 0 && (await page.evaluate(() => window.__big)) === 2);
      noErr('지연 읽기(미리 읽기 켬)', page); await ctx.close();
    }
  }

  /* ───── 6. 추가 자료가 없는 빌드(또는 읽기 실패): 예전처럼 5개 탭, 추가 블록·안내 없음 ───── */
  {
    const { ctx, page } = await open(browser, 1440, 1000, { noLayers: true });
    const tabs = (await page.getByRole('tab').allInnerTexts()).map((t) => t.trim()).slice(2);
    ck('추가 자료가 없으면 탭은 5개(국내 제품·최신·임상 탭 없음)', JSON.stringify(tabs) === JSON.stringify(['사전 검색', '관계 그래프', '답변 검증', '근거 기반 질의', '데이터·한계']), tabs);
    await page.fill('#q', '아세트아미노펜'); await page.waitForTimeout(400);
    ck('추가 자료가 없으면 교차 안내가 없음', (await page.locator('#cross-hits').count()) === 0);
    await page.locator('section[aria-labelledby="list-title"] button').first().click(); await page.waitForTimeout(400);
    ck('추가 자료가 없으면 성분 상세에 추가 블록이 없음', (await page.locator('#detail [data-layer-block]').count()) === 0);
    await tabTo(page, '데이터·한계');
    ck('추가 자료가 없으면 정보 탭에 추가 자료 절이 없음', (await page.locator('#about-layers').count()) === 0);
    ck('추가 자료가 없으면 하단 출처 표기에 추가 자료 줄이 없음', !(await page.locator('footer, [data-source-footer]').first().innerText().catch(() => '')).includes('추가 자료'));
    noErr('추가 자료 없음', page);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${total}개 중 ${total - bad}개 통과, ${bad}개 실패`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('FAIL (예외)', e); process.exit(1); });
