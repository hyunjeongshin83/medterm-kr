// MedTerm-KR 「웹앱 + 모바일 앱 나란히 보기」 시험(실제 크롬): dist/showcase_artifact.html(공유 페이지 조각) · dist/MedTerm-KR_showcase.html(독립 실행).
// 사용: node tests/showcase.cjs
// 보는 것: ① 파일 안의 앱 문서 덩어리가 원문과 같게 되살아나는지(sha256) · 틀의 구조 ② 두 칸(웹앱·휴대폰 틀)이 모두 떠서 서로 독립으로 동작하는지
//          ③ 보기 방식 단추·주소(#split · #web · #app)·폭(1100 · 760) 경계 ④ 휴대폰 폭에서 앱만 ⑤ 가로 넘침 · 터치 크기 · axe ⑥ 밝은/어두운 전환 전달
//          ⑦ 공유 페이지 바깥틀(sandbox="allow-scripts" · 엄격한 CSP)을 흉내 낸 환경에서도 두 칸이 뜨는지. 외부 요청은 모두 막고(오프라인) 콘솔 오류·페이지 오류가 있으면 실패로 센다.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const { rgb } = require('./_tokens.cjs');
const { VERSION } = require('./_copy.cjs');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const STAND = path.join(ROOT, 'dist', 'MedTerm-KR_showcase.html');
const FRAG = path.join(ROOT, 'dist', 'showcase_artifact.html');
const WRAPPED = path.join(ROOT, 'dist', '_wrapped_showcase_test.html');
const TAB_NAMES = ['사전 검색', '국내 제품', '최신·임상', '약무·제도', '관계 그래프', '답변 검증', '근거 기반 질의', '데이터·한계'];

let bad = 0, total = 0;
const ck = (name, ok, extra) => { total++; if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); };

