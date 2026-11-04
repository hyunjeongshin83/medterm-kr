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
const { DISC, VERSION, OLD_LABEL } = require('./_copy.cjs');

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
    await page.getByRole('button', { name: '예시 답변 넣기(오류 포함)' }).click();
    ck('예시 답변 안내가 보임', await page.locator('#mock-note').isVisible());
    await page.getByRole('button', { name: '이 답변 검증' }).click(); await page.waitForTimeout(100);
    ck('예시 답변 검증: 불일치 판정', (await page.locator('#rag-verify-out [role="status"]').innerText()).includes('불일치가 발견되었습니다'));
    await page.fill('#rag-answer', '직접 쓴 답변');
    ck('직접 입력하면 예시 답변 안내가 사라짐', (await page.locator('#mock-note').count()) === 0);
    await page.fill('#proxy', 'https://example.invalid/x'); await page.getByRole('button', { name: 'LLM 호출' }).click(); await page.waitForTimeout(400);
    ck('프록시 호출 실패는 화면에 안내(알림창 아님)', (await page.locator('#panel-rag [role="status"]').allInnerTexts()).join(' ').includes('호출 실패'));
    // 이 시험이 일부러 일으킨 실패 요청(example.invalid)만 제외하고, 그 밖의 외부 요청·오류는 계속 실패로 센다.
    ck('프록시 실패 시험이 남긴 외부 요청은 example.invalid 하나뿐', page.failedUrls.length >= 1 && page.failedUrls.every((u) => u.startsWith('https://example.invalid/')), page.failedUrls);
    page.failedUrls.length = 0; page.errs = page.errs.filter((e) => !/net::ERR_FAILED|example\.invalid/.test(e));
    await page.getByRole('button', { name: '질의문 복사' }).click(); await page.waitForTimeout(150);
    ck('질의문 복사 결과 안내(복사 또는 수동 안내)', (await page.locator('#panel-rag [role="status"]').allInnerTexts()).join(' ').match(/복사/) !== null);
    await snap(page, 'r1_rag');
    await tabTo(page, '데이터·한계');
    const about = await page.locator('#panel-about').innerText();
    ck('데이터·한계: 측정값(11/34·32%·CI 19–49%)·파일럿(2/8, p = 0.467)·한계 문구', ['11/34', '32%', '19–49%', '2/8', 'p = 0.467', '불일치 없음', '수록 성분 32개', '재배포'].every((s) => about.includes(s)), about.length);
    ck('데이터·한계: 한계 목록에 "질의문과 LLM 답변은 리서치용" 문구', about.includes('질의문과 LLM 답변은 리서치용입니다'));
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
        if (tab === '근거 기반 질의') { await page.fill('#rq', '오메프라졸과 에스오메프라졸의 ATC 코드'); await page.getByRole('button', { name: '사전에서 근거 찾기' }).click(); await page.getByRole('button', { name: '예시 답변 넣기(오류 포함)' }).click(); await page.getByRole('button', { name: '이 답변 검증' }).click(); await page.waitForTimeout(100); }
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
        card: (() => { const c = document.querySelector('#panel-verify [data-card]'); return { bg: cs(c).backgroundColor, r: cs(c).borderTopLeftRadius }; })(),
        hero: (() => { const c = document.getElementById('hero-title').closest('section'); return { bg: cs(c).backgroundColor, r: cs(c).borderTopLeftRadius }; })(),
      };
    });
    ck('글꼴: 본문은 Pretendard, 로고 글씨(h1)는 Gaegu → Pretendard 순', /^"?Pretendard"?,/.test(st.body) && /^"?Gaegu"?,\s*"?Pretendard"?/.test(st.h1), { body: st.body, h1: st.h1 });
    ck('색: 라이트 바탕·본문 글씨색이 토큰(bg·ink)', st.bodyBg === rgb('bg') && st.bodyInk === rgb('ink'), { bg: st.bodyBg, ink: st.bodyInk });
    ck('색: 켜진 탭은 브랜드 글씨(pri) + 옅은 틸 바탕(pri-soft) + 굵게 700', st.selColor === rgb('pri') && st.selBg === rgb('pri-soft') && st.selWeight === '700', { color: st.selColor, bg: st.selBg, w: st.selWeight });
    ck('모양: 카드는 흰 바탕(surface) · 모서리 20px(메디노트 --r-lg)', st.card.bg === rgb('surface') && st.card.r === '20px', st.card);
    ck('모양: 검색 히어로는 옅은 틸 바탕(pri-soft) · 모서리 20px', st.hero.bg === rgb('pri-soft') && st.hero.r === '20px', st.hero);
    ck('크기: 본문 글자 0.9375rem = 15px(메디노트 --fs-sub), 브라우저 글자 크기 설정을 따름', st.bodySize === '15px', st.bodySize);
    noErr('글꼴·색', page); await ctx.close();
  }


  /* ───── 14. 반응형 화면 구성(템플릿식: 히어로 검색 · 분류 칩 · 카드 · 큰 버튼 · 하단 탭 · 아래서 올라오는 상세) ───── */
  const rect = (page, sel) => page.evaluate((q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) }; }, sel);
  const cols = (page) => page.evaluate(() => new Set([...document.querySelectorAll('#panel-search ul.feed-grid > li')].map((e) => Math.round(e.getBoundingClientRect().left))).size);
  const nCards = (page) => page.locator('#panel-search ul.feed-grid > li').count();
  // 보이는 탭 화면에서 글자가 name 인 버튼이 자기 카드의 안쪽 폭을 가득 채우는지(휴대폰) + 높이
  const btnFill = (page, name) => page.evaluate((n) => {
    const b = [...document.querySelectorAll('[role="tabpanel"]:not([hidden]) button')].find((e) => e.innerText.trim() === n);
    if (!b) return null;
    const c = b.closest('[data-card]'); const cs = getComputedStyle(c);
    const inner = c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const r = b.getBoundingClientRect();
    return { w: Math.round(r.width), inner: Math.round(inner), h: Math.round(r.height) };
  }, name);
  const TAB_NAMES = ['사전 검색', '관계 그래프', '답변 검증', '근거 기반 질의', '데이터·한계'];
  const expGroups = (page) => page.evaluate(() => {
    const m = new MedTermCore.MedTerm(MEDTERM_DATA, MEDTERM_CLASSES);
    const g = {};
    for (const v of m.vtms) for (const L of new Set((v.atc_codes || []).map((c) => c[0]))) g[L] = (g[L] || 0) + 1;
    return g;
  });

  // 14-1. 휴대폰 390×844 (터치)
  {
    const { ctx, page } = await open(browser, 390, 844, { touch: true, mobile: true, dpr: 2 });
    const bar = await rect(page, '[role="tablist"][aria-label="작업 화면"]');
    ck('휴대폰: 작업 탭이 화면 맨 아래 막대(하단 탭)로 붙고, 바깥틀 폭 전체·높이 56px 이상', (await page.locator('[role="tablist"][aria-label="작업 화면"]').getAttribute('data-variant')) === 'bottom' && bar && bar.b === 844 && bar.x === 0 && bar.w === 390 && bar.h >= 56, bar);
    ck('휴대폰: 상단(본문 안) 탭 줄은 없음', (await page.locator('#center [role="tablist"]').count()) === 0);
    const tabBoxes = await page.evaluate(() => [...document.querySelectorAll('[data-variant="bottom"] [role="tab"]')].map((e) => { const r = e.getBoundingClientRect(); return { n: e.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height), t: e.innerText.trim() }; }));
    ck('휴대폰: 하단 탭 5개 모두 44×44 이상, 접근 가능한 이름은 긴 이름 그대로(짧은 글자는 눈에 보이는 글자)', tabBoxes.length === 5 && tabBoxes.every((t) => t.w >= 44 && t.h >= 44) && JSON.stringify(tabBoxes.map((t) => t.n)) === JSON.stringify(TAB_NAMES), tabBoxes);
    let named = 0; for (const n of TAB_NAMES) named += await page.getByRole('tab', { name: n, exact: true }).count();
    ck('휴대폰: 이름으로 탭을 찾으면 정확히 하나씩(중복 탭 없음)', named === 5, named);
    ck('휴대폰: 검색 입력 높이 48px 이상 · 입력 칸이 히어로 안에 있음', (await rect(page, '#q')).h >= 48 && (await page.evaluate(() => !!document.getElementById('q').closest('section[aria-labelledby="hero-title"]'))));
    // 분류 칩
    const exp = await expGroups(page);
    const chips = await page.evaluate(() => [...document.querySelectorAll('.chip-row > button')].map((e) => { const r = e.getBoundingClientRect(); return { t: e.innerText.replace(/\s+/g, ' ').trim(), h: Math.round(r.height), on: e.getAttribute('aria-pressed') }; }));
    ck('분류 칩: 전체 + 사전에 있는 대분류마다 하나, 칩 안의 숫자가 사전의 성분 수와 같음', chips.length === 1 + Object.keys(exp).length && chips[0].t === `전체 ${IDS.length}` && chips.slice(1).every((c) => { const L = c.t[0]; return Number(c.t.split(' ').pop()) === exp[L]; }), { chips: chips.map((c) => c.t), exp });
    ck('분류 칩: 모두 44px 이상, 처음에는 "전체"만 눌림', chips.every((c) => c.h >= 44) && chips[0].on === 'true' && chips.slice(1).every((c) => c.on === 'false'), chips.map((c) => c.h));
    const rowScroll = await page.evaluate(() => { const e = document.querySelector('.chip-row'); return { sw: e.scrollWidth, cw: e.clientWidth, ox: getComputedStyle(e).overflowX, wrap: getComputedStyle(e).flexWrap }; });
    ck('분류 칩: 휴대폰에서는 한 줄로 옆으로 밀어 봄(줄 안에서만 스크롤, 문서는 넘치지 않음)', rowScroll.ox === 'auto' && rowScroll.wrap === 'nowrap' && rowScroll.sw > rowScroll.cw && (await overflow(page)).doc === 0, rowScroll);
    // 카드 목록
    ck('목록: 검색어가 없으면 수록 성분을 12개씩(더 보기) 보여 줌, 1열', (await nCards(page)) === 12 && (await cols(page)) === 1);
    const card1 = await rect(page, '#panel-search ul.feed-grid > li:first-child button');
    ck('카드: 높이 72px 이상(손가락 기준), 폭은 바깥틀 안쪽 가득', card1.h >= 72 && card1.x >= 15 && card1.r <= 375 && card1.w >= 340, card1);
    ck('카드: 사진 자리(썸네일) 그림이 있고 화면 읽기 프로그램에는 숨김', (await page.locator('#panel-search ul.feed-grid > li:first-child [aria-hidden="true"] svg').count()) === 1);
    const names = await page.locator('#panel-search ul.feed-grid > li b').allInnerTexts();
    ck('목록: 처음 12개가 가나다순', JSON.stringify(names) === JSON.stringify([...names].sort((a, b) => a.localeCompare(b, 'ko'))), names);
    const more = page.getByRole('button', { name: /^더 보기/ });
    const moreBox = await more.boundingBox();
    ck('더 보기 버튼: "(20)" 개수 표시, 48px 이상, 휴대폰에서는 폭 가득', (await more.innerText()).includes('(20)') && moreBox.height >= 48 && moreBox.width >= 340, moreBox);
    await more.tap(); await page.waitForTimeout(150);
    ck('더 보기를 누르면 12개 더(24개), 버튼은 "(8)"', (await nCards(page)) === 24 && (await more.innerText()).includes('(8)'));
    await more.tap(); await page.waitForTimeout(150);
    ck('한 번 더 누르면 32개 전부, 더 보기 버튼이 사라짐', (await nCards(page)) === 32 && (await page.getByRole('button', { name: /^더 보기/ }).count()) === 0);
    // 분류 칩으로 거르기
    const cChip = page.locator('.chip-row > button', { hasText: /^C / });
    await cChip.tap(); await page.waitForTimeout(150);
    ck('"C 심혈관" 칩: 눌림 표시, 목록이 그 분류 성분만(개수가 사전과 같음), 제목에도 개수', (await cChip.getAttribute('aria-pressed')) === 'true' && (await nCards(page)) === exp.C && (await page.locator('#list-title').innerText()).includes(String(exp.C)), { cards: await nCards(page), exp: exp.C });
    await cChip.tap(); await page.waitForTimeout(150);
    ck('같은 칩을 다시 누르면 풀려서 전체로 돌아감(12개 · 전체 눌림)', (await cChip.getAttribute('aria-pressed')) === 'false' && (await nCards(page)) === 12 && (await page.locator('.chip-row > button').first().getAttribute('aria-pressed')) === 'true');
    // 검색 + 지우기
    await page.fill('#q', '오메프라졸'); await page.waitForTimeout(250);
    ck('검색: 결과 카드에 일치한 이유(배지)가 붙고 정확히 일치한 성분이 선택됨(시트는 열리지 않음)', (await page.locator('#panel-search ul.feed-grid > li').first().innerText()).includes('오메프라졸') && (await page.evaluate(() => location.hash)) === '#v-7646' && (await page.evaluate(() => getComputedStyle(document.getElementById('inspector')).visibility)) === 'hidden');
    const clearBtn = page.getByRole('button', { name: '검색어 지우기' });
    const clearBox = await clearBtn.boundingBox();
    ck('입력 칸의 지우기 버튼: 44px 이상', clearBox.width >= 44 && clearBox.height >= 44, clearBox);
    await clearBtn.tap(); await page.waitForTimeout(200);
    ck('지우기: 입력이 비고 포커스가 입력 칸으로, 목록은 수록 성분으로 돌아감', (await page.inputValue('#q')) === '' && (await page.evaluate(() => document.activeElement.id)) === 'q' && (await page.locator('#list-title').innerText()).includes('수록 성분') && (await page.getByRole('button', { name: '검색어 지우기' }).count()) === 0);
    // 분류 + 검색어: 결과 없음 안내
    await page.fill('#q', '오메프라졸'); await page.waitForTimeout(150);
    await page.locator('.chip-row > button', { hasText: /^C / }).tap(); await page.waitForTimeout(150);
    ck('검색 결과가 다른 분류에만 있으면 "이 분류에는 검색 결과가 없습니다" 안내', (await page.locator('#panel-search').innerText()).includes('이 분류에는 검색 결과가 없습니다') && (await nCards(page)) === 0);
    await page.locator('.chip-row > button').first().tap(); await page.fill('#q', ''); await page.waitForTimeout(150);
    // 카드 → 아래에서 올라오는 시트
    await page.locator('#panel-search ul.feed-grid > li:first-child button').tap(); await page.waitForTimeout(450);
    const sh = await rect(page, '#inspector');
    const shCss = await page.evaluate(() => { const c = getComputedStyle(document.getElementById('inspector')); return { pos: c.position, tl: c.borderTopLeftRadius, tr: c.borderTopRightRadius, bl: c.borderBottomLeftRadius, vis: c.visibility, role: document.getElementById('inspector').getAttribute('role') }; });
    ck('휴대폰: 카드를 누르면 상세가 화면 아래에 붙어 올라오는 시트(바닥 = 화면 아래, 폭 가득, 위 모서리 20px)', shCss.pos === 'fixed' && shCss.vis === 'visible' && shCss.role === 'dialog' && sh.b === 844 && sh.x === 0 && sh.w === 390 && shCss.tl === '20px' && shCss.tr === '20px' && shCss.bl === '0px', { sh, shCss });
    ck('휴대폰: 시트는 화면 높이의 88%를 넘지 않고(위쪽 면책 띠가 일부 보임), 안쪽 내용만 스크롤', sh.h <= Math.ceil(844 * 0.88) + 1 && sh.y >= 844 * 0.12 - 1 && (await page.evaluate(() => { const d = document.getElementById('detail'); return getComputedStyle(d).overflowY === 'auto'; })), sh);
    ck('시트에 손잡이(장식, 화면 읽기에서는 숨김)와 닫기 버튼(44px 이상)이 있음', (await page.locator('#inspector > div[aria-hidden="true"]').first().isVisible()) && (await rect(page, '#inspector button[aria-label="상세 닫기"]')).h >= 44);
    const cta = await rect(page, '#inspector > div:last-child button');
    ck('시트 아래 고정 줄: 주된 버튼 "관계 그래프 보기"(48px 이상, 폭 가득)가 스크롤과 상관없이 보임', (await page.getByRole('button', { name: /관계 그래프 보기/ }).isVisible()) && cta.h >= 48 && cta.w >= 340 && cta.b <= 844, cta);
    ck('상세 머리에 사진 자리(큰 썸네일)와 이름이 있고, ATC 경로는 들여쓴 목록', (await page.locator('#detail h3').first().innerText()).length > 0 && (await page.locator('#detail [aria-hidden="true"] svg').count()) >= 1 && (await page.locator('#detail ol li').count()) >= 2);
    await page.keyboard.press('Escape'); await page.waitForTimeout(450);
    ck('휴대폰: 시트를 Esc로 닫으면 포커스가 눌렀던 카드로 돌아감', (await page.evaluate(() => getComputedStyle(document.getElementById('inspector')).visibility)) === 'hidden' && (await page.evaluate(() => document.activeElement.getAttribute('aria-current'))) === 'true', await page.evaluate(() => document.activeElement.outerHTML.slice(0, 90)));
    await page.locator('#panel-search ul.feed-grid > li:first-child button').tap(); await page.waitForTimeout(450);
    const title0 = await page.locator('#detail h3').first().innerText();
    await page.getByRole('button', { name: /관계 그래프 보기/ }).tap(); await page.waitForTimeout(700);
    ck('"관계 그래프 보기": 시트가 닫히고 관계 그래프 탭이 열려 같은 성분의 그래프가 보임, 포커스는 그래프 탭', (await page.evaluate(() => getComputedStyle(document.getElementById('inspector')).visibility)) === 'hidden' && (await page.locator('#tab-graph').getAttribute('aria-selected')) === 'true' && (await page.locator('#graph-title').innerText()).includes(title0.split('\n')[0].trim()) && (await page.evaluate(() => document.activeElement.id)) === 'tab-graph', { title0, g: await page.locator('#graph-title').innerText(), active: await page.evaluate(() => document.activeElement.id) });
    ck('이미 관계 그래프 탭이면 시트 아래의 "관계 그래프 보기" 버튼은 숨김(할 일 없는 버튼 없음)', (await page.getByRole('button', { name: /관계 그래프 보기/ }).count()) === 0);
    // 다른 탭의 큰 버튼
    await tabTo(page, '답변 검증');
    const vb = await btnFill(page, '검증');
    ck('답변 검증: 검증 버튼이 휴대폰에서는 카드 안쪽 폭을 가득 채우고 높이 44px 이상', vb && vb.w >= vb.inner - 1 && vb.w >= 300 && vb.h >= 44, vb);
    await tabTo(page, '근거 기반 질의');
    const rb = await btnFill(page, '사전에서 근거 찾기');
    ck('근거 기반 질의: 주된 버튼이 휴대폰에서는 카드 안쪽 폭을 가득 채우고 높이 44px 이상', rb && rb.w >= rb.inner - 1 && rb.w >= 300 && rb.h >= 44, rb);
    ck('모든 탭에서 가로 넘침 없음(문서·가운데)', await (async () => { for (const t of TAB_NAMES) { await tabTo(page, t); const o = await overflow(page); if (o.doc > 0 || o.center > 0) return false; } return true; })());
    await snap(page, 'r_phone_final');
    noErr('반응형 휴대폰', page); await ctx.close();
  }

  // 14-2. 태블릿 768×1024 · 노트북 1024×768 · 데스크톱 1440×900 · 와이드 1920×1080
  for (const [w, h, wantCols, label] of [[768, 1024, 1, '태블릿 768'], [1024, 768, 2, '노트북 1024'], [1440, 900, 2, '데스크톱 1440'], [1920, 1080, 3, '와이드 1920']]) {
    const { ctx, page } = await open(browser, w, h, { dpr: 1 });
    ck(`${label}: 작업 탭은 본문 위 알약 탭 줄(하단 탭 아님), 아래 막대 없음`, (await page.locator('#center [role="tablist"][data-variant="top"]').count()) === 1 && (await page.locator('[data-variant="bottom"]').count()) === 0);
    ck(`${label}: "분류" 앱 막대 버튼은 없음(휴대폰 전용)`, !(await page.locator('#nav-toggle').isVisible()));
    ck(`${label}: 카드 목록이 ${wantCols}열`, (await cols(page)) === wantCols, await cols(page));
    if (wantCols > 1) {
      const rowsH = await page.evaluate(() => {
        const rows = new Map();
        for (const b of document.querySelectorAll('#panel-search ul.feed-grid > li > button')) { const r = b.getBoundingClientRect(); const k = Math.round(r.top); rows.set(k, [...(rows.get(k) || []), Math.round(r.height)]); }
        return [...rows.values()].filter((a) => a.length > 1);
      });
      ck(`${label}: 같은 줄의 카드는 높이가 같음(줄이 들쭉날쭉하지 않음)`, rowsH.length > 0 && rowsH.every((a) => Math.max(...a) - Math.min(...a) <= 1), rowsH.slice(0, 4));
    }
    const widthRule = await page.evaluate(() => { const c = document.getElementById('panel-search').parentElement; const r = c.getBoundingClientRect(); const m = document.getElementById('center').getBoundingClientRect(); return { w: Math.round(r.width), left: Math.round(r.left - m.left), right: Math.round(m.right - r.right) }; });
    ck(`${label}: 본문은 960px(60rem)을 넘지 않고, 넓으면 가운데 정렬`, widthRule.w <= 960 && (w < 1700 || Math.abs(widthRule.left - widthRule.right) <= 12), widthRule);
    ck(`${label}: 분류 칩은 줄바꿈(옆 스크롤 없음)`, await page.evaluate(() => { const e = document.querySelector('.chip-row'); return getComputedStyle(e).flexWrap === 'wrap' && e.scrollWidth <= e.clientWidth + 1; }));
    if (w >= 1100) {
      const L = await rect(page, '#left'), C = await rect(page, '#center'), R = await rect(page, '#inspector');
      ck(`${label}: 3단 배치(왼쪽 300 · 가운데 · 오른쪽 380)`, L.w === 300 && R.w === 380 && C.w === w - 680, { L: L.w, C: C.w, R: R.w });
      await page.fill('#q', '오메프라졸'); await page.waitForTimeout(250);
      ck(`${label}: 상세 단 아래에 "관계 그래프 보기" 버튼이 늘 보임`, await page.getByRole('button', { name: /관계 그래프 보기/ }).isVisible());
      await page.getByRole('button', { name: /관계 그래프 보기/ }).click(); await page.waitForTimeout(500);
      ck(`${label}: 그 버튼을 누르면 관계 그래프 탭으로(같은 성분), 포커스는 그래프 탭`, (await page.locator('#tab-graph').getAttribute('aria-selected')) === 'true' && (await page.locator('#graph-title').innerText()).includes('오메프라졸') && (await page.evaluate(() => document.activeElement.id)) === 'tab-graph');
    } else {
      ck(`${label}: 왼쪽 트리는 보이고 상세는 서랍(처음엔 숨김)`, (await page.evaluate(() => getComputedStyle(document.getElementById('left')).visibility)) === 'visible' && (await page.evaluate(() => getComputedStyle(document.getElementById('inspector')).visibility)) === 'hidden');
      await page.locator('#panel-search ul.feed-grid > li:first-child button').click(); await page.waitForTimeout(450);
      const dr = await rect(page, '#inspector');
      const drCss = await page.evaluate(() => { const c = getComputedStyle(document.getElementById('inspector')); return { tl: c.borderTopLeftRadius, vis: c.visibility }; });
      ck(`${label}: 카드를 누르면 상세가 오른쪽 서랍(위~아래 가득, 오른쪽 끝, 폭 440 이하)으로 열림 — 시트 아님`, drCss.vis === 'visible' && dr.r === w && dr.y === 0 && dr.b === h && dr.w <= 440 && dr.x > 0 && drCss.tl === '0px', { dr, drCss });
      await page.getByRole('button', { name: /관계 그래프 보기/ }).click(); await page.waitForTimeout(600);
      ck(`${label}: 서랍의 "관계 그래프 보기" → 서랍이 닫히고 그래프 탭, 포커스는 그래프 탭`, (await page.evaluate(() => getComputedStyle(document.getElementById('inspector')).visibility)) === 'hidden' && (await page.locator('#tab-graph').getAttribute('aria-selected')) === 'true' && (await page.evaluate(() => document.activeElement.id)) === 'tab-graph');
    }
    await snap(page, `r_${w}`);
    noErr(label, page); await ctx.close();
  }

  // 14-3. 창 크기를 바꾸는 동안: 탭 선택·검색 상태가 유지되고, 하단 탭 ↔ 상단 탭이 바뀜
  {
    const { ctx, page } = await open(browser, 1440, 900);
    await tabTo(page, '답변 검증');
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(350);
    ck('1440→390: 하단 탭으로 바뀌고 "답변 검증"이 그대로 선택됨, 본문 안 탭 줄은 사라짐', (await page.locator('[data-variant="bottom"] #tab-verify').getAttribute('aria-selected')) === 'true' && (await page.locator('#center [role="tablist"]').count()) === 0 && (await page.locator('#panel-verify').isVisible()));
    await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(350);
    ck('390→1440: 다시 상단 알약 탭 줄, 선택 유지, 하단 탭 없음', (await page.locator('#center [data-variant="top"] #tab-verify').getAttribute('aria-selected')) === 'true' && (await page.locator('[data-variant="bottom"]').count()) === 0);
    await tabTo(page, '사전 검색'); await page.fill('#q', '메트포르민'); await page.waitForTimeout(250);
    await page.setViewportSize({ width: 700, height: 900 }); await page.waitForTimeout(300);
    ck('700px(경계): 휴대폰 방식이 아님(하단 탭 없음, 트리 보임) · 699px: 휴대폰 방식', (await page.locator('[data-variant="bottom"]').count()) === 0 && (await page.evaluate(() => getComputedStyle(document.getElementById('left')).visibility)) === 'visible');
    await page.setViewportSize({ width: 699, height: 900 }); await page.waitForTimeout(300);
    ck('699px: 하단 탭 · 검색어 "메트포르민" 유지 · 트리는 서랍', (await page.locator('[data-variant="bottom"]').count()) === 1 && (await page.inputValue('#q')) === '메트포르민' && (await page.evaluate(() => getComputedStyle(document.getElementById('left')).visibility)) === 'hidden');
    noErr('창 크기 변경', page); await ctx.close();
  }

  // 14-4. 다크: 하단 탭·히어로·카드 색이 토큰
  {
    const { ctx, page } = await open(browser, 390, 844, { scheme: 'dark', touch: true, mobile: true, dpr: 2 });
    const c = await page.evaluate(() => {
      const cs = (e) => getComputedStyle(e);
      const bar = document.querySelector('[data-variant="bottom"]');
      const on = bar.querySelector('[aria-selected="true"]');
      const off = bar.querySelector('[aria-selected="false"]');
      const hero = document.getElementById('hero-title').closest('section');
      const card = document.querySelector('#panel-search ul.feed-grid > li button');
      return { bar: cs(bar).backgroundColor, on: cs(on).color, off: cs(off).color, hero: cs(hero).backgroundColor, card: cs(card).backgroundColor };
    });
    ck('다크: 하단 탭 막대(surface) · 선택된 탭 글씨(pri) · 안 선택(info) · 히어로(pri-soft) · 카드(surface)가 토큰 색', c.bar === rgb('surface', 'dark') && c.on === rgb('pri', 'dark') && c.off === rgb('info', 'dark') && c.hero === rgb('pri-soft', 'dark') && c.card === rgb('surface', 'dark'), { c, want: { bar: rgb('surface', 'dark'), on: rgb('pri', 'dark'), off: rgb('info', 'dark'), hero: rgb('pri-soft', 'dark') } });
    await snap(page, 'r_phone_dark');
    noErr('반응형 다크', page); await ctx.close();
  }

  /* ───── 15. 실사용판 표기(옛 "프로토타입" 글자 없음 · 버전 한 곳) · 리서치용 질의 ───── */
  const Q = '오메프라졸과 에스오메프라졸의 ATC 코드와 단위용량을 알려줘';
  const ragFind = async (page, q) => { await page.fill('#rq', q); await page.getByRole('button', { name: '사전에서 근거 찾기' }).click(); await page.waitForTimeout(200); };
  // 15-1. 데스크톱 1440
  {
    const { ctx, page } = await open(browser, 1440, 1000);
    const h1 = (await page.locator('header h1').innerText()).replace(/\s+/g, ' ').trim();
    ck(`실사용판: 상단 제목 옆에 버전 v${VERSION} (package.json 의 version)`, h1 === `MedTerm-KR v${VERSION}`, h1);
    ck(`실사용판: 문서 제목에 옛 표기("${OLD_LABEL}") 없음`, !(await page.title()).includes(OLD_LABEL), await page.title());
    const built = await page.evaluate(() => MEDTERM_DATA.meta.built_at);
    ck('검색 첫 화면: 수록 개수 옆에 자료 기준일', (await page.locator('#hero-title').locator('xpath=..').innerText()).includes(`자료 기준 ${built}`), built);
    await page.fill('#q', '없는약이름xyz');
    ck(`사전에 없을 때 안내: "이 사전은 현재 ${IDS.length}개 성분만 수록" + 확인 필요`, (await page.locator('#panel-search').innerText()).includes(`이 사전은 현재 ${IDS.length}개 성분만 수록하므로`));
    await page.fill('#q', '');
    await page.fill('#tree-filter', '없는이름zzz'); await page.waitForTimeout(150);
    ck('트리 거르기 결과 없음 안내: "이 사전에 아직 수록되지 않았다는 뜻"', (await page.locator('#tree').innerText()).includes('이 사전에 아직 수록되지 않았다는 뜻일 수 있습니다'));
    await page.fill('#tree-filter', '');
    // 5개 탭을 모두 열어 화면 글자 어디에도 옛 표기가 없다
    const leaks = [];
    for (const t of TAB_NAMES) { await tabTo(page, t); if ((await page.evaluate(() => document.body.innerText)).includes(OLD_LABEL)) leaks.push(t); }
    ck(`실사용판: 5개 탭 어디에도 "${OLD_LABEL}" 글자가 없음`, leaks.length === 0, leaks);
    await tabTo(page, '데이터·한계');
    const meta = await page.evaluate(() => MEDTERM_DATA.meta);
    ck('데이터·한계: 사전 설명문(notice)이 화면에 나오고 옛 표기가 없음', (await page.locator('#panel-about').innerText()).includes(meta.notice) && !meta.notice.includes(OLD_LABEL) && !/prototype/i.test(meta.name), meta);

    // 근거 기반 질의: 처음부터 보이는 리서치용 안내
    await tabTo(page, '근거 기반 질의');
    const banner = page.locator('#rag-research');
    const bt = await banner.innerText();
    ck('질의: 질문을 쓰기 전부터 "리서치용" 안내가 보이고 임상 판단 금지·확인 필요를 말함', (await banner.isVisible()) && bt.includes('리서치용') && bt.includes('임상 판단') && bt.includes('확인 필요'), bt);
    ck('질의: 화면 맨 위 안내(role=note)는 하나뿐 — 리서치용 안내는 note 가 아님', (await page.getByRole('note').count()) === 1 && (await page.getByRole('note').innerText()).trim() === DISC);
    await ragFind(page, Q);
    const pre = await page.locator('#panel-rag pre').innerText();
    const [sysPart, userPart] = pre.split('\n\n[user]\n');
    ck('질의문: [system] / [user] 두 부분으로 나뉨', pre.startsWith('[system]\n') && !!userPart, pre.slice(0, 40));
    const need = ['리서치 보조자', '리서치용입니다', '[근거 규칙]', '[답변 형식]', '"사전 밖"', '출처(기관·문서명·연도)', '"확인 필요"', '미국 RxNorm', '약사 검수 전 초안', '임상 판단 범위 — 이 조사에서 다루지 않음', '요약', '사전 근거로 확인된 사실', '사전 밖 일반 지식', '확인 필요·한계', '추가로 확인할 자료'];
    ck('질의문(system): 리서치 규칙(근거 표기·사전 밖은 출처·확인 필요·미국 기준·임상 판단 제외)과 답변 5단 형식', need.every((s) => sysPart.includes(s)), need.filter((s) => !sysPart.includes(s)));
    const u = userPart || '';
    const reHead = new RegExp(`^<조사정보>\\n형식: MedTerm-KR 리서치 질의 R1\\n용도: 용어·분류·규격 리서치\\(임상 판단 아님\\)\\n사전: MedTerm-KR · 자료 기준 \\d{4}-\\d{2}-\\d{2} · RxNav [^\\n]+ · 수록 성분 ${IDS.length}개\\n`);
    ck('질의문(user): 조사정보(형식 이름·용도·자료 기준일·수록 성분 수) · 사전근거 · 조사질문 순서', reHead.test(u) && u.indexOf('<사전근거>') > u.indexOf('</조사정보>') && u.indexOf('<조사질문>') > u.indexOf('</사전근거>') && u.trimEnd().endsWith(`${Q}\n</조사질문>`), u.slice(0, 200));
    let ctxIds = null;
    try { ctxIds = JSON.parse(u.split('<사전근거>\n')[1].split('\n</사전근거>')[0]).map((c) => c.id).sort(); } catch (e) { ctxIds = String(e); }
    ck('질의문(user): 사전근거가 JSON 으로 읽히고 오메프라졸·에스오메프라졸 항목이 들어 있음', JSON.stringify(ctxIds) === JSON.stringify(['MT:VTM:283742', 'MT:VTM:7646']), ctxIds);
    ck(`질의문: 옛 표기("${OLD_LABEL}")와 이전 형식("규칙 1)")이 없음`, !pre.includes(OLD_LABEL) && !pre.includes('규칙 1)'));
    ck('질의 화면: 질의문 위에 "리서치용" 배지 · 형식 이름 · 복사 안내', (await page.locator('#panel-rag h3', { hasText: '리서치 질의문' }).innerText()).includes('리서치용') && (await page.locator('#panel-rag').innerText()).includes('형식: MedTerm-KR 리서치 질의 R1') && (await page.getByRole('button', { name: '질의문 복사', exact: true }).count()) === 1);
    ck('질의문 영역: 키보드로 스크롤할 수 있게 초점을 받고 이름이 있음', (await page.locator('#panel-rag pre').getAttribute('tabindex')) === '0' && (await page.locator('#panel-rag pre').getAttribute('aria-label')) === '리서치 질의문');
    // 사전 항목이 없는 질문
    await ragFind(page, 'qzxvw 알려줘');
    const none = await page.locator('#panel-rag').innerText();
    const pre2 = await page.locator('#panel-rag pre').innerText();
    ck('질의: 사전 항목을 못 찾으면 안내하고, 질의문에는 "일치하는 사전 항목이 없습니다"와 "없음" 지시가 들어감', none.includes('질문에서 사전 항목을 찾지 못했습니다') && pre2.includes('이 질문과 일치하는 사전 항목이 없습니다') && pre2.includes('답변 형식 2번은 "없음"') && pre2.includes('qzxvw 알려줘\n</조사질문>'), pre2.slice(-300));
    await snap(page, 'r15_rag_research');
    noErr('리서치 질의(1440)', page); await ctx.close();
  }
  // 15-2. 휴대폰 390: 안내·질의문·버튼이 화면 안에 맞는다
  {
    const { ctx, page } = await open(browser, 390, 844, { touch: true, mobile: true, dpr: 2 });
    await tabTo(page, '근거 기반 질의');
    const b = await rect(page, '#rag-research');
    ck('휴대폰: 리서치용 안내가 바깥틀 안에 들어옴(좌우 여백 15px 이상)', b && b.x >= 15 && b.r <= 375, b);
    await ragFind(page, Q);
    const pr = await rect(page, '#panel-rag pre');
    const cp = await btnFill(page, '질의문 복사');
    ck('휴대폰: 질의문은 폭 안에서 줄바꿈, 복사 버튼은 카드 폭 가득 · 44px 이상', pr.r <= 375 && cp && cp.w === cp.inner && cp.h >= 44, { pr, cp });
    ck('휴대폰: 질의 탭 가로 넘침 없음', (await overflow(page)).doc === 0 && (await overflow(page)).center === 0, await overflow(page));
    await snap(page, 'r15_rag_phone');
    noErr('리서치 질의(390)', page); await ctx.close();
  }

  await browser.close();
  console.log(`\n${total}개 중 ${total - bad}개 통과` + (bad ? `, ${bad}개 실패` : ' — 모두 통과'));
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
