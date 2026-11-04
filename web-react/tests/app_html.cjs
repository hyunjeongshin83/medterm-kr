// 설치형 앱용 빌드(dist/MedTerm-KR_app.html) 점검(실제 크롬). 앱에는 인터넷 권한이 없으므로 외부 요청이 하나라도 시도되면 실패로 센다.
// 안드로이드 WebView 와 같은 방식(file:// 문서)으로 연다. WebView 자체(뒤로 가기, 외부 링크 처리 등)는 이 시험 대상이 아니다.
// 사용: node tests/app_html.cjs [캡처 저장 폴더]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, 'shots', 'app'); fs.mkdirSync(OUT, { recursive: true });
const FILE = path.join(ROOT, 'dist', 'MedTerm-KR_app.html');
const URL = 'file://' + FILE;
const DISC = '정보 제공·연구용 프로토타입입니다. 진단·처방·개인별 복용량 판단을 하지 않으며, 한글명·상품명은 약사 검수 전 초안입니다. 복약 결정은 의사·약사와 상담하세요.';
const TABS = ['사전 검색', '관계 그래프', '답변 검증', '근거 기반 질의', '데이터·한계'];

let bad = 0, total = 0;
const ck = (n, ok, x) => { total++; if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); };

async function open(browser, w, h, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: o.dpr || 1, colorScheme: o.scheme || 'light', hasTouch: !!o.touch, isMobile: !!o.mobile });
  const ext = [];
  await ctx.route(/^(?!file:)/, (r) => { ext.push(r.request().url()); return r.abort(); });
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  page.errs = []; page.ext = ext;
  page.on('pageerror', (e) => page.errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) page.errs.push(m.type() + ': ' + m.text()); });
  await page.goto(URL + (o.hash ? '#' + o.hash : '')); await page.waitForSelector('#root > *'); await page.waitForTimeout(300);
  return { ctx, page };
}
const tabTo = async (page, name) => { await page.getByRole('tab', { name, exact: true }).click(); await page.waitForTimeout(350); };
const overflow = (page) => page.evaluate(() => {
  const d = document.documentElement, c = document.getElementById('center');
  return { doc: d.scrollWidth - d.clientWidth, center: c ? c.scrollWidth - c.clientWidth : 0 };
});

(async () => {
  // 0) 문서 자체: 외부 주소를 부르는 태그가 없어야 한다(글꼴 포함)
  {
    const html = fs.readFileSync(FILE, 'utf8');
    ck('문서: 외부 글꼴·스타일·스크립트 링크 없음', !/<link\b/i.test(html) && !/<script[^>]+\bsrc=/i.test(html) && !/@import/i.test(html) && !/fonts\.(googleapis|gstatic)\.com/.test(html));
    ck('문서: 제목 MedTerm-KR, 한국어 문서', /<title>MedTerm-KR<\/title>/.test(html) && /<html lang="ko">/.test(html));
  }

  const browser = await chromium.launch();

  // 1) 휴대폰 두 가지 폭: 모든 탭에서 가로 넘침 없음 + 오류·외부 요청 없음
  for (const [w, h] of [[390, 844], [360, 780]]) {
    const { ctx, page } = await open(browser, w, h, { dpr: 2, touch: true, mobile: true });
    ck(`${w}px: 제목`, (await page.title()) === 'MedTerm-KR', await page.title());
    ck(`${w}px: 면책 문구 원문 그대로`, (await page.getByRole('note').innerText()).trim() === DISC);
    ck(`${w}px: 탭 5개`, (await page.getByRole('tab').count()) === 5 || (await page.getByRole('tab').filter({ hasText: new RegExp(TABS.join('|')) }).count()) === 5);

    await page.fill('#q', '오메프라졸'); await page.waitForTimeout(400);
    ck(`${w}px: 검색하면 오메프라졸이 선택되고 주소가 #v-7646`, (await page.evaluate(() => location.hash)) === '#v-7646' && (await page.locator('#panel-search').innerText()).includes('오메프라졸'));
    const flows = {};
    for (const t of TABS) {
      await tabTo(page, t);
      flows[t] = await overflow(page);
      if (w === 390) await page.screenshot({ path: path.join(OUT, `phone_${TABS.indexOf(t) + 1}.png`) });
    }
    ck(`${w}px: 5개 탭 모두 가로 넘침 없음`, Object.values(flows).every((f) => f.doc <= 0 && f.center <= 0), flows);

    // 근거 기반 질의: 앱에서는 서버 프록시 입력이 없고 안내 문구가 "이 앱"
    await tabTo(page, '근거 기반 질의');
    await page.fill('#rq', '오메프라졸과 에스오메프라졸의 ATC 코드와 단위용량을 알려줘');
    await page.getByRole('button', { name: '사전에서 근거 찾기', exact: true }).click(); await page.waitForTimeout(300);
    const ragText = await page.locator('#panel-rag').innerText();
    ck(`${w}px: 질의 탭에 프록시 URL 입력칸 없음, 안내가 "이 앱에서는"`, (await page.locator('#proxy').count()) === 0 && ragText.includes('이 앱에서는 외부 서버 호출이 막혀 있어') && !ragText.includes('이 공유 화면'));
    await page.getByRole('button', { name: '시연용 답변 넣기(오프라인 데모)', exact: true }).click();
    await page.getByRole('button', { name: '이 답변 검증', exact: true }).click(); await page.waitForTimeout(300);
    ck(`${w}px: 시연용 모의 답변 검증이 "불일치" 판정`, (await page.locator('#rag-verify-out').innerText()).includes('사전 기준 불일치가 발견되었습니다'));
    if (w === 390) await page.screenshot({ path: path.join(OUT, 'phone_rag_done.png') });

    await tabTo(page, '데이터·한계');
    ck(`${w}px: 데이터·한계 탭 표시`, (await page.locator('#center').innerText()).includes('측정된 한계'));
    ck(`${w}px: 콘솔·페이지 오류 없음, 외부 요청 시도 없음`, page.errs.length === 0 && page.ext.length === 0, { errs: page.errs, ext: page.ext });
    await ctx.close();
  }

  // 2) 다크 모드(기기 설정이 다크일 때)
  {
    const { ctx, page } = await open(browser, 390, 844, { dpr: 2, touch: true, mobile: true, scheme: 'dark', hash: 'v-7646' });
    ck('다크: 바탕색 토큰', (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(15, 20, 27)');
    await page.screenshot({ path: path.join(OUT, 'phone_dark.png') });
    ck('다크: 콘솔·페이지 오류 없음, 외부 요청 시도 없음', page.errs.length === 0 && page.ext.length === 0, { errs: page.errs, ext: page.ext });
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${total}개 중 ${total - bad}개 통과` + (bad ? ` — 실패 ${bad}` : ' — 모두 통과'));
  process.exit(bad ? 1 : 0);
})();