/* ───── 0. 파일 검사(브라우저 없이) ───── */
const frag = fs.readFileSync(FRAG, 'utf8');
const standalone = fs.readFileSync(STAND, 'utf8');
const OPEN = '<script type="text/plain" id="app-src"';
const iA = frag.indexOf(OPEN), iS = frag.indexOf('>', iA) + 1, iE = frag.indexOf('</script>', iS);
const raw = frag.slice(iS, iE);
const wantSha = (frag.slice(iA, iS).match(/data-sha256="([0-9a-f]{64})"/) || [])[1];
const appDoc = raw.replace(/<@@/g, '<');
const tpl = frag.slice(0, iA) + frag.slice(iE);          // 앱 문서 덩어리를 뺀 틀 부분
{
  ck('공유 조각: 앱 문서 덩어리가 하나뿐이고 sha256 표시가 있음', iA > 0 && frag.indexOf(OPEN, iA + 1) < 0 && !!wantSha);
  ck('덩어리 안에 </script 와 <!-- 가 없음(HTML 이 끊기지 않음) · 되돌린 문서에는 </script 가 있음', !/<\/script/i.test(raw) && !raw.includes('<!--') && /<\/script/i.test(appDoc));
  ck('되돌린 앱 문서의 sha256 이 빌드 때 기록한 값과 같음(글자 하나도 다르지 않음)', crypto.createHash('sha256').update(appDoc).digest('hex') === wantSha);
  ck('되돌린 앱 문서는 완전한 HTML 문서(<!doctype html> … </html>)', appDoc.startsWith('<!doctype html>') && appDoc.endsWith('</html>\n') && !appDoc.includes('\r'));
  // 번들 안의 한글은 \uXXXX 로 적혀 있으므로 풀어서 비교한다.
  const appDocU = appDoc.replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  ck('앱 문서의 표면 문구: "이 화면에서는 외부 서버 호출이 막혀 있어"(나란히 보기용)이고 다른 표면 문구("이 공유 화면에서는" · "이 앱에서는")는 없음',
    appDocU.includes('이 화면에서는 외부 서버 호출이 막혀 있어') && !appDocU.includes('이 공유 화면에서는 외부 서버 호출') && !appDocU.includes('이 앱에서는 외부 서버 호출'));
  ck('앱 문서: 약사법 층 자료(medterm-law-json)와 현재 버전 표시가 들어 있음', appDoc.includes('medterm-law-json') && appDoc.includes(VERSION));
  const head = frag.slice(0, 600);
  ck('공유 조각: 맨 앞이 <title>MedTerm-KR</title> + claude:viewport-fit-sides 표시(문서 뼈대 태그 없음)', head.startsWith('<title>MedTerm-KR</title>\n<meta name="claude:viewport-fit-sides" content="cover">') && !/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(tpl));
  ck('틀: 외부 주소를 부르는 태그·@import 가 없음(글꼴은 data: 로 담음)', !/(src|href)=["']https?:|url\(["']?https?:|@import/i.test(tpl));
  const mb = (n) => (n / 1048576).toFixed(2);
  ck(`크기: 공유 조각 ${mb(Buffer.byteLength(frag))} MB ≤ 15.5 MB(공유 페이지 한도 16 MB) · 독립 실행 ${mb(Buffer.byteLength(standalone))} MB`, Buffer.byteLength(frag) <= 15.5 * 1048576 && Buffer.byteLength(standalone) <= 16 * 1048576);
  ck('독립 실행 파일: 문서 전체(<!doctype>·lang=ko·viewport) + 제목 "MedTerm-KR · 웹앱과 모바일 앱"', standalone.startsWith('<!doctype html>\n<html lang="ko">') && standalone.includes('<title>MedTerm-KR · 웹앱과 모바일 앱</title>') && standalone.includes('viewport-fit=cover'));
  ck('두 파일에 들어 있는 앱 문서가 같음(같은 sha256)', standalone.includes(`data-sha256="${wantSha}"`));
  ck('틀의 글꼴: Pretendard 400 · 700 · Gaegu 700 을 data: 로 담음(600 은 틀에서 쓰지 않음)', /font-family:'Pretendard';font-weight:400/.test(tpl) && /font-family:'Pretendard';font-weight:700/.test(tpl) && /font-family:'Gaegu';font-weight:700/.test(tpl) && !/font-family:'Pretendard';font-weight:600/.test(tpl));
  // 틀에 새로 쓴 한글이 모두 Pretendard 부분집합 글꼴 안에 있는지(없으면 기기 글꼴로 대신 보인다) — fontTools 가 없으면 건너뜀
  const visible = tpl.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
  // 15초 안내 문구는 스크립트 안에 있으므로 따로 합쳐 본다.
  const extra = (tpl.match(/textContent = '([^']+)'/g) || []).join(' ');
  const py = "import sys,json\ntry:\n from fontTools.ttLib import TTFont\n cm=set(TTFont(sys.argv[1]).getBestCmap().keys())\n t=sys.stdin.read()\n print(json.dumps({'n':len(set(c for c in t if 0xAC00<=ord(c)<=0xD7A3)),'miss':sorted(set(c for c in t if 0xAC00<=ord(c)<=0xD7A3 and ord(c) not in cm))}))\nexcept Exception as e:\n print(json.dumps({'skip':str(e)[:80]}))";
  const r = spawnSync('python3', ['-c', py, path.join(ROOT, 'fonts', 'Pretendard-Regular.subset.woff2')], { input: visible + ' ' + extra, encoding: 'utf8' });
  let g = null; try { g = JSON.parse(r.stdout); } catch (e) { g = { skip: '결과를 읽지 못함' }; }
  if (g.skip) console.log('SKIP 틀의 한글이 Pretendard 부분집합 안에 있는지: 건너뜀(' + g.skip + ')');
  else ck(`틀의 한글(${g.n}자 종류)이 모두 Pretendard 부분집합 안에 있음(기기 글꼴로 대신 보이는 글자 없음)`, g.n > 20 && g.miss.length === 0, g);
}

/* ───── 브라우저 도우미 ───── */
// 공유 페이지 바깥틀 흉내(artifact_wrap.cjs 와 같은 방식): viewport-fit=cover, html 위아래 안전 여백, body 여백 0, [hidden] 규칙.
const SKELETON = (inner) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>
${inner}
</body></html>`;
const wrappedHtml = SKELETON(frag);
fs.writeFileSync(WRAPPED, wrappedHtml);

async function open(browser, file, w, h, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: o.scheme || 'light', hasTouch: !!o.touch, isMobile: !!o.mobile });
  const ext = [];
  await ctx.route(/^(?!file:)/, (r) => { ext.push(r.request().url()); return r.abort(); });
  const page = await ctx.newPage(); page.setDefaultTimeout(15000);
  page.errs = []; page.ext = ext;
  page.on('pageerror', (e) => page.errs.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) page.errs.push(m.type() + ': ' + m.text().slice(0, 200)); });
  await page.goto('file://' + file + (o.hash ? '#' + o.hash : '')); await page.waitForSelector('#sc');
  return { ctx, page };
}
const state = (page) => page.evaluate(() => {
  const up = (id) => { const f = document.getElementById(id); try { return !!(f.getAttribute('data-on') && f.contentDocument && f.contentDocument.querySelector('#root > *')); } catch (e) { return false; } };
  const on = (id) => !!document.getElementById(id).getAttribute('data-on');
  return { mode: document.getElementById('sc').dataset.mode, narrow: document.getElementById('sc').dataset.narrow, webUp: up('fweb'), appUp: up('fmob'), webOn: on('fweb'), appOn: on('fmob') };
});
// 지금 모드에서 떠야 하는 칸이 모두 뜰 때까지(최대 30초)
async function ready(page) {
  const t0 = Date.now(); let s;
  for (;;) {
    s = await state(page);
    if (s.mode === 'split' ? (s.webUp && s.appUp) : s.mode === 'web' ? s.webUp : s.appUp) return { ...s, ms: Date.now() - t0 };
    if (Date.now() - t0 > 30000) return { ...s, ms: Date.now() - t0, timeout: true };
    await page.waitForTimeout(200);
  }
}
const frameOf = async (page, id) => (await page.$('#' + id)).contentFrame();
const overflowX = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const vis = (page, sel) => page.locator(sel).first().isVisible();
const noErr = (label, page) => ck(label + ': 콘솔·페이지 오류 없음, 외부 요청 시도 없음', page.errs.length === 0 && page.ext.length === 0, { errs: page.errs.slice(0, 4), ext: page.ext.slice(0, 3) });

(async () => {
  const browser = await chromium.launch();

  /* ───── 1. 데스크톱 1440×900(공유 바깥틀): 두 칸이 뜨고 서로 독립으로 동작 ───── */
  {
    const { ctx, page } = await open(browser, WRAPPED, 1440, 900);
    ck('제목 "MedTerm-KR"(공유 페이지 이름 그대로)', (await page.title()) === 'MedTerm-KR', await page.title());
    const s = await ready(page);
    // 앱 안에서 주소(#…)를 바꾸는 동작이 바깥 문서 주소로 풀려 화면이 통째로 다시 열리던 결함(about:srcdoc)을 막는 시험: 이후 하위 화면의 새 이동이 없어야 한다.
    const navs = []; page.on('framenavigated', (f) => { if (f !== page.mainFrame()) navs.push(f.url().slice(0, 80)); });
    ck(`나란히 보기: 웹앱 칸 · 모바일 앱 칸이 모두 뜸(${s.ms}ms)`, s.mode === 'split' && s.webUp && s.appUp && !s.timeout, s);
    const names = await page.locator('.seg button').allInnerTexts();
    ck('보기 단추 3개(나란히 · 웹앱 · 모바일 앱), 처음에는 "나란히"가 눌림', JSON.stringify(names.map((t) => t.trim())) === JSON.stringify(['나란히', '웹앱', '모바일 앱']) && (await page.locator('.seg button').first().getAttribute('aria-pressed')) === 'true');
    const rw = await (await page.$('#fweb')).boundingBox(), rm = await (await page.$('#fmob')).boundingBox();
    ck('웹앱 칸은 넓게(900px 이상 · 높이 640px 이상), 휴대폰 틀 안쪽은 폭 374px 안팎(틀 392px − 테두리 18px)', rw.width >= 900 && rw.height >= 640 && Math.abs(rm.width - 374) <= 2 && rm.height >= 600, { web: [Math.round(rw.width), Math.round(rw.height)], phone: [Math.round(rm.width), Math.round(rm.height)] });
    ck('iframe 에 화면 읽기용 제목이 있음("MedTerm-KR 웹앱" · "MedTerm-KR 모바일 앱 미리보기")', (await page.locator('#fweb').getAttribute('title')) === 'MedTerm-KR 웹앱' && (await page.locator('#fmob').getAttribute('title')) === 'MedTerm-KR 모바일 앱 미리보기');
    ck('"휴대폰에서 열기" 안내가 휴대폰 틀 아래에 있고 설치 파일 이름에 버전이 들어감', (await vis(page, '#open-phone')) && (await page.locator('#open-phone').innerText()).includes(`MedTerm-KR-${VERSION}.apk`));
    const guide = await page.locator('#guide').innerText();
    ck('아래 안내 띠: 처음 쓰는 방법 3단계 · 확인해 주세요(약사 검수 전 초안 · 판단하지 않음 · 외부로 보내지 않음 · 리서치용)', ['처음 쓰는 방법', '약무·제도', '확인해 주세요', '약사 검수 전 초안', '개인별 복용량을 판단하지 않습니다', '외부 서버로 보내지 않습니다', '리서치용'].every((t) => guide.includes(t)), guide.slice(0, 120));

    const web = await frameOf(page, 'fweb'), app = await frameOf(page, 'fmob');
    ck(`두 앱 칸의 상단 제목 옆에 현재 버전 v${VERSION}`, (await Promise.all([web, app].map(async (f) => (await f.locator('header h1').innerText()).replace(/\s+/g, ' ').trim()))).every((t) => t === `MedTerm-KR v${VERSION}`));
    const topTabs = await web.locator('[data-variant="top"] [role="tab"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.innerText.trim()));
    const botTabs = await app.locator('[data-variant="bottom"] [role="tab"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    ck(`웹앱 칸: 알약 탭 ${TAB_NAMES.length}개(본문 위) · 모바일 앱 칸: 하단 탭 막대 ${TAB_NAMES.length}개 — 같은 탭 구성`, topTabs.length === TAB_NAMES.length && JSON.stringify(botTabs) === JSON.stringify(TAB_NAMES), { topTabs, botTabs });
    // 서로 독립: 웹앱 칸에서 검색해도 휴대폰 칸은 그대로
    await web.locator('#q').fill('오메프라졸'); await page.waitForTimeout(400);
    ck('웹앱 칸에서 "오메프라졸"을 검색해도 모바일 앱 칸 검색창은 비어 있음(두 앱이 따로 동작)', (await web.locator('#q').inputValue()) === '오메프라졸' && (await app.locator('#q').inputValue()) === '');
    await app.getByRole('tab', { name: '약무·제도', exact: true }).click(); await page.waitForTimeout(300);
    ck('모바일 앱 칸에서 "약무·제도" 탭을 열면 약사법 목록이 뜨고, 웹앱 칸은 검색 탭 그대로', (await app.locator('#panel-law').isVisible()) && (await app.locator('#llist-title').innerText()).includes('53') && (await web.locator('#panel-search').isVisible()));
    await web.getByRole('tab', { name: '근거 기반 질의', exact: true }).click(); await page.waitForTimeout(300);
    await web.locator('#rq').fill('오메프라졸과 에스오메프라졸의 ATC 코드와 단위용량을 알려줘');
    await web.getByRole('button', { name: '사전에서 근거 찾기', exact: true }).click(); await page.waitForTimeout(300);
    const ragText = await web.locator('#panel-rag').innerText();
    ck('앱 안의 근거 기반 질의: 프록시 URL 입력칸 없음, 안내는 "이 화면에서는 외부 서버 호출이 막혀 있어 LLM 호출 기능을 숨겼습니다"(다른 표면 문구 없음)',
      (await web.locator('#proxy').count()) === 0 && ragText.includes('이 화면에서는 외부 서버 호출이 막혀 있어 LLM 호출 기능을 숨겼습니다') && !ragText.includes('이 공유 화면') && !ragText.includes('이 앱에서는'));
    await app.getByRole('tab', { name: '사전 검색', exact: true }).click(); await page.waitForTimeout(200);
    await app.locator('#q').fill('메카인'); await page.waitForTimeout(300);
    ck('휴대폰 칸 검색창에 "메카인"을 쓰면 그 칸에서만 결과가 바뀜(웹앱 칸은 오메프라졸 그대로)', (await app.locator('#q').inputValue()) === '메카인' && (await web.locator('#q').inputValue()) === '오메프라졸');
    ck('앱 칸 안에서 검색·성분 선택·탭 전환을 해도 두 칸 모두 about:srcdoc 그대로(화면이 통째로 다시 열리지 않음, 새 이동 0건)',
      (await frameOf(page, 'fweb')).url() === 'about:srcdoc' && (await frameOf(page, 'fmob')).url() === 'about:srcdoc' && navs.length === 0, navs);
    noErr('데스크톱 1440(공유 바깥틀)', page);

    // 보기 방식 단추
    await page.locator('.seg button', { hasText: '웹앱' }).click(); await page.waitForTimeout(200);
    ck('"웹앱" 단추: 웹앱 칸만(휴대폰 틀 숨김), 주소 #web, 단추가 눌린 상태', (await state(page)).mode === 'web' && (await vis(page, '#fweb')) && !(await vis(page, '#fmob')) && (await page.evaluate(() => location.hash)) === '#web' && (await page.locator('.seg button', { hasText: '웹앱' }).getAttribute('aria-pressed')) === 'true');
    ck('"웹앱" 보기에서도 "휴대폰에서 열기" 안내와 아래 안내 띠는 보임', (await vis(page, '#open-phone')) && (await vis(page, '#guide')));
    await page.locator('.seg button', { hasText: '모바일 앱' }).click(); await page.waitForTimeout(200);
    ck('"모바일 앱" 단추: 휴대폰 틀만(웹앱 칸 숨김), 주소 #app', (await state(page)).mode === 'app' && !(await vis(page, '#fweb')) && (await vis(page, '#fmob')) && (await page.evaluate(() => location.hash)) === '#app');
    ck('보기를 바꿔도 앱 상태는 유지됨(휴대폰 칸 검색창 "메카인" 그대로, 다시 불러오지 않음)', (await app.locator('#q').inputValue()) === '메카인');
    await page.locator('.seg button', { hasText: '나란히' }).click(); await page.waitForTimeout(200);
    ck('"나란히" 단추: 두 칸이 다시 보임, 주소 #split, 웹앱 칸 검색어 유지', (await state(page)).mode === 'split' && (await vis(page, '#fweb')) && (await vis(page, '#fmob')) && (await page.evaluate(() => location.hash)) === '#split' && (await web.locator('#q').inputValue()) === '오메프라졸');
    const sz = await page.locator('.seg button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    ck('보기 단추가 모두 44×44px 이상', sz.every(([w, h]) => w >= 44 && h >= 44), sz);
    ck('가로 넘침 없음(1440)', (await overflowX(page)) <= 0);
    noErr('보기 방식 바꾸기', page);
    await ctx.close();
  }

  /* ───── 2. 주소(#split · #web · #app)와 폭 경계 ───── */
  {
    const cases = [
      [1440, 'app', 'app', false], [1440, 'web', 'web', false], [1440, 'split', 'split', false], [1440, '', 'split', false],
      [1100, '', 'split', false], [1099, '', 'web', false], [1099, 'split', 'web', false], [900, 'app', 'app', false],
      [760, '', 'web', false], [759, '', 'app', true], [759, 'web', 'app', true], [390, '', 'app', true],
    ];
    for (const [w, hash, want, narrow] of cases) {
      const { ctx, page } = await open(browser, WRAPPED, w, 800, { hash });
      const s = await ready(page);
      const splitBtn = await page.locator('.seg button').first().isVisible();
      ck(`폭 ${w}${hash ? ' · #' + hash : ''}: 보기 "${want}"${narrow ? '(휴대폰 폭: 앱만)' : ''}${w < 1100 ? ' · "나란히" 단추 숨김' : ''}`,
        s.mode === want && (s.narrow === '1') === narrow && s.webOn === (want !== 'app') && s.appOn === (want !== 'web') && (narrow || splitBtn === (w >= 1100)) && !s.timeout, s);
      await ctx.close();
    }
  }

  /* ───── 3. 휴대폰 390×844(터치): 앱만 화면 가득 + 아래 안내 ───── */
  {
    const { ctx, page } = await open(browser, WRAPPED, 390, 844, { touch: true, mobile: true });
    const s = await ready(page);
    ck('휴대폰: 앱만 뜸(웹앱 칸은 아직 붙이지 않음) · 보기 단추·머리띠는 화면에서 감춤', s.mode === 'app' && s.appUp && !s.webOn && !(await vis(page, '.seg')) && (await page.locator('.top').evaluate((e) => e.getBoundingClientRect().width)) <= 2, s);
    const rm = await (await page.$('#fmob')).boundingBox();
    ck('휴대폰: 앱 칸이 화면 폭 390px 그대로(틀·테두리 없음)이고 높이가 화면의 대부분(560px 이상)', Math.round(rm.width) === 390 && rm.height >= 560, [Math.round(rm.width), Math.round(rm.height)]);
    const app = await frameOf(page, 'fmob');
    ck('휴대폰: 앱 안은 하단 탭 막대 8개, 탭 하나가 44×44px 이상', await app.locator('[data-variant="bottom"] [role="tab"]').evaluateAll((els) => els.length === 8 && els.every((e) => { const r = e.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })));
    await page.locator('#guide').scrollIntoViewIfNeeded();
    ck('휴대폰: 아래에 "휴대폰에서 열기" · 사용 안내가 이어지고 가로 넘침 없음', (await vis(page, '#open-phone')) && (await vis(page, '#guide')) && (await overflowX(page)) <= 0);
    noErr('휴대폰 390', page);
    await ctx.close();
  }

  /* ───── 4. 폭별 가로 넘침 ───── */
  {
    const res = [];
    for (const w of [1920, 1440, 1180, 1099, 900, 760, 759, 390, 360]) {
      const { ctx, page } = await open(browser, WRAPPED, w, 800, { touch: w < 700, mobile: w < 700 });
      await ready(page); const o = await overflowX(page); res.push([w, o]); await ctx.close();
    }
    ck('폭 1920 · 1440 · 1180 · 1099 · 900 · 760 · 759 · 390 · 360 모두 가로 넘침 없음', res.every(([, o]) => o <= 0), res);
  }

  /* ───── 5. axe(틀 자체) 1440 · 390 ───── */
  for (const [w, h, touch] of [[1440, 900, false], [390, 844, true]]) {
    const { ctx, page } = await open(browser, WRAPPED, w, h, { touch, mobile: touch });
    await ready(page);
    await page.addScriptTag({ content: AXE });
    const r = await page.evaluate(() => window.axe.run(document, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }).then((x) => x.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, html: v.nodes[0].html.slice(0, 100) }))));
    ck(`틀의 접근성 자동 점검(axe, 폭 ${w}): 위반 없음`, r.length === 0, r);
    await ctx.close();
  }

  /* ───── 6. 밝은/어두운 전환(data-theme) 전달: 공유 페이지의 전환이 두 앱 칸에도 닿는다 ───── */
  {
    const { ctx, page } = await open(browser, WRAPPED, 1440, 900, { scheme: 'light' });
    await ready(page);
    const bg = async (id) => (await frameOf(page, id)).evaluate(() => getComputedStyle(document.body).backgroundColor);
    const want = (m) => rgb('bg', m);
    ck('처음(시스템 밝게): 두 앱 칸 모두 밝은 바탕 토큰', (await bg('fweb')) === want('light') && (await bg('fmob')) === want('light'), [await bg('fweb'), await bg('fmob')]);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await page.waitForTimeout(250);
    ck('공유 페이지가 어둡게(data-theme=dark)로 바뀌면 두 앱 칸도 어두운 바탕 토큰', (await bg('fweb')) === want('dark') && (await bg('fmob')) === want('dark'), [await bg('fweb'), await bg('fmob')]);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light')); await page.waitForTimeout(250);
    ck('다시 밝게(data-theme=light)로 바꾸면 두 앱 칸도 밝은 토큰', (await bg('fweb')) === want('light') && (await bg('fmob')) === want('light'));
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme')); await page.waitForTimeout(250);
    ck('전환을 지우면(시스템 설정으로 돌아가면) 두 앱 칸의 data-theme 도 지워짐', (await (await frameOf(page, 'fweb')).evaluate(() => document.documentElement.getAttribute('data-theme'))) === null);
    noErr('테마 전달', page);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, WRAPPED, 1440, 900, { scheme: 'dark' });
    await ready(page);
    const bg = async (id) => (await frameOf(page, id)).evaluate(() => getComputedStyle(document.body).backgroundColor);
    ck('시스템이 어두울 때: 두 앱 칸은 어두운 토큰이고 틀(청록 바탕)은 그대로 읽힘', (await bg('fweb')) === rgb('bg', 'dark') && (await bg('fmob')) === rgb('bg', 'dark') && (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(6, 65, 62)');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light')); await page.waitForTimeout(250);
    ck('시스템이 어두워도 공유 페이지가 밝게(data-theme=light)면 두 앱 칸은 밝은 토큰(전환이 우선)', (await bg('fweb')) === rgb('bg', 'light') && (await bg('fmob')) === rgb('bg', 'light'));
    await ctx.close();
  }

  /* ───── 7. 독립 실행 파일 ───── */
  {
    const { ctx, page } = await open(browser, STAND, 1440, 900);
    const s = await ready(page);
    ck('독립 실행 파일: 제목에 "웹앱과 모바일 앱", 두 칸이 모두 뜸', (await page.title()).includes('웹앱과 모바일 앱') && s.mode === 'split' && s.webUp && s.appUp && !s.timeout, s);
    noErr('독립 실행 파일', page);
    await ctx.close();
  }

  /* ───── 8. 공유 페이지 바깥틀 흉내: sandbox="allow-scripts"(출처 없음) + 엄격한 CSP ───── */
  {
    const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; connect-src 'none'; frame-src 'none'; child-src 'none'; base-uri 'none'; form-action 'none'";
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx.route('https://viewer.test/host', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><body style="margin:0"><iframe id="v" title="v" src="https://viewer.test/page" sandbox="allow-scripts" style="width:100vw;height:100vh;border:0"></iframe></body>' }));
    await ctx.route('https://viewer.test/page', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: { 'content-security-policy': csp }, body: wrappedHtml }));
    const other = []; await ctx.route(/^(?!https:\/\/viewer\.test\/)/, (r) => { other.push(r.request().url()); return r.abort(); });
    const page = await ctx.newPage(); page.setDefaultTimeout(15000);
    const msgs = []; page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) msgs.push(m.text().slice(0, 220)); });
    const perr = []; page.on('pageerror', (e) => perr.push(e.message.slice(0, 200)));
    await page.goto('https://viewer.test/host');
    let page2 = null, kids = [];
    for (let i = 0; i < 150; i++) {
      await page.waitForTimeout(200);
      page2 = page.frames().find((f) => f.url() === 'https://viewer.test/page');
      kids = page2 ? page2.childFrames() : [];
      if (page2 && kids.length >= 2) {
        const ok = await Promise.all(kids.map((k) => k.evaluate(() => !!document.querySelector('#root > *')).catch(() => false)));
        if (ok.every(Boolean)) break;
      }
    }
    const okK = await Promise.all(kids.map((k) => k.evaluate(() => !!document.querySelector('#root > *')).catch(() => false)));
    ck('sandbox="allow-scripts" + CSP(script·style 인라인만, font·img 는 data: 만, frame-src none): 두 앱 칸이 모두 뜸', kids.length === 2 && okK.every(Boolean), { kids: kids.length, okK });
    ck('그 환경에서 CSP 위반("Refused to …") · 페이지 오류 · 바깥 요청이 없음(저장소 접근 거부 경고는 앱이 걸러 냄)', !msgs.some((m) => /Refused|Content Security/i.test(m)) && perr.length === 0 && other.length === 0, { msgs: msgs.slice(0, 4), perr: perr.slice(0, 2), other: other.slice(0, 2) });
    const st = page2 ? await page2.evaluate(() => ({ mode: document.getElementById('sc').dataset.mode, storage: (() => { try { void localStorage.length; return 'open'; } catch (e) { return 'blocked'; } })() })) : null;
    ck('그 환경(저장소 접근이 막힘)에서도 틀이 보기 방식을 "나란히"로 정함', st && st.mode === 'split' && st.storage === 'blocked', st);
    // 막힌 환경의 앱 칸에서도 검색이 됨
    const k0 = kids[0];
    let typed = null; try { await k0.locator('#q').fill('오메프라졸'); await page.waitForTimeout(500); typed = await k0.locator('#panel-search').innerText(); } catch (e) { typed = 'ERR ' + e.message.slice(0, 80); }
    ck('그 환경의 웹앱 칸에서 검색하면 오메프라졸 결과가 나옴', typeof typed === 'string' && typed.includes('오메프라졸') && kids.every((k) => k.url() === 'about:srcdoc'), typeof typed === 'string' ? typed.slice(0, 80) : typed);
    await ctx.close();
  }

  await browser.close();
  try { fs.unlinkSync(WRAPPED); } catch (e) { /* 이미 없음 */ }
  console.log(`\n${total}개 중 ${total - bad}개 통과, ${bad}개 실패`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { try { fs.unlinkSync(WRAPPED); } catch (x) { /* */ } console.error('FAIL (예외)', e); process.exit(1); });
