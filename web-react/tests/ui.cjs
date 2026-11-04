// MedTerm-KR React 화면 점검(실제 크롬). 사용: node tests/ui.cjs [dist 파일명]
// 외부 요청은 모두 차단(오프라인)하고, 콘솔 오류·페이지 오류·차단된 요청이 하나라도 있으면 실패로 센다.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const { rgb, FACES } = require('./_tokens.cjs');
const FILE = process.argv[2] || 'MedTerm-KR_react.html';
const URL = 'file://' + path.join(ROOT, 'dist', FILE);
const SHOTS = path.join(ROOT, 'shots', 'ui'); fs.mkdirSync(SHOTS, { recursive: true });

let bad = 0, total = 0;
const ck = (name, ok, extra) => { total++; if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); };
const DISC = '정보 제공·연구용 프로토타입입니다. 진단·처방·개인별 복용량 판단을 하지 않으며, 한글명·상품명은 약사 검수 전 초안입니다. 복약 결정은 의사·약사와 상담하세요.';

async function open(browser, w, h, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: o.dpr || 1, colorScheme: o.scheme || 'light', hasTouch: !!o.touch, isMobile: !!o.mobile });
  const failed = [];
  await ctx.route(/^(?!file:)/, (r) => { failed.push(r.request().url()); return r.abort(); });
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  page.errs = []; page.failedUrls = failed;
  page.on('pageerror', (e) => page.errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) page.errs.push(m.type() + ': ' + m.text()); });
  await page.goto(URL + (o.hash ? '#' + o.hash : '')); await page.waitForSelector('#root > *'); await page.waitForTimeout(250);
  return { ctx, page };
}
const snap = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png') });
const noErr = (label, page) => ck(label + ': 콘솔·페이지 오류 없음, 외부 요청 시도 없음', page.errs.length === 0 && page.failedUrls.length === 0, { errs: page.errs, ext: page.failedUrls });
const tabTo = async (page, name) => { await page.getByRole('tab', { name, exact: true }).click(); await page.waitForTimeout(150); };
const overflow = (page) => page.evaluate(() => {
  const d = document.documentElement, c = document.getElementById('center');
  return { doc: d.scrollWidth - d.clientWidth, center: c.scrollWidth - c.clientWidth };
});

