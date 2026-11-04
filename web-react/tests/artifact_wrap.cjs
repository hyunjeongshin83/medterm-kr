// 공유 페이지 조각(dist/artifact.html)을 실제 바깥틀과 비슷하게 감싸 한 번 열어 본다(구조·높이·넘침·오류 + 화면 캡처).
// 바깥틀 흉내: viewport-fit=cover, html 위아래 안전 여백, body 여백 0, [hidden] 규칙. 구글 폰트 요청만 막고(오프라인) 나머지 외부 요청은 실패로 센다.
// 사용: node tests/artifact_wrap.cjs [캡처 저장 폴더]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const { rgb, FACES } = require('./_tokens.cjs');
const { VERSION, OLD_LABEL } = require('./_copy.cjs');
const OUT = process.argv[2] || path.join(ROOT, 'shots', 'artifact'); fs.mkdirSync(OUT, { recursive: true });
const frag = fs.readFileSync(path.join(ROOT, 'dist', 'artifact.html'), 'utf8');
const wrapped = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>
${frag}
</body></html>`;
const FILE = path.join(ROOT, 'dist', '_wrapped_artifact_test.html'); fs.writeFileSync(FILE, wrapped);

let bad = 0, total = 0;
const ck = (n, ok, x) => { total++; if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); };

async function open(browser, w, h, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: o.dpr || 1, colorScheme: o.scheme || 'light', hasTouch: !!o.touch, isMobile: !!o.mobile });
  const ext = [];
  // 글꼴을 파일 안에 담았으므로 외부 요청은 어떤 것도 허용하지 않는다(예전에는 Google Fonts 만 허용했다).
  await ctx.route(/^(?!file:)/, (r) => { ext.push(r.request().url()); return r.abort(); });
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  page.errs = []; page.ext = ext;
  page.on('pageerror', (e) => page.errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errs.push(m.text()); });
  await page.goto('file://' + FILE + (o.hash ? '#' + o.hash : '')); await page.waitForSelector('#root > *'); await page.waitForTimeout(400);
  return { ctx, page };
}
const tabTo = async (page, name) => { await page.getByRole('tab', { name, exact: true }).click(); await page.waitForTimeout(500); };
const fit = (page) => page.evaluate(() => {
  const d = document.documentElement, a = document.getElementById('root').firstElementChild;
  return { docX: d.scrollWidth - d.clientWidth, docY: d.scrollHeight - d.clientHeight, appH: Math.round(a.getBoundingClientRect().height), vh: innerHeight };
});

(async () => {
  const browser = await chromium.launch();
  // 1) 데스크톱 1440×900: 3단 + 검색 + 상세
  {
    const { ctx, page } = await open(browser, 1440, 900, { dpr: 2 });
    ck('제목', (await page.title()) === 'MedTerm-KR', await page.title());
    ck(`공유 조각: 옛 표기("${OLD_LABEL}") 없음 · 상단 제목 옆 버전 v${VERSION}`, !frag.includes(OLD_LABEL) && (await page.locator('header h1').innerText()).replace(/\s+/g, ' ').trim() === `MedTerm-KR v${VERSION}`);
    const f = await fit(page); ck('데스크톱: 한 화면에 맞음', f.docX <= 0 && f.docY <= 0 && Math.abs(f.appH - f.vh) <= 1, f);
    await page.fill('#q', '오메프라졸'); await page.waitForTimeout(400);
    ck('데스크톱: 주소 #v-7646', (await page.evaluate(() => location.hash)) === '#v-7646');
    await page.screenshot({ path: path.join(OUT, '1_desktop_search_detail.png') });
    await tabTo(page, '관계 그래프');
    await page.screenshot({ path: path.join(OUT, '2_desktop_graph.png') });
    ck('데스크톱: 오류·외부 요청 없음', page.errs.length === 0 && page.ext.length === 0, { errs: page.errs, ext: page.ext });
    await ctx.close();
  }
  // 2) 휴대폰 390×844(터치): 그래프 + 트리 서랍
  {
    const { ctx, page } = await open(browser, 390, 844, { dpr: 2, touch: true, mobile: true, hash: 'v-7646' });
    const f = await fit(page); ck('휴대폰: 한 화면에 맞음', f.docX <= 0 && f.docY <= 0 && Math.abs(f.appH - f.vh) <= 1, f);
    ck('휴대폰: #v-7646 링크로 열면 오메프라졸 선택', (await page.locator('#tree [aria-current="true"], #az [aria-current="true"]').count()) >= 0 && (await page.evaluate(() => location.hash)) === '#v-7646');
    await tabTo(page, '관계 그래프');
    await page.screenshot({ path: path.join(OUT, '3_mobile_graph.png') });
    ck('휴대폰: 오류·외부 요청 없음', page.errs.length === 0 && page.ext.length === 0, { errs: page.errs, ext: page.ext });
    await ctx.close();
  }
  // 3) 다크 데스크톱
  {
    const { ctx, page } = await open(browser, 1440, 900, { dpr: 2, scheme: 'dark', hash: 'v-7646' });
    await tabTo(page, '관계 그래프');
    ck('다크: 바탕색 토큰', (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === rgb('bg', 'dark'));
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '') + ' ' + f.weight));
    ck('글꼴: 공유 조각 안에 담긴 글꼴 4종이 외부 요청 없이 읽힘', FACES.every(([fam, w]) => loaded.includes(fam + ' ' + w)), loaded);
    await page.screenshot({ path: path.join(OUT, '4_desktop_graph_dark.png') });
    ck('다크: 오류·외부 요청 없음', page.errs.length === 0 && page.ext.length === 0, { errs: page.errs, ext: page.ext });
    await ctx.close();
  }
  await browser.close();
  fs.unlinkSync(FILE);
  console.log(`\n${total}개 중 ${total - bad}개 통과` + (bad ? ` — 실패 ${bad}` : ' — 모두 통과'));
  process.exit(bad ? 1 : 0);
})();
