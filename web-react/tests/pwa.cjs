// 설치형 웹앱(dist/pwa) 점검(실제 크롬): 설치 정보 · 서비스 워커 · 오프라인 · 갱신 · 휴대폰 폭.
// 서비스 워커는 https 또는 localhost 에서만 동작하므로 로컬 서버(http://127.0.0.1:임의포트)에서 연다.
// 사용: node tests/pwa.cjs [캡처 저장 폴더]
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'dist', 'pwa');
const OUT = process.argv[2] || path.join(ROOT, 'shots', 'pwa');
fs.mkdirSync(OUT, { recursive: true });
const DISC = '정보 제공·연구용 프로토타입입니다. 진단·처방·개인별 복용량 판단을 하지 않으며, 한글명·상품명은 약사 검수 전 초안입니다. 복약 결정은 의사·약사와 상담하세요.';
const TABS = ['사전 검색', '관계 그래프', '답변 검증', '근거 기반 질의', '데이터·한계'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

let bad = 0, total = 0;
const ck = (n, ok, x) => { total++; if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); };
const rd = (...p) => fs.readFileSync(path.join(DIR, ...p), 'utf8');
const png = (f) => { const b = fs.readFileSync(path.join(DIR, f)); return { sig: b.subarray(0, 8).toString('hex'), w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const tabTo = async (page, name) => { await page.getByRole('tab', { name, exact: true }).click(); await page.waitForTimeout(350); };
const overflow = (page) => page.evaluate(() => {
  const d = document.documentElement, c = document.getElementById('center');
  return { doc: d.scrollWidth - d.clientWidth, center: c ? c.scrollWidth - c.clientWidth : 0 };
});

/* A) 파일 자체 */
function staticChecks() {
  const need = ['index.html', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
  ck('파일 7개가 모두 있음', need.every((f) => fs.existsSync(path.join(DIR, f))), need.filter((f) => !fs.existsSync(path.join(DIR, f))));

  const m = JSON.parse(rd('manifest.webmanifest'));
  ck('설치 정보: 이름·짧은 이름(12자 이하)·한국어', !!m.name && !!m.short_name && m.short_name.length <= 12 && m.lang === 'ko', { name: m.name, short: m.short_name });
  ck('설치 정보: 시작 주소·범위·아이콘 경로가 모두 상대 경로(하위 폴더에 올려도 됨)', m.start_url === './' && m.scope === './' && m.icons.every((i) => !/^(\/|[a-z]+:)/i.test(i.src)));
  ck('설치 정보: 독립 창(standalone)', m.display === 'standalone');
  ck('설치 정보: 고유 id(같은 주소의 다른 웹앱과 구분)', typeof m.id === 'string' && m.id.length >= 6 && !m.id.startsWith('/'), m.id);
  ck('설치 정보: 배경·테마 색이 #rrggbb', /^#[0-9a-f]{6}$/i.test(m.background_color) && /^#[0-9a-f]{6}$/i.test(m.theme_color));
  const has = (sz, purpose) => m.icons.some((i) => i.sizes === sz && i.purpose === purpose && i.type === 'image/png');
  ck('아이콘: 192 any · 512 any · 512 maskable 선언', has('192x192', 'any') && has('512x512', 'any') && has('512x512', 'maskable'));
  ck('아이콘: 파일이 PNG 이고 선언한 크기와 같음', m.icons.every((i) => { const p = png(i.src); const [w, h] = i.sizes.split('x').map(Number); return p.sig === '89504e470d0a1a0a' && p.w === w && p.h === h; }));
  const ap = png('icons/apple-touch-icon.png');
  ck('아이콘: apple-touch-icon 이 180×180 PNG', ap.sig === '89504e470d0a1a0a' && ap.w === 180 && ap.h === 180);

  const html = rd('index.html');
  ck('문서: manifest · 테마색(밝음·어두움) · apple-touch-icon 연결',
    /<link rel="manifest" href="manifest\.webmanifest">/.test(html)
    && /<meta name="theme-color" media="\(prefers-color-scheme: light\)" content="#[0-9a-f]{6}">/i.test(html)
    && /<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content="#[0-9a-f]{6}">/i.test(html)
    && /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/.test(html));
  ck('문서: 서비스 워커 등록 코드(http·https 에서만)', /navigator\.serviceWorker\.register\('sw\.js'\)/.test(html) && /\^https\?:\$/.test(html));
  ck('문서: 외부 글꼴·스타일·스크립트 링크 없음', !/<link\b[^>]*\bhref="https?:/i.test(html) && !/<script[^>]+\bsrc=/i.test(html) && !/@import/i.test(html) && !/fonts\.(googleapis|gstatic)\.com/.test(html));
  const base = fs.readFileSync(path.join(ROOT, 'dist', 'MedTerm-KR_react.html'), 'utf8');
  const stripped = html
    .replace(/\n<link rel="manifest"[\s\S]*?<link rel="apple-touch-icon"[^\n]*/, '')
    .replace(/<script>\nif \('serviceWorker'[\s\S]*?<\/script>\n/, '');
  ck('문서: 독립 실행 화면(MedTerm-KR_react.html)에 설치용 태그만 더한 것(화면 코드 동일)', stripped === base);

  const sw = rd('sw.js');
  const ver = (sw.match(/const VERSION = '([^']*)'/) || [])[1];
  ck('서비스 워커: 버전이 해시 10자리로 채워짐(자리표시자 없음)', /^[0-9a-f]{10}$/.test(ver || '') && !sw.includes('__VERSION__'), ver);
  const files = JSON.parse(((sw.match(/const FILES = (\[[^\]]*\])/) || [])[1] || '[]').replace(/'/g, '"'));
  ck('서비스 워커: 보관할 파일 6개가 모두 존재', files.length === 6 && files.every((f) => fs.existsSync(path.join(DIR, f))), files);
  ck('서비스 워커: GET·같은 주소만 다룸(프록시 호출 등은 그대로 통과)', /req\.method !== 'GET'/.test(sw) && /\.origin !== self\.location\.origin/.test(sw));
}

(async () => {
  staticChecks();

  /* B) 로컬 서버 + 실제 크롬 */
  let swVersionOverride = null; // 갱신 시험용: 서버가 sw.js 의 VERSION 을 바꿔서 내려 준다
  const server = http.createServer((q, r) => {
    let p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(DIR, p);
    if (!f.startsWith(DIR + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); return r.end('not found'); }
    let body = fs.readFileSync(f);
    if (p === '/sw.js' && swVersionOverride) body = Buffer.from(body.toString('utf8').replace(/const VERSION = '[^']*'/, `const VERSION = '${swVersionOverride}'`));
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    r.end(body);
  });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const ORIGIN = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  try {
    /* 휴대폰(390×844, 터치): 설치 가능 · 서비스 워커 · 오프라인 · 갱신 */
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const reqs = [];
    ctx.on('request', (r) => reqs.push(r.url()));
    const page = await ctx.newPage();
    page.setDefaultTimeout(10000);
    const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.type() + ': ' + m.text()); });

    await page.goto(ORIGIN + '/');
    await page.waitForSelector('#root > *');
    ck('휴대폰: 처음 열기 — 제목이 설치 문서 제목', (await page.title()).startsWith('MedTerm-KR'), await page.title());
    ck('휴대폰: 면책 문구 원문 그대로 · 탭 5개', (await page.getByRole('note').innerText()).trim() === DISC && (await page.getByRole('tab').count()) === 5);

    const ready = await page.evaluate(async () => { const reg = await navigator.serviceWorker.ready; return { scope: reg.scope, active: !!reg.active }; });
    ck('서비스 워커: 등록되고 활성화됨(범위 = 문서 폴더)', ready.active && ready.scope === ORIGIN + '/', ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    ck('서비스 워커: 이 화면을 제어하기 시작함', true);

    const cached = await page.evaluate(async () => {
      const out = {};
      for (const k of await caches.keys()) { const c = await caches.open(k); out[k] = (await c.keys()).map((r) => new URL(r.url).pathname).sort(); }
      return out;
    });
    const names = Object.keys(cached);
    ck('보관함: medterm-kr-<버전> 한 개에 파일 6개', names.length === 1 && /^medterm-kr-[0-9a-f]{10}$/.test(names[0]) && cached[names[0]].length === 6, cached);

    const cdp = await ctx.newCDPSession(page);
    const inst = await cdp.send('Page.getInstallabilityErrors').catch((e) => ({ err: String(e) }));
    ck('설치 가능: 크롬이 보고하는 설치 불가 사유 0건', !inst.err && Array.isArray(inst.installabilityErrors) && inst.installabilityErrors.length === 0, inst);
    const am = await cdp.send('Page.getAppManifest');
    ck('설치 정보를 크롬이 오류 없이 읽음(주소·오류 0건)', (am.errors || []).length === 0 && am.url === ORIGIN + '/manifest.webmanifest', { url: am.url, errors: am.errors });

    // 설치된 앱처럼 쓰는 화면: 모든 탭에서 가로 넘침 없음 + 질의 탭에 서버 프록시 입력(웹 판)
    await page.fill('#q', '오메프라졸');
    await page.waitForTimeout(400);
    ck('휴대폰: 검색하면 오메프라졸이 선택되고 주소가 #v-7646', (await page.evaluate(() => location.hash)) === '#v-7646' && (await page.locator('#panel-search').innerText()).includes('오메프라졸'));
    const flows = {};
    for (const t of TABS) { await tabTo(page, t); flows[t] = await overflow(page); }
    ck('휴대폰: 5개 탭 모두 가로 넘침 없음', Object.values(flows).every((f) => f.doc <= 0 && f.center <= 0), flows);
    await tabTo(page, '근거 기반 질의');
    await page.fill('#rq', '오메프라졸과 에스오메프라졸의 ATC 코드와 단위용량을 알려줘');
    await page.getByRole('button', { name: '사전에서 근거 찾기', exact: true }).click();
    await page.waitForTimeout(300);
    const rag = await page.locator('#panel-rag').innerText();
    ck('휴대폰: 질의 탭에 서버 프록시 입력칸이 있음(웹 판), "이 앱에서는" 안내는 없음', (await page.locator('#proxy').count()) === 1 && !rag.includes('이 앱에서는') && !rag.includes('이 공유 화면'));
    await tabTo(page, '사전 검색');
    await page.screenshot({ path: path.join(OUT, 'phone_online.png') });

    // 오프라인: 새로고침해도 열려야 한다(서비스 워커가 보관본을 낸다)
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForSelector('#root > *');
    ck('오프라인: 새로고침해도 열림 — 면책 문구 · 탭 5개', (await page.getByRole('note').innerText()).trim() === DISC && (await page.getByRole('tab').count()) === 5);
    // 주소만 바꾼 이동이 아니라 문서를 새로 여는 이동(빈 페이지를 거쳐서)으로, 오프라인에서 성분 주소를 연다.
    // 휴대폰 폭에서는 상세가 서랍이라 화면에 보이지는 않으므로(innerText 에 안 잡힘) 문서 안(textContent)에 있는지로 본다.
    await page.goto('about:blank');
    await page.goto(ORIGIN + '/#v-7646');
    await page.waitForSelector('#root > *');
    await page.waitForTimeout(300);
    ck('오프라인: 성분 주소 #v-7646 도 열려 오메프라졸 상세가 문서 안에 있음', (await page.evaluate(() => location.hash)) === '#v-7646' && (await page.evaluate(() => document.getElementById('inspector').textContent.includes('오메프라졸'))));
    await page.screenshot({ path: path.join(OUT, 'phone_offline.png') });

    ck('휴대폰: 콘솔·페이지 오류 0건', errs.length === 0, errs);
    const outside = reqs.filter((u) => !u.startsWith(ORIGIN + '/'));
    ck('휴대폰: 같은 주소 밖으로 나간 요청 0건(글꼴·분석 도구 없음)', outside.length === 0, outside);
    await ctx.close();

    /* 갱신: 새 판(서비스 워커 파일의 버전이 달라짐)이 올라오면 옛 보관함은 지워지고 새 보관함으로 바뀐다.
       오프라인 흉내(setOffline)를 쓴 위 문맥과 섞이지 않게 새 문맥에서 시험한다. */
    {
      const uctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const up = await uctx.newPage();
      up.setDefaultTimeout(10000);
      await up.goto(ORIGIN + '/');
      await up.waitForSelector('#root > *');
      await up.evaluate(() => navigator.serviceWorker.ready);
      await up.waitForFunction(() => !!navigator.serviceWorker.controller);
      const before = await up.evaluate(async () => (await caches.keys()).join());
      swVersionOverride = 'testv2';
      await up.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); });
      // 주의: waitForFunction 에 async 함수를 넘기면 매번 확인하지 않고 첫 결과(false 여도)에서 바로 돌아온다. 그래서 여기서는 직접 반복 조회한다.
      let updated = false;
      for (let i = 0; i < 40 && !updated; i++) {
        updated = await up.evaluate(async () => {
          const ks = await caches.keys();
          return ks.join() === 'medterm-kr-testv2' && (await (await caches.open(ks[0])).keys()).length === 6;
        });
        if (!updated) await up.waitForTimeout(200);
      }
      const after = await up.evaluate(async () => { const o = {}; for (const k of await caches.keys()) o[k] = (await (await caches.open(k)).keys()).length; return o; });
      swVersionOverride = null;
      ck('갱신: 옛 보관함(medterm-kr-<해시>)이 지워지고 새 보관함(파일 6개)으로 교체', /^medterm-kr-[0-9a-f]{10}$/.test(before) && updated && Object.keys(after).join() === 'medterm-kr-testv2' && after['medterm-kr-testv2'] === 6, { before, after });
      await up.reload();
      await up.waitForSelector('#root > *');
      ck('갱신 뒤에도 새로고침하면 정상으로 열림', (await up.getByRole('tab').count()) === 5);
      await uctx.close();
    }

    /* 데스크톱(웹): 3단 화면이 열리고 가로 넘침 없음 */
    const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const dp = await dctx.newPage();
    dp.setDefaultTimeout(10000);
    const derrs = [];
    dp.on('pageerror', (e) => derrs.push('pageerror: ' + e.message));
    dp.on('console', (m) => { if (['error', 'warning'].includes(m.type())) derrs.push(m.type() + ': ' + m.text()); });
    await dp.goto(ORIGIN + '/#v-7646');
    await dp.waitForSelector('#root > *');
    await dp.waitForTimeout(400);
    const fl = await overflow(dp);
    ck('데스크톱 1440px: 가로 넘침 없음 · 오메프라졸 상세 · 오류 0건', fl.doc <= 0 && fl.center <= 0 && (await dp.locator('body').innerText()).includes('오메프라졸') && derrs.length === 0, { fl, derrs });
    await dp.screenshot({ path: path.join(OUT, 'desktop.png') });
    await dctx.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${total - bad}/${total} 통과` + (bad ? `, 실패 ${bad}` : ''));
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