(async () => {
  const browser = await chromium.launch();
  const IDS = await (async () => { const { ctx, page } = await open(browser, 1440, 1000); const r = await page.evaluate(() => { const m = new MedTermCore.MedTerm(MEDTERM_DATA, MEDTERM_CLASSES); return m.vtms.map((v) => v.id); }); await ctx.close(); return r; })();
  const OME = 'MT:VTM:7646';

  /* ───── 1. 데스크톱 1440: 기본 화면 · 검색 · 상세 ───── */
  {
    const { ctx, page } = await open(browser, 1440, 1000);
    ck('제목', (await page.title()).includes('MedTerm-KR'), await page.title());
    ck('면책 문구 원문 그대로', (await page.getByRole('note').innerText()).trim() === DISC);
    ck('탭 5개, 첫 탭 선택', (await page.getByRole('tab').filter({ hasText: /사전 검색|관계 그래프|답변 검증|근거 기반 질의|데이터·한계/ }).count()) === 5 && (await page.locator('#tab-search').getAttribute('aria-selected')) === 'true');
    ck('처음에는 상세가 비어 있음', (await page.locator('#detail').innerText()).includes('성분을 선택하면'));
    ck('가로 넘침 없음(문서·가운데)', JSON.stringify(await overflow(page)) === '{"doc":0,"center":0}', await overflow(page));
    ck('한 화면에 맞음(문서 세로 넘침 없음, 앱 높이 = 창 높이)', await page.evaluate(() => { const d = document.documentElement, a = document.getElementById('root').firstElementChild; return d.scrollHeight - d.clientHeight <= 0 && Math.abs(a.getBoundingClientRect().height - innerHeight) <= 1; }));
    await page.fill('#q', '오메프라졸');
    await page.waitForTimeout(200);
    const hits = await page.locator('#panel-search ul > li').count();
    ck('검색: 결과가 나오고 정확히 일치하면 상세가 자동으로 열림', hits >= 1 && (await page.locator('#detail h3').first().innerText()).includes('오메프라졸'), { hits });
    ck('주소에 성분이 영문·숫자·하이픈(#v-7646)으로 기록됨', (await page.evaluate(() => location.hash)) === '#v-7646', await page.evaluate(() => location.hash));
    const chips = await page.locator('#detail').innerText();
    ck('상세: ATC 경로 A02BC01·RxCUI·SNOMED·출처', ['A02BC01', 'RxCUI 7646', 'SNOMED CT', 'RxNorm(NLM)'].every((s) => chips.includes(s)));
    const opens = await page.locator('#detail details').evaluateAll((els) => els.map((e) => e.open));
    ck('상세: 첫 제형만 펼침', opens.length > 1 && opens[0] === true && opens.slice(1).every((o) => !o), opens);
    ck('트리: 선택한 성분이 펼쳐진 곳에서 현재 항목으로 표시', (await page.locator('#tree [aria-current="true"]').count()) === 1);
    await page.fill('#q', '없는약이름xyz');
    ck('검색: 결과 없음은 "확인 필요"로 안내', (await page.locator('#panel-search').innerText()).includes('확인이 필요하다'));
    await page.fill('#q', 'ome');
    ck('검색: 부분 일치는 목록만(자동 선택 안 함 아님: 후보 1개면 선택)', (await page.locator('#panel-search ul > li').count()) >= 1);
    await snap(page, 'd1_search');
    noErr('1440 검색', page); await ctx.close();
  }

  /* ───── 2. 트리: 펼침·거르기·가나다순 ───── */
  {
    const { ctx, page } = await open(browser, 1440, 1000);
    const roots = await page.locator('#tree > ul > li > button').count();
    ck('트리: 최상위 분류가 보임', roots >= 10, roots);
    const first = page.locator('#tree > ul > li > button').first();
    ck('트리: 처음에는 접힘', (await first.getAttribute('aria-expanded')) === 'false');
    await first.click();
    ck('트리: 눌러서 펼침', (await first.getAttribute('aria-expanded')) === 'true');
    await page.fill('#tree-filter', '로섹');
    await page.waitForTimeout(150);
    ck('트리 거르기: 상품명(로섹)으로 오메프라졸을 찾고 분류를 펼침', (await page.locator('#tree [data-id="' + OME + '"]').count()) === 1 && (await page.locator('#tree [data-id]').count()) === 1, await page.locator('#tree [data-id]').count());
    await page.fill('#tree-filter', 'a02bc');
    await page.waitForTimeout(150);
    ck('트리 거르기: 코드(A02BC) → 그 분류 아래 성분 3개', (await page.locator('#tree [data-id]').count()) === 3, await page.locator('#tree [data-id]').count());
    await page.fill('#tree-filter', 'alimentary');
    await page.waitForTimeout(150);
    ck('트리 거르기: 분류 이름(ALIMENTARY…)이 맞으면 그 아래 성분을 모두 보여줌', (await page.locator('#tree [data-id]').count()) >= 5, await page.locator('#tree [data-id]').count());
    await page.fill('#tree-filter', 'zzzz');
    ck('트리 거르기: 결과 없음 안내', (await page.locator('#tree').innerText()).includes('걸러낸 결과가 없습니다'));
    await page.fill('#tree-filter', '');
    await page.getByRole('tab', { name: '가나다순' }).click();
    const az = await page.locator('#az [data-id]').allInnerTexts();
    const names = await page.locator('#az [data-id] .text-label-bold').allInnerTexts();
    const sorted = [...names].sort((a, b) => a.localeCompare(b, 'ko'));
    ck('가나다순: 32개 전부, 한글 정렬', names.length === IDS.length && JSON.stringify(names) === JSON.stringify(sorted), { n: names.length });
    await page.locator('#az [data-id]').nth(2).click();
    ck('가나다순에서 선택하면 상세가 바뀜', (await page.locator('#insp-title').innerText()).includes('상세') && (await page.locator('#detail h3').first().innerText()).length > 0);
    noErr('트리', page); await ctx.close();
  }

  /* ───── 3. 관계 그래프 ───── */
  {
    const { ctx, page } = await open(browser, 1440, 1000, { hash: OME });
    await tabTo(page, '관계 그래프');
    await page.waitForSelector('.react-flow__node');
    const exp = await page.evaluate((id) => { const m = new MedTermCore.MedTerm(MEDTERM_DATA, MEDTERM_CLASSES); const g = m.graph(id), L = m.layoutGraph(g); return { nodes: L.nodes.length + L.headers.length, edges: L.edges.length, w: L.width, h: L.height, totals: g.totals, shown: g.shown }; }, OME);
    const got = await page.evaluate(() => ({ nodes: document.querySelectorAll('.react-flow__node').length, edges: document.querySelectorAll('.react-flow__edge-path, .react-flow__edge path[d]').length }));
    ck('그래프: 노드 수가 core.js 레이아웃과 같음(상자 + 열 머리글)', got.nodes === exp.nodes, { got: got.nodes, exp: exp.nodes });
    ck('그래프: 간선 수가 core.js 레이아웃과 같음', got.edges === exp.edges, { got: got.edges, exp: exp.edges });
    const note = await page.locator('#graph-note').innerText();
    ck('그래프: 표시/전체 개수 안내', note.includes(`ATC 코드 ${exp.shown.atc}/${exp.totals.atc}`) && note.includes(`제형·용량(VMP) ${exp.shown.vmp}/${exp.totals.vmp}`), note);
    const geo = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.react-flow__node button, .react-flow__node [role="img"]')];
      return els.map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), sw: e.scrollWidth - e.clientWidth, sh: e.scrollHeight - e.clientHeight, kids: [...e.children].every((c) => { const q = c.getBoundingClientRect(); return q.left >= r.left - 0.5 && q.right <= r.right + 0.5 && q.top >= r.top - 0.5 && q.bottom <= r.bottom + 0.5; }) }; });
    });
    ck('그래프: 모든 상자 132×34, 글자가 상자 밖으로 넘치지 않음', geo.length === exp.nodes - 6 && geo.every((g) => g.w === 132 && g.h === 34 && g.sw <= 0 && g.sh <= 0 && g.kids), { n: geo.length, bad: geo.filter((g) => !(g.w === 132 && g.h === 34 && g.sw <= 0 && g.sh <= 0 && g.kids)).slice(0, 3) });
    const vp0 = await page.locator('.react-flow__viewport').evaluate((e) => e.style.transform);
    ck('그래프: 시작은 100%', /scale\(1\)/.test(vp0), vp0);
    const zoomLabel = () => page.locator('[aria-label="그래프 크기와 위치"] span').innerText();
    ck('도구줄: 100% 표시', (await zoomLabel()) === '100%');
    await page.getByRole('button', { name: '확대' }).click(); await page.waitForTimeout(100);
    ck('확대(＋) → 120%', (await zoomLabel()) === '120%', await zoomLabel());
    await page.getByRole('button', { name: '축소' }).click(); await page.getByRole('button', { name: '축소' }).click(); await page.waitForTimeout(100);
    ck('축소(−) 두 번 → 83%', (await zoomLabel()) === '83%', await zoomLabel());
    await page.getByRole('button', { name: '가운데' }).click(); await page.waitForTimeout(100);
    ck('가운데 → 100%로 되돌림', (await zoomLabel()) === '100%' && (await page.locator('.react-flow__viewport').evaluate((e) => e.style.transform)) === vp0, await page.locator('.react-flow__viewport').evaluate((e) => e.style.transform));
    await page.getByRole('button', { name: '전체 보기' }).click(); await page.waitForTimeout(150);
    const inside = await page.evaluate(() => {
      const box = document.querySelector('[role="region"][aria-label*="관계 그래프"]').getBoundingClientRect();
      return [...document.querySelectorAll('.react-flow__node')].every((n) => { const r = n.getBoundingClientRect(); return r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1; });
    });
    ck('전체 보기: 모든 노드가 캔버스 안에 들어옴', inside && parseInt(await zoomLabel(), 10) < 100, await zoomLabel());
    await snap(page, 'g1_fit');
    // 전체 보기 상태에서 같은 세부군 성분(눌러서 이동) 클릭
    const sib = page.locator('.react-flow__node button[aria-label*="눌러서 이 성분으로 이동"]').first();
    const sibLabel = await sib.getAttribute('aria-label');
    await sib.click(); await page.waitForTimeout(400);
    const newTitle = await page.locator('#graph-title').innerText();
    ck('같은 세부군 성분 상자를 누르면 그 성분으로 이동(제목·주소 변경)', !newTitle.includes('오메프라졸 ·') || sibLabel.includes(newTitle.split(' · ')[0]), { sibLabel, newTitle, hash: await page.evaluate(() => location.hash) });
    ck('이동 뒤 서랍은 열리지 않고(데스크톱), 포커스는 선택한 성분 상자', (await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-vtm-node'))) === true);
    ck('이동 뒤 시작 화면(100%)으로 다시 그려짐', (await zoomLabel()) === '100%', await zoomLabel());
    await page.evaluate(() => { location.hash = 'v-7646'; }); await page.waitForTimeout(300);
    ck('주소를 바꾸면 따라감(hashchange, #v-7646)', (await page.locator('#graph-title').innerText()).includes('오메프라졸'));
    // ATC 상자 → 트리 거르기
    await page.getByRole('button', { name: '전체 보기' }).click(); await page.waitForTimeout(150);
    await page.locator('.react-flow__node button[aria-label^="ATC A02BC01"]').first().click(); await page.waitForTimeout(250);
    ck('ATC 상자를 누르면 왼쪽 트리가 그 코드로 걸러짐', (await page.locator('#tree-filter').inputValue()) === 'A02BC01', await page.locator('#tree-filter').inputValue());
    await page.fill('#tree-filter', '');
    // 끌어서 이동
    await page.getByRole('button', { name: '가운데' }).click(); await page.waitForTimeout(100);
    const before = await page.locator('.react-flow__viewport').evaluate((e) => e.style.transform);
    const box = await page.locator('.react-flow__pane').boundingBox();
    await page.mouse.move(box.x + 60, box.y + 60); await page.mouse.down(); await page.mouse.move(box.x + 20, box.y + 60, { steps: 6 }); await page.mouse.up();
    const after = await page.locator('.react-flow__viewport').evaluate((e) => e.style.transform);
    ck('끌어서 이동', before !== after, { before, after });
    // 휠: 그냥 휠은 화면 이동을 막지 않고, Ctrl+휠은 확대
    await page.getByRole('button', { name: '가운데' }).click(); await page.waitForTimeout(100);
    const c = await page.locator('.react-flow__pane').boundingBox();
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    const sc0 = await page.locator('#center').evaluate((e) => e.scrollTop);
    await page.mouse.wheel(0, 200); await page.waitForTimeout(150);
    ck('휠만 돌리면 그래프는 그대로(100%)이고 화면이 스크롤됨', (await zoomLabel()) === '100%' && (await page.locator('#center').evaluate((e) => e.scrollTop)) > sc0, { z: await zoomLabel(), sc: await page.locator('#center').evaluate((e) => e.scrollTop) });
    await page.locator('#center').evaluate((e) => { e.scrollTop = 0; });
    await page.keyboard.down('Control'); await page.mouse.wheel(0, -200); await page.keyboard.up('Control'); await page.waitForTimeout(200);
    ck('Ctrl+휠은 확대', parseInt(await zoomLabel(), 10) > 100, await zoomLabel());
    await page.getByRole('button', { name: '가운데' }).click();
    // 키보드
    await page.locator('[role="region"][aria-label*="관계 그래프"]').focus();
    const vpA = await page.locator('.react-flow__viewport').evaluate((e) => e.style.transform);
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(80);
    const vpB = await page.locator('.react-flow__viewport').evaluate((e) => e.style.transform);
    await page.keyboard.press('+'); await page.waitForTimeout(80);
    const z1 = await zoomLabel();
    await page.keyboard.press('0'); await page.waitForTimeout(80);
    ck('키보드: 방향키 이동 · + 확대 · 0 가운데', vpA !== vpB && parseInt(z1, 10) > 100 && (await zoomLabel()) === '100%', { vpA, vpB, z1 });
    noErr('그래프', page); await ctx.close();
  }

  /* ───── 4. 모든 성분의 그래프가 오류 없이 그려지는가 ───── */
  {
    const { ctx, page } = await open(browser, 1440, 1000, { hash: OME });
    await tabTo(page, '관계 그래프');
    const bad2 = [];
    for (const id of IDS) {
      const short = 'v-' + id.split(':').pop();
      await page.evaluate((s) => { location.hash = s; }, short);
      await page.waitForFunction((s) => location.hash === '#' + s, short);
      await page.waitForSelector('.react-flow__node');
      await page.waitForTimeout(60);
      const r = await page.evaluate((i) => { const m = new MedTermCore.MedTerm(MEDTERM_DATA, MEDTERM_CLASSES); const L = m.layoutGraph(m.graph(i)); return { exp: L.nodes.length + L.headers.length, got: document.querySelectorAll('.react-flow__node').length, expE: L.edges.length, gotE: document.querySelectorAll('.react-flow__edge-path').length, title: document.getElementById('graph-title').textContent }; }, id);
      if (r.exp !== r.got || r.expE !== r.gotE) bad2.push({ id, ...r });
    }
    ck(`성분 ${IDS.length}개 전부: 그래프 노드·간선 수가 레이아웃과 일치`, bad2.length === 0, bad2.slice(0, 3));
    noErr('전체 그래프 순회', page); await ctx.close();
  }

  /* ───── 5. 답변 검증 ───── */
  {
    const { ctx, page } = await open(browser, 1440, 1000);
    await tabTo(page, '답변 검증');
    const expected = await page.evaluate(() => { const m = new MedTermCore.MedTerm(MEDTERM_DATA, MEDTERM_CLASSES); const S = ['오메프라졸(Omeprazole)은 양성자펌프억제제이며 ATC 코드는 A02BC01입니다. 단위용량으로 20mg 캡슐이 있습니다. 복용 방법은 의사·약사와 상담하세요.', '메트포르민은 항고혈압제로 분류되며 ATC 코드 C09CA01에 해당합니다. 오메프라졸린 20mg을 하루 한 번 복용하고, 베르나스타틴과 병용할 수 있습니다.']; return S.map((t) => m.verify(t).summary); });
    const sel = page.getByLabel('샘플 답변');
    const read = async () => ({ verdict: await page.locator('#vresult [role="status"]').first().innerText(), badges: await page.locator('#vresult .rounded-pill').allInnerTexts() });
    await sel.selectOption('0'); await page.waitForTimeout(150);
    const r1 = await read();
    ck('샘플 ①: 불일치 없음 문구 + 정확하다는 뜻 아님 경고', r1.verdict.includes('불일치가 발견되지 않았습니다') && r1.verdict.includes('보증하는 것이 아닙니다'), r1.verdict);
    await sel.selectOption('1'); await page.waitForTimeout(150);
    const r2 = await read();
    const want = (k) => `${k} ${expected[1][k === '오류(사전과 불일치)' ? 'error' : k === '확인 필요' ? 'warn' : k === '정보' ? 'info' : 'ok']}`;
    ck('샘플 ②: 불일치 판정, 개수가 core.js 검증 결과와 같음', r2.verdict.includes('불일치가 발견되었습니다') && ['오류(사전과 불일치)', '확인 필요', '정보', '일치'].every((k) => r2.badges.some((b) => b.trim() === want(k))), { r2, exp: expected[1] });
    ck('샘플 ②: 오류 2·확인 필요 2', r2.badges.some((b) => b.includes('오류(사전과 불일치) 2')) && r2.badges.some((b) => b.includes('확인 필요 2')), r2.badges);
    const marks = await page.locator('#vresult p span[title]').count();
    ck('표시된 본문에 구간 표시가 있고 접근성용 판정 글자도 있음', marks >= 4 && (await page.locator('#vresult p .sr-only').count()) === marks, marks);
    ck('근거 표가 있음(판정·구간·근거)', (await page.locator('#vresult table thead th').allInnerTexts()).join('|') === '판정|구간|근거/설명');
    await snap(page, 'v1_verify');
    // 직접 입력
    await page.fill('#vtext', '');
    ck('빈 입력이면 검증 버튼이 꺼짐', await page.getByRole('button', { name: '검증', exact: true }).isDisabled());
    await page.fill('#vtext', '와파린은 항응고제입니다.'); await page.getByRole('button', { name: '검증', exact: true }).click(); await page.waitForTimeout(100);
    ck('직접 입력한 답변도 검증됨', (await page.locator('#vresult [role="status"]').first().innerText()).length > 10);
    // 모든 샘플이 오류 없이 돌아가는가
    for (let i = 0; i < 5; i++) { await sel.selectOption(String(i)); await page.waitForTimeout(60); }
    noErr('검증', page); await ctx.close();
  }

  /* ───── 6. 근거 기반 질의 · 데이터·한계 ───── */
  {
    const { ctx, page } = await open(browser, 1440, 1000);
    await tabTo(page, '근거 기반 질의');
    ck('질의: 처음에는 LLM 카드가 없음', (await page.locator('#rag-answer').count()) === 0);
    await page.getByRole('button', { name: '오메프라졸과 에스오메프라졸의 ATC 코드와 단위용량을 알려줘' }).click();
    await page.getByRole('button', { name: '사전에서 근거 찾기' }).click(); await page.waitForTimeout(150);
    const pre = await page.locator('#panel-rag pre').innerText();
    ck('질의: 프롬프트에 [system]/[user]와 사전 id', pre.startsWith('[system]') && pre.includes('[user]') && pre.includes('MT:VTM:7646'), pre.slice(0, 80));
    ck('질의: 검색된 사전 항목에 오메프라졸·에스오메프라졸', (await page.locator('#panel-rag ul button').allInnerTexts()).join(' ').includes('에스오메프라졸'));
    ck('질의(독립 실행): 프록시 URL 입력칸이 있음', (await page.locator('#proxy').count()) === 1);
    await page.getByRole('button', { name: '시연용 답변 넣기(오프라인 데모)' }).click();
    ck('시연용 안내가 보임', await page.locator('#mock-note').isVisible());
    await page.getByRole('button', { name: '이 답변 검증' }).click(); await page.waitForTimeout(100);
    ck('모의 답변 검증: 불일치 판정', (await page.locator('#rag-verify-out [role="status"]').innerText()).includes('불일치가 발견되었습니다'));
    await page.fill('#rag-answer', '직접 쓴 답변');
    ck('직접 입력하면 시연용 안내가 사라짐', (await page.locator('#mock-note').count()) === 0);
    await page.fill('#proxy', 'https://example.invalid/x'); await page.getByRole('button', { name: 'LLM 호출' }).click(); await page.waitForTimeout(400);
    ck('프록시 호출 실패는 화면에 안내(알림창 아님)', (await page.locator('#panel-rag [role="status"]').allInnerTexts()).join(' ').includes('호출 실패'));
    // 이 시험이 일부러 일으킨 실패 요청(example.invalid)만 제외하고, 그 밖의 외부 요청·오류는 계속 실패로 센다.
    ck('프록시 실패 시험이 남긴 외부 요청은 example.invalid 하나뿐', page.failedUrls.length >= 1 && page.failedUrls.every((u) => u.startsWith('https://example.invalid/')), page.failedUrls);
    page.failedUrls.length = 0; page.errs = page.errs.filter((e) => !/net::ERR_FAILED|example\.invalid/.test(e));
    await page.getByRole('button', { name: '프롬프트 복사' }).click(); await page.waitForTimeout(150);
    ck('프롬프트 복사 결과 안내(복사 또는 수동 안내)', (await page.locator('#panel-rag [role="status"]').allInnerTexts()).join(' ').match(/복사/) !== null);
    await snap(page, 'r1_rag');
    await tabTo(page, '데이터·한계');
    const about = await page.locator('#panel-about').innerText();
    ck('데이터·한계: 측정값(11/34·32%·CI 19–49%)·파일럿(2/8, p = 0.467)·한계 문구', ['11/34', '32%', '19–49%', '2/8', 'p = 0.467', '불일치 없음', '수록 성분 32개', '재배포'].every((s) => about.includes(s)), about.length);
    ck('데이터·한계: "정확도 100%" 같은 단정 표현 없음', !/100\s*%\s*(정확|에 가깝)/.test(about));
    await snap(page, 'a1_about');
    noErr('질의·데이터', page); await ctx.close();
  }

  /* ───── 7. 탭 키보드 ───── */
  {
    const { ctx, page } = await open(browser, 1440, 1000);
    await page.locator('#tab-search').focus();
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(80);
    ck('탭: → 키로 다음 탭 선택·포커스', (await page.locator('#tab-graph').getAttribute('aria-selected')) === 'true' && (await page.evaluate(() => document.activeElement.id)) === 'tab-graph');
    await page.keyboard.press('End'); await page.keyboard.press('Home'); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(80);
    ck('탭: Home/End/← 순환', (await page.locator('#tab-about').getAttribute('aria-selected')) === 'true');
    ck('탭: 선택된 탭만 Tab 순서에 들어감', (await page.locator('[role="tablist"][aria-label="작업 화면"] [tabindex="0"]').count()) === 1);
    ck('그래프 탭에서 선택이 없으면 안내', true);
    await ctx.close();
  }

  /* ───── 8. 딥링크 ───── */
  {
    for (const h of [OME, encodeURIComponent(OME), 'MT:VTM:999999999', '']) {
      const { ctx, page } = await open(browser, 1440, 1000, { hash: h });
      const t = await page.locator('#insp-title').innerText();
      const exp = h === OME || h === encodeURIComponent(OME);
      ck(`딥링크 #${h || '(없음)'}: ${exp ? '해당 성분이 선택됨' : '선택 없이 정상 표시'}`, exp ? t.includes('오메프라졸') : t === '상세 정보', t);
      noErr('딥링크', page); await ctx.close();
    }
  }

  /* ───── 9. 화면 폭별 가로 넘침 ───── */
  {
    const widths = [1440, 1280, 1100, 1099, 1024, 768, 700, 699, 390, 360];
    for (const w of widths) {
      const { ctx, page } = await open(browser, w, 900, { hash: OME });
      const res = {};
      for (const tab of ['사전 검색', '관계 그래프', '답변 검증', '근거 기반 질의', '데이터·한계']) {
        await tabTo(page, tab);
        if (tab === '사전 검색') { await page.fill('#q', '메트포르민'); await page.waitForTimeout(100); }
        if (tab === '답변 검증') { await page.getByLabel('샘플 답변').selectOption('1'); await page.waitForTimeout(100); }
        if (tab === '근거 기반 질의') { await page.fill('#rq', '오메프라졸과 에스오메프라졸의 ATC 코드'); await page.getByRole('button', { name: '사전에서 근거 찾기' }).click(); await page.getByRole('button', { name: '시연용 답변 넣기(오프라인 데모)' }).click(); await page.getByRole('button', { name: '이 답변 검증' }).click(); await page.waitForTimeout(100); }
        if (tab === '관계 그래프') await page.waitForSelector('.react-flow__node');
        const o = await overflow(page); res[tab] = o;
        if (w === 390 || w === 1024) await snap(page, `w${w}_${tab.replace(/[^가-힣a-z]/g, '')}`);
      }
      const worst = Math.max(...Object.values(res).flatMap((o) => [o.doc, o.center]));
      ck(`폭 ${w}: 모든 탭에서 가로 넘침 없음`, worst <= 0, worst > 0 ? res : undefined);
      noErr(`폭 ${w}`, page); await ctx.close();
    }
  }

  /* ───── 10. 서랍: 1024(상세) ───── */
  {
    const { ctx, page } = await open(browser, 1024, 768);
    const vis = () => page.evaluate(() => getComputedStyle(document.getElementById('inspector')).visibility);
    ck('1024: 상세 서랍은 처음에 숨김', (await vis()) === 'hidden');
    await page.locator('#tree > ul > li > button').first().click();
    await page.getByRole('button', { name: /^A02/ }).first().click().catch(() => {});
    // 트리에서 성분 찾기
    await page.fill('#tree-filter', 'a02bc'); await page.waitForTimeout(100);
    const leaf = page.locator('#tree [data-id="' + OME + '"]');
    await leaf.click(); await page.waitForTimeout(350);
    ck('1024: 성분을 고르면 오른쪽 서랍이 열림', (await vis()) === 'visible' && (await page.locator('#inspector').getAttribute('data-open')) === 'true');
    ck('1024: 서랍이 열리면 포커스가 닫기 버튼으로', (await page.evaluate(() => document.activeElement.getAttribute('aria-label'))) === '상세 닫기');
    ck('1024: 서랍 뒤 화면은 inert(키보드·스크린리더 차단)', (await page.locator('#center').getAttribute('inert')) !== null && (await page.locator('#left').getAttribute('inert')) !== null);
    ck('1024: 배경막이 보임', await page.locator('div.bg-scrim').isVisible());
    await snap(page, 'dr_1024_open');
    await page.keyboard.press('Escape'); await page.waitForTimeout(350);
    ck('1024: Esc로 닫히고 포커스가 눌렀던 성분 항목으로 돌아감', (await vis()) === 'hidden' && (await page.evaluate(() => document.activeElement.getAttribute('data-id'))) === OME, await page.evaluate(() => document.activeElement.outerHTML.slice(0, 80)));
    await leaf.click(); await page.waitForTimeout(300);
    await page.getByRole('button', { name: '상세 닫기' }).click(); await page.waitForTimeout(300);
    ck('1024: 닫기 버튼으로 닫힘', (await vis()) === 'hidden');
    await leaf.click(); await page.waitForTimeout(300);
    await page.mouse.click(200, 400); await page.waitForTimeout(300);
    ck('1024: 배경막을 눌러 닫힘', (await vis()) === 'hidden');
    await leaf.click(); await page.waitForTimeout(300);
    await page.setViewportSize({ width: 1280, height: 768 }); await page.waitForTimeout(300);
    ck('1280으로 넓히면 서랍 상태가 풀리고 상세가 3단으로 보임', (await vis()) === 'visible' && (await page.locator('#center').getAttribute('inert')) === null && !(await page.locator('div.bg-scrim').isVisible()));
    ck('검색 입력 중(자동 선택)에는 서랍이 열리지 않음', await (async () => { await page.setViewportSize({ width: 1024, height: 768 }); await page.waitForTimeout(250); await page.fill('#q', '오메프라졸'); await page.waitForTimeout(250); return (await vis()) === 'hidden'; })());
    noErr('1024 서랍', page); await ctx.close();
  }

  /* ───── 11. 서랍: 390 휴대폰(트리+상세) ───── */
  {
    const { ctx, page } = await open(browser, 390, 844, { hash: OME, touch: true, mobile: true, dpr: 2 });
    const leftVis = () => page.evaluate(() => getComputedStyle(document.getElementById('left')).visibility);
    const inspVis = () => page.evaluate(() => getComputedStyle(document.getElementById('inspector')).visibility);
    ck('390: 분류 트리·상세는 처음에 숨김, 햄버거 버튼 표시', (await leftVis()) === 'hidden' && (await inspVis()) === 'hidden' && (await page.locator('#nav-toggle').isVisible()));
    await snap(page, 'm_home');
    await page.locator('#nav-toggle').tap(); await page.waitForTimeout(350);
    ck('390: 버튼으로 트리 서랍이 열림(aria-expanded, 포커스)', (await leftVis()) === 'visible' && (await page.locator('#nav-toggle').getAttribute('aria-expanded')) === 'true' && (await page.evaluate(() => document.activeElement.id)) === 'left');
    await snap(page, 'm_tree');
    ck('390: 트리 서랍이 열리면 뒤 화면은 inert', (await page.locator('#center').getAttribute('inert')) !== null);
    await page.keyboard.press('Escape'); await page.waitForTimeout(350);
    ck('390: Esc로 닫히고 포커스는 햄버거 버튼', (await leftVis()) === 'hidden' && (await page.evaluate(() => document.activeElement.id)) === 'nav-toggle');
    await page.locator('#nav-toggle').tap(); await page.waitForTimeout(350);
    await page.fill('#tree-filter', 'a02bc'); await page.waitForTimeout(150);
    await page.locator('#tree [data-id="' + OME + '"]').tap(); await page.waitForTimeout(450);
    ck('390: 성분을 고르면 트리가 닫히고 상세 서랍이 열림', (await leftVis()) === 'hidden' && (await inspVis()) === 'visible');
    await snap(page, 'm_inspector');
    await page.getByRole('button', { name: '상세 닫기' }).tap(); await page.waitForTimeout(350);
    ck('390: 상세를 닫으면 포커스가 햄버거 버튼으로(연 곳)', (await inspVis()) === 'hidden' && (await page.evaluate(() => document.activeElement.id)) === 'nav-toggle', await page.evaluate(() => document.activeElement.outerHTML.slice(0, 80)));
    // 그래프: ATC 상자 → 트리 서랍
    await page.getByRole('tab', { name: '관계 그래프' }).tap(); await page.waitForSelector('.react-flow__node'); await page.waitForTimeout(200);
    await snap(page, 'm_graph');
    const canvas = await page.locator('[role="region"][aria-label*="관계 그래프"]').boundingBox();
    ck('390: 그래프 칸이 화면 폭 안(좌우 16px 여백 이상)', canvas.x >= 15 && canvas.x + canvas.width <= 390 - 15, canvas);
    await page.getByRole('button', { name: '전체 보기' }).tap(); await page.waitForTimeout(200);
    await page.locator('.react-flow__node button[aria-label^="ATC A02BC01"]').first().tap(); await page.waitForTimeout(450);
    ck('390: 그래프에서 ATC 상자를 누르면 트리 서랍이 열리고 걸러짐', (await leftVis()) === 'visible' && (await page.locator('#tree-filter').inputValue()) === 'A02BC01');
    // 터치 끌기(가로)로 그래프 이동
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.getByRole('button', { name: '가운데' }).tap(); await page.waitForTimeout(150);
    const cdp = await ctx.newCDPSession(page);
    const pane = await page.locator('.react-flow__pane').boundingBox();
    const t0 = await page.locator('.react-flow__viewport').evaluate((e) => e.style.transform);
    const y = Math.round(pane.y + 120), x0 = Math.round(pane.x + 250);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - i * 20, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
    const t1 = await page.locator('.react-flow__viewport').evaluate((e) => e.style.transform);
    ck('390: 터치로 가로로 끌면 그래프가 이동', t0 !== t1, { t0, t1 });
    // 세로로 쓸기는 페이지 스크롤(그래프 이동 아님)
    const s0 = await page.locator('#center').evaluate((e) => e.scrollTop);
    const t2 = await page.locator('.react-flow__viewport').evaluate((e) => e.style.transform);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y + 200 }] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0, y: y + 200 - i * 20 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    const s1 = await page.locator('#center').evaluate((e) => e.scrollTop);
    const t3 = await page.locator('.react-flow__viewport').evaluate((e) => e.style.transform);
    ck('390: 세로로 쓸면 화면이 스크롤되고 그래프는 그대로(스크롤 갇힘 없음)', s1 > s0 && t2 === t3, { s0, s1, t2, t3 });
    noErr('390', page); await ctx.close();
  }

  /* ───── 12. 다크 ───── */
  {
    const { ctx, page } = await open(browser, 1440, 1000, { scheme: 'dark', hash: OME });
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ck('다크: 바탕색이 토큰(tokens.json 의 bg 다크 값)', bg === rgb('bg', 'dark'), { got: bg, want: rgb('bg', 'dark') });
    const inkDark = await page.evaluate(() => getComputedStyle(document.body).color);
    ck('다크: 본문 글씨색이 토큰(ink 다크 값)', inkDark === rgb('ink', 'dark'), { got: inkDark, want: rgb('ink', 'dark') });
    await snap(page, 'k_search');
    await tabTo(page, '관계 그래프'); await page.waitForSelector('.react-flow__node'); await snap(page, 'k_graph');
    await tabTo(page, '답변 검증'); await page.getByLabel('샘플 답변').selectOption('1'); await page.waitForTimeout(150); await snap(page, 'k_verify');
    noErr('다크', page); await ctx.close();
  }

  /* ───── 13. 글꼴·색(MediNote 디자인): 글꼴 4종이 실제로 불려 왔고, 글씨색·바탕색이 토큰과 같다 ───── */
  {
    const { ctx, page } = await open(browser, 1440, 900, { hash: OME });
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '') + ' ' + f.weight));
    for (const [fam, w] of FACES) ck(`글꼴: ${fam} ${w} 이(가) 화면 안에서 읽힘(외부 요청 없이)`, loaded.includes(fam + ' ' + w), loaded);
    const st = await page.evaluate(() => {
      const cs = (e) => getComputedStyle(e);
      const sel = document.querySelector('#tab-search'); // 가운데 작업 탭(왼쪽 트리의 분류 방식 탭과 구분)
      return {
        body: cs(document.body).fontFamily, bodyBg: cs(document.body).backgroundColor, bodyInk: cs(document.body).color, h1: cs(document.querySelector('h1')).fontFamily,
        selColor: cs(sel).color, selBg: cs(sel).backgroundColor, selWeight: cs(sel).fontWeight, bodySize: cs(document.body).fontSize,
        card: (() => { const c = document.querySelector('#panel-search > div'); return { bg: cs(c).backgroundColor, r: cs(c).borderTopLeftRadius }; })(),
      };
    });
    ck('글꼴: 본문은 Pretendard, 로고 글씨(h1)는 Gaegu → Pretendard 순', /^"?Pretendard"?,/.test(st.body) && /^"?Gaegu"?,\s*"?Pretendard"?/.test(st.h1), { body: st.body, h1: st.h1 });
    ck('색: 라이트 바탕·본문 글씨색이 토큰(bg·ink)', st.bodyBg === rgb('bg') && st.bodyInk === rgb('ink'), { bg: st.bodyBg, ink: st.bodyInk });
    ck('색: 켜진 탭은 브랜드 글씨(pri) + 옅은 틸 바탕(pri-soft) + 굵게 700', st.selColor === rgb('pri') && st.selBg === rgb('pri-soft') && st.selWeight === '700', { color: st.selColor, bg: st.selBg, w: st.selWeight });
    ck('모양: 카드는 흰 바탕(surface) · 모서리 20px(메디노트 --r-lg)', st.card.bg === rgb('surface') && st.card.r === '20px', st.card);
    ck('크기: 본문 글자 0.9375rem = 15px(메디노트 --fs-sub), 브라우저 글자 크기 설정을 따름', st.bodySize === '15px', st.bodySize);
    noErr('글꼴·색', page); await ctx.close();
  }

  await browser.close();
  console.log(`\n${total}개 중 ${total - bad}개 통과` + (bad ? `, ${bad}개 실패` : ' — 모두 통과'));
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
