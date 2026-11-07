// MedTerm-KR 약사 검수 참여 화면 점검(실제 크롬): 데이터·한계 탭의 ‘약사 검수 참여’(판정 → 동의서 → 확인서 내보내기·‘MedIT로 보내기’ → 불러오기·지우기)와 ‘검수 상태’(2·3단계) 표시.
// 사용: node tests/review_ui.cjs [dist 파일명]. 외부 요청은 모두 막고(오프라인) 콘솔 오류·페이지 오류·차단된 요청이 있으면 실패로 센다.
//   ‘MedIT로 보내기’ 시험에서만 가짜 접수 주소 한 곳을 시험이 가로채 답한다 — 그 답은 진짜 앱 스크립트(tools/google_apps_script/review_inbox.gs)를 가짜 구글 장치(tests/js/review_inbox_harness.js)에 올려 얻는다(화면이 보낸 글을 서버 코드가 실제로 받아들이는지 본다).
// 이 시험은 동의서 값이 다른 시험용 빌드 3종을 임시 폴더에 스스로 만든다(운영자의 review_intake.json 값과 상관없이 같은 결과가 나오게): A(동의서 값 전부 · 연구 이용 · 가짜 보내기 주소) · B(필수 값만) · C(비어 있음).
//   MEDTERM_JS·MEDTERM_EDITION 은 빌드에 그대로 넘기고 MEDTERM_DIST 는 쓰지 않는다.
// 기대값은 화면과 따로 얻는다: 항목·내용 표시(h)는 페이지의 window.MEDTERM_REVIEW(빌드가 담은 자료)에서, 내보낸 파일의 규칙 적합성은 운영자 병합 도구(tools/merge_pharmacist_reviews.py --dry-run)로 확인한다.
// 현황 표시(2·3단계)는 빌드가 계산해 담은 값을 보여 줄 뿐이라, 여기서는 그 값을 바꿔 주입(addInitScript)해 화면이 그대로 보여 주는지 본다(계산 자체는 tests/test_review_merge.py 가 본다).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const { pathToFileURL } = require('url');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..');
const FILE = process.argv[2] || 'MedTerm-KR_react.html';
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'medterm-review-ui-'));
const STORE_KEY = 'medterm-kr-review-v1';

/* 시험용 빌드 3종(동의서 값이 다름): 시험용 보내기 주소는 가짜(구글에 실제로 있는 주소가 아님) */
const FAKE_EP = 'https://script.google.com/macros/s/AKfycbx_REVIEWUITESTONLY_0123456789/exec';
const INTAKES = {
  A: { endpoint: FAKE_EP, retention: '시험용 보유 기간(수집일부터 1년 뒤 파기)', overseas: '시험용 국외 이전 안내(구글 LLC · 미국 등 · 클라우드 보관)', research: { responsible: '시험용 연구책임자', retention: '시험용 연구 보유 기간(연구 종료 후 3년)', irb: '시험용 IRB 번호(승인일 없음)' } },
  B: { retention: '시험용 보유 기간(B판)', overseas: '시험용 국외 이전 안내(B판)' },
  C: {},
};
const DISTS = {};
for (const [k, v] of Object.entries(INTAKES)) {
  const f = path.join(TMP, `intake_${k}.json`); fs.writeFileSync(f, JSON.stringify(v), 'utf8');
  DISTS[k] = path.join(TMP, `dist_${k}`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, MEDTERM_DIST: DISTS[k], MEDTERM_REVIEW_INTAKE: f }, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) { console.error((r.stdout || '') + (r.stderr || '')); throw new Error('시험용 빌드 실패: ' + k); }
}
const GS = path.join(REPO, 'tools', 'google_apps_script', 'review_inbox.gs');
const HARNESS = path.join(REPO, 'tests', 'js', 'review_inbox_harness.js');
const pad2 = (n) => String(n).padStart(2, '0');
const TODAY = (() => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; })();
let scnN = 0;
/** 앱 스크립트(진짜 코드)에 화면이 보낸 글을 넣어 서버의 답을 얻는다. open=false 면 접수를 닫아 둔 상태. */
function serverSays(body, version, { open = true, extra = {} } = {}) {
  const f = path.join(TMP, `scn${++scnN}.json`);
  fs.writeFileSync(f, JSON.stringify({ gs: GS, today: TODAY, props: { SUMMARY_TO: 'report@example.org', ...(open ? { INTAKE_OPEN: '1', CONSENT_VERSION: version } : {}), ...extra }, steps: [{ do: 'doPost', body }] }), 'utf8');
  const r = spawnSync(process.execPath, [HARNESS, f], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error('가짜 구글 장치 오류: ' + (r.stderr || '').slice(-400));
  const o = JSON.parse(r.stdout); const sh = (o.final && o.final.spreadsheets ? Object.values(o.final.spreadsheets) : []).flatMap((s) => s.sheets).find((s) => s.name === '응답');
  return { parsed: o.steps[0] && o.steps[0].parsed, content: o.steps[0] && o.steps[0].content, rows: sh ? sh.rows : [], props: o.final.props };
}

let bad = 0, total = 0;
const ck = (name, ok, extra) => { total++; if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); };
const nf = (n) => Number(n).toLocaleString('ko-KR');
const sq = (s) => String(s).replace(/\s+/g, ' ').trim();

/** o: hash · scheme · touch/mobile · noExt(확장·추가 자료 없는 판) · review(주입할 MEDTERM_REVIEW; 'none' 이면 없음) · parseLog · storeFail · noClip · seed(미리 넣을 보관 내용) · perms
 *  · build(시험용 빌드 'A'(기본)·'B'·'C') · file(열 파일 이름, 기본 MedTerm-KR_react.html) · clock(가짜 시계를 먼저 설치) · ignoreHttps(시험용 인증서의 임시 서버로 보낼 때만) */
async function open(browser, w, h, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: o.scheme || 'light', hasTouch: !!o.touch, isMobile: !!o.mobile, acceptDownloads: true, permissions: o.perms || [], ignoreHTTPSErrors: !!o.ignoreHttps });
  const failed = [];
  await ctx.route(/^(?!file:)/, (r) => { failed.push(r.request().url()); return r.abort(); });
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  page.errs = []; page.failedUrls = failed;
  page.on('pageerror', (e) => page.errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) page.errs.push(m.type() + ': ' + m.text()); });
  if (o.noExt) await page.addInitScript(() => { for (const k of ['MEDTERM_EXT', 'MEDTERM_NEW', 'MEDTERM_PRODUCTS', 'MEDTERM_LAW']) Object.defineProperty(window, k, { value: undefined, writable: false, configurable: false }); });
  if (o.review !== undefined) await page.addInitScript((r) => { Object.defineProperty(window, 'MEDTERM_REVIEW', { value: r === 'none' ? undefined : r, writable: false, configurable: false }); }, o.review);
  if (o.parseLog) await page.addInitScript(() => { const jp = JSON.parse; window.__jp = []; JSON.parse = function (s, r) { try { if (typeof s === 'string') window.__jp.push(s.length); } catch (e) { /* 기록 실패는 무시 */ } return jp.call(this, s, r); }; });
  if (o.storeFail) await page.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException('blocked', 'QuotaExceededError'); }; });
  if (o.noClip) await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); });
  if (o.seed || o.seedRaw) await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } }, [STORE_KEY, o.seedRaw || JSON.stringify(o.seed)]);
  if (o.clock) await page.clock.install();
  await page.goto('file://' + path.join(DISTS[o.build || 'A'], o.file || FILE) + (o.hash ? '#' + o.hash : '')); await page.waitForSelector('#root > *'); await page.waitForTimeout(250);
  return { ctx, page };
}
const noErr = (label, page) => ck(label + ': 콘솔·페이지 오류 없음, 외부 요청 시도 없음', page.errs.length === 0 && page.failedUrls.length === 0, { errs: page.errs.slice(0, 3), ext: page.failedUrls.slice(0, 3) });
const toAbout = async (page) => { await page.getByRole('tab', { name: '데이터·한계', exact: true }).click(); await page.waitForSelector('#about-pharmacist'); await page.waitForTimeout(100); };
const startWork = async (page) => { if (!(await page.locator('[data-review-work]').count())) await page.locator('[data-review-open]').click(); await page.waitForSelector('[data-review-work]'); };
const overflow = (page) => page.evaluate(() => { const c = document.getElementById('center'); return { doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, center: c ? c.scrollWidth - c.clientWidth : 0 }; });
const progress = async (page) => sq(await page.locator('[data-review-progress]').first().innerText());
const stages = async (page) => (await page.locator('#about-review [data-review-stages] > li').allInnerTexts()).map(sq);
const exportJson = async (page) => JSON.parse(await page.locator('#rv-export').inputValue());
const axeFn = () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] })
  .then((r) => r.violations.map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length, target: x.nodes[0] ? x.nodes[0].target.join(' ') : '', html: x.nodes[0] ? x.nodes[0].html.replace(/\s+/g, ' ').slice(0, 110) : '' })));

/** 병합 도구(--dry-run)로 내보낸 글이 규칙에 맞는지 본다. 저장은 하지 않는다. */
function mergeDry(text, name, extra = []) {
  const f = path.join(TMP, name); fs.writeFileSync(f, text, 'utf8');
  const r = spawnSync('python3', ['-I', path.join(REPO, 'tools', 'merge_pharmacist_reviews.py'), f, '--dry-run', '--license-verified', '--data-dir', path.join(REPO, 'data'), '--store', path.join(TMP, 'store_' + name), ...extra], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

(async () => {
  const browser = await chromium.launch();
  // 동의서 판의 기대값: 빌드와 같은 글(reviewConsent.js)에 시험용 값을 넣어 따로 계산한다(빌드가 값을 올바로 담았는지 화면의 판과 비교).
  const CONS = await import(pathToFileURL(path.join(ROOT, 'src', 'lib', 'reviewConsent.js')).href);
  const versionOf = (intake) => 'c-' + crypto.createHash('sha256').update(CONS.versionBasis(CONS.normalizeIntake(intake, { strict: true }).cfg)).digest('hex').slice(0, 10);
  const VA = versionOf(INTAKES.A), VB = versionOf(INTAKES.B);

  // 빌드가 담은 검수 자료(항목·내용 표시·현황)를 한 번 꺼내 기대값으로 쓴다.
  const BASE = await (async () => { const { ctx, page } = await open(browser, 1280, 900); const r = await page.evaluate(() => JSON.parse(JSON.stringify(window.MEDTERM_REVIEW))); await ctx.close(); return r; })();
  const NAMES = BASE.items.names, LAW = BASE.items.law;
  ck('빌드가 담은 검수 자료: 성분 한글명·상품명 60개 · 약사법 쉬운 풀이 53개 · 현황 + 범위 해시', NAMES.length === 60 && LAW.length === 53 && BASE.scopes.names.n === 60 && BASE.scopes.law.n === 53 && /^[0-9a-f]{12}$/.test(BASE.scopes.names.hash) && BASE.status.names.n === 60 && BASE.status.law.n === 53, { n: [NAMES.length, LAW.length], scopes: BASE.scopes });
  ck('항목 id 는 자료의 모양(N-성분코드 · B-성분코드-해시 · L-조문)이고 서로 겹치지 않음, 항목마다 내용 표시(h)가 있음', [...NAMES, ...LAW].every((it) => /^[NBL]-[\w-]+$/.test(it.id) && /^[0-9a-f]{10}$/.test(it.h)) && new Set([...NAMES, ...LAW].map((it) => it.id)).size === 113);
  ck('운영 전 현황: 아무도 판정하지 않음(검수 자료는 빈 채로 담김)', ['names', 'law'].every((s) => BASE.status[s].answered === 0 && !BASE.status[s].stage2 && !BASE.status[s].stage3 && BASE.status[s].reviewers.length === 0) && BASE.asof === null, BASE.status);

  /* ───── 1. 주소 #review · 닫힌 상태 · 읽기 시점 ───── */
  {
    const { ctx, page } = await open(browser, 1280, 900, { parseLog: true });
    const lazy = await page.evaluate(() => { const d = Object.getOwnPropertyDescriptor(window, 'MEDTERM_REVIEW'); const e = document.getElementById('medterm-review-json'); return { isGetter: !!(d && d.get), len: e ? e.textContent.length : -1 }; });
    ck('검수 자료는 읽지 않는 덩어리로 담겨 있고(window.MEDTERM_REVIEW 는 게터), 첫 화면에서는 읽지 않음', lazy.isGetter && lazy.len > 10000 && !(await page.evaluate(() => window.__jp)).includes(lazy.len), lazy);
    await toAbout(page);
    ck('데이터·한계 탭을 열면 그때 한 번 읽음', (await page.evaluate(() => window.__jp)).filter((n) => n === lazy.len).length === 1);
    const sec = sq(await page.locator('#about-pharmacist').innerText());
    ck('약사 검수 참여 카드(#about-pharmacist): 처음에는 접혀 있고 "검수에 참여하기" 단추가 있으며 흐름·개인정보 안내가 보임', (await page.locator('[data-review-work]').count()) === 0 && (await page.locator('[data-review-open]').innerText()).trim() === '검수에 참여하기'
      && ['약사 검수 참여', '성분 한글명·국내 상품명 60개와 약사법 쉬운 풀이 53개', '서버로 아무것도 보내지 않습니다', 'MedIT가 약사 면허를 따로 확인한 뒤', '공개에 동의하신 경우에만', '면허번호와 연락처는 받지 않고'].every((t) => sec.includes(t)), sec.slice(0, 200));
    ck('검수 상태 절에 "약사이신가요? 검수에 참여하기" 안내 단추가 있고, 누르면 참여 카드가 펼쳐지며 그 카드에 초점이 감', await (async () => {
      await page.locator('[data-review-cta]').click(); await page.waitForSelector('[data-review-work]'); await page.waitForTimeout(150);
      return (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'about-pharmacist';
    })());
    await page.getByRole('button', { name: '접기' }).click();
    ck('"접기"를 누르면 다시 접힘', (await page.locator('[data-review-work]').count()) === 0 && (await page.locator('[data-review-open]').count()) === 1);
    noErr('주소·닫힌 상태', page); await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review' });
    await page.waitForSelector('[data-review-work]'); await page.waitForTimeout(150);
    ck('주소 #review: 데이터·한계 탭이 열리고 참여 카드가 펼쳐져 있으며 그 카드에 초점이 있음', (await page.locator('#tab-about').getAttribute('aria-selected')) === 'true' && (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'about-pharmacist');
    await page.getByRole('tab', { name: '사전 검색', exact: true }).click(); await page.waitForTimeout(100);
    await page.evaluate(() => { location.hash = '#x'; }); await page.waitForTimeout(80);
    await page.evaluate(() => { location.hash = '#review'; }); await page.waitForTimeout(250);
    ck('다른 탭에 있다가 주소를 다시 #review 로 바꾸면 데이터·한계 탭으로 돌아와 참여 카드로 감', (await page.locator('#tab-about').getAttribute('aria-selected')) === 'true' && (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'about-pharmacist');
    ck('성분 선택으로 바뀌는 주소(#v-…)는 #review 와 섞이지 않음: 성분 검색 후에도 검색 탭에서 정상', await (async () => {
      await page.getByRole('tab', { name: '사전 검색', exact: true }).click(); await page.fill('#q', '오메프라졸'); await page.waitForTimeout(250);
      return (await page.evaluate(() => location.hash)) === '#v-7646' && (await page.locator('#tab-search').getAttribute('aria-selected')) === 'true';
    })());
    noErr('#review', page); await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, 390, 844, { hash: 'review', mobile: true, touch: true });
    await page.waitForSelector('[data-review-work]');
    ck('휴대폰(390): 주소 #review 도 같은 곳으로 열리고 가로 넘침이 없음', (await page.locator('#tab-about').getAttribute('aria-selected')) === 'true' && JSON.stringify(await overflow(page)) === '{"doc":0,"center":0}', await overflow(page));
    noErr('휴대폰 #review', page); await ctx.close();
  }

  /* ───── 2. 항목 목록(성분 한글명·상품명 / 약사법 풀이) ───── */
  let EXPORTED = null;
  {
    const { ctx, page } = await open(browser, 1280, 900);
    await toAbout(page); await startWork(page);
    const ids = await page.locator('[data-review-item]').evaluateAll((els) => els.map((e) => e.getAttribute('data-review-item')));
    ck('성분 한글명·상품명: 항목 60개가 자료의 순서·id 그대로 나오고 항목마다 판정 3개(맞다·다르다·모르겠다)', JSON.stringify(ids) === JSON.stringify(NAMES.map((i) => i.id)) && (await page.locator('[data-review-item] input[type="radio"]').count()) === 180);
    const t1 = sq(await page.locator(`[data-review-item="${NAMES[0].id}"]`).innerText()); const b1 = NAMES.find((i) => i.k === 'brand'); const t2 = sq(await page.locator(`[data-review-item="${b1.id}"]`).innerText());
    ck('성분 항목에는 영문명 → 한글명(다른 표기), 상품명 항목에는 상품명 — 성분이 보이고 질문이 다름', t1.includes(NAMES[0].en) && t1.includes(NAMES[0].ko) && t1.includes('이 한글 성분명이 맞습니까?') && t2.includes(b1.b) && t2.includes(b1.ko) && t2.includes('국내 상품명으로 맞습니까?'), { t1, t2 });
    ck('처음 진행: 판정 0/60 · 모든 항목이 미판정(data-verdict 비어 있음)', (await progress(page)).startsWith('판정 0/60') && (await page.locator('[data-review-item][data-verdict=""]').count()) === 60, await progress(page));
    await page.getByRole('button', { name: /^약사법 쉬운 풀이/ }).click(); await page.waitForTimeout(150);
    const lids = await page.locator('[data-review-item]').evaluateAll((els) => els.map((e) => e.getAttribute('data-review-item')));
    ck('약사법 쉬운 풀이: 항목 53개가 자료의 순서(조문 순)·id 그대로 나오고, 항목마다 쉬운 풀이와 "법령 원문 발췌" 접기가 있음', JSON.stringify(lids) === JSON.stringify(LAW.map((i) => i.id)) && (await page.locator('[data-review-item] details').count()) === 53 && sq(await page.locator(`[data-review-item="${LAW[0].id}"]`).innerText()).includes(LAW[0].pl.slice(0, 20)));
    const upc = LAW.find((i) => i.st !== 'cur');
    ck('시행 예정·개정 예정 항목은 표시가 붙고 원문 발췌에 예정판이 함께 나옴', !upc || (sq(await page.locator(`[data-review-item="${upc.id}"]`).innerText()).includes('예정') && (!upc.exn || (await page.locator(`[data-review-item="${upc.id}"] details`).innerHTML()).includes('시행 예정·개정 예정판'))), upc && upc.id);
    ck('범위 단추에 범위별 판정 수가 보임(성분 한글명·상품명 0/60 · 약사법 쉬운 풀이 0/53)', await (async () => { const t = sq(await page.locator('[role="group"][aria-label="검수 범위"]').innerText()); return t.includes('0/60') && t.includes('0/53'); })());
    noErr('항목 목록', page); await ctx.close();
  }

  /* ───── 3. 판정 → 확인서 내보내기 → 병합 도구 검증 ───── */
  {
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review' });
    await page.waitForSelector('[data-review-work]');
    await page.getByRole('button', { name: '파일로 저장(.json)' }).click();
    const p0 = sq(await page.locator('[data-review-problems]').innerText());
    ck('아무것도 안 채우고 내보내려 하면 빠진 것(이름·면허 표시·판정·개인정보 수집·이용 동의)을 알리고 확인서를 만들지 않음', ['이름을 적어 주세요', '약사 면허를 가지고 있습니다’에 표시해 주세요', '판정한 항목이 아직 없습니다', '개인정보 수집·이용 동의(필수)’에 동의해 주세요'].every((t) => p0.includes(t)) && (await page.locator('[data-review-export]').count()) === 0, p0);
    await page.fill('#rv-name', '  홍길동 '); await page.fill('#rv-org', '새봄약국');
    const [a, b, c, d] = NAMES.slice(0, 4).map((i) => i.id);
    await page.check(`#rv-${a}-ok`); await page.check(`#rv-${b}-diff`); await page.fill(`#rv-${b}-m`, '브랜드 철자\n확인 필요'); await page.check(`#rv-${c}-unsure`); await page.fill(`#rv-${c}-m`, '약학정보원에서 못 찾음');
    await page.check(`#rv-${d}-diff`); await page.fill(`#rv-${d}-m`, '지울 메모'); await page.check(`#rv-${d}-ok`);
    ck('판정 표시: 맞다 → 다르다(+메모) → 모르겠다(+메모), 다르다였다가 맞다로 바꾸면 메모 칸이 사라짐 · 진행 "판정 4/60 · 맞다 2 · 다르다 1 · 모르겠다 1"', (await progress(page)) === '판정 4/60 · 맞다 2 · 다르다 1 · 모르겠다 1' && (await page.locator(`#rv-${d}-m`).count()) === 0 && (await page.locator(`[data-review-item="${b}"]`).getAttribute('data-verdict')) === 'diff', await progress(page));
    await page.getByRole('button', { name: '파일로 저장(.json)' }).click();
    ck('이름만 있고 면허 표시가 없으면 아직 내보내지 않음(면허 표시를 요구)', sq(await page.locator('[data-review-problems]').innerText()).includes('약사 면허를 가지고 있습니다’에 표시해 주세요') && !sq(await page.locator('[data-review-problems]').innerText()).includes('이름을 적어'));
    await page.check('#rv-lic');
    await page.getByRole('button', { name: '파일로 저장(.json)' }).click();
    const pc = sq(await page.locator('[data-review-problems]').innerText());
    ck('이름·면허 표시·판정을 채워도 ‘개인정보 수집·이용 동의(필수)’에 표시하지 않으면 내보내지 않음(남은 빠진 것은 동의 하나뿐)', pc.includes('개인정보 수집·이용 동의(필수)’에 동의해 주세요') && !pc.includes('이름을') && !pc.includes('면허') && !pc.includes('판정한 항목') && (await page.locator('[data-review-export]').count()) === 0, pc);
    await page.check('#rv-c1');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '파일로 저장(.json)' }).click()]);
    const saved = fs.readFileSync(await dl.path(), 'utf8');
    ck('파일로 저장: 내려받기가 시작되고 파일 이름이 medterm-kr-review-names-날짜.json', /^medterm-kr-review-names-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    const box = await page.locator('#rv-export').inputValue();
    ck('저장한 파일과 화면의 글 상자 내용이 같고(복사가 안 될 때 쓰는 글), 안내 문구(MedIT 담당자에게 보내기 · 면허번호·연락처는 없음)가 있음', saved === box && sq(await page.locator('[data-review-export]').innerText()).includes('이 앱을 알려 드린 MedIT 담당자에게 보내 주세요') && sq(await page.locator('[data-review-export]').innerText()).includes('면허번호·연락처는 들어 있지 않습니다'));
    const J = JSON.parse(saved); EXPORTED = saved;
    const keys = (o) => Object.keys(o).sort().join(',');
    ck('확인서의 동의 기록(consent): 칸은 version·collect·research·date 뿐, 동의서 판은 빌드의 동의서 판(시험용 값으로 따로 계산)과 같고 · 필수 동의 true · 연구 이용은 표시하지 않아 false · 날짜는 작성일과 같음', keys(J.consent) === 'collect,date,research,version' && J.consent.version === VA && J.consent.collect === true && J.consent.research === false && J.consent.date === J.created, J.consent);
    ck('확인서 내용: 형식·범위·범위 해시·앱 판·작성일, 검수자(이름은 앞뒤 공백 정리 · 소속 · 공개 아님 · 면허 표시), 진행 상황 파일(attested false)', J.schema === 'medterm-kr-review/1' && J.scope === 'names' && J.scope_hash === BASE.scopes.names.hash && J.app === VERSION && /^\d{4}-\d{2}-\d{2}$/.test(J.created)
      && keys(J.reviewer) === 'affiliation,license_claimed,name,public' && J.reviewer.name === '홍길동' && J.reviewer.affiliation === '새봄약국' && J.reviewer.public === false && J.reviewer.license_claimed === true && J.attested === false && J.refs.length === 0 && J.refs_other === '', J);
    ck('확인서 내용: 담긴 칸이 정해진 것뿐이고(면허번호·연락처 칸 없음), 판정 3개(4번째는 맞다로 바뀌어 메모 없음)가 항목 id·내용 표시(h)와 함께 들어 있음', keys(J) === 'answers,app,attested,consent,created,refs,refs_other,reviewer,schema,scope,scope_hash'
      && Object.keys(J.answers).length === 4 && J.answers[a].v === 'ok' && J.answers[a].h === NAMES[0].h && J.answers[b].v === 'diff' && J.answers[b].m === '브랜드 철자 확인 필요' && J.answers[c].v === 'unsure' && J.answers[c].m === '약학정보원에서 못 찾음' && J.answers[d].v === 'ok' && !('m' in J.answers[d]) && !('m' in J.answers[a]), J.answers);
    const m1 = mergeDry(saved, 'a.json');
    ck('운영자 병합 도구가 이 파일을 받아들임(--dry-run): 검수자 P1 · 판정 4개 · 진행 상황 파일 · 저장하지 않음', m1.code === 0 && m1.out.includes('P1') && m1.out.includes('판정 4개') && m1.out.includes('미동의(진행 상황)') && m1.out.includes('--dry-run'), m1);
    ck('병합 도구는 면허 확인 표시(--license-verified) 없이는 이 파일도 합치지 않음', (() => { const f = path.join(TMP, 'a.json'); const r = spawnSync('python3', ['-I', path.join(REPO, 'tools', 'merge_pharmacist_reviews.py'), f, '--dry-run', '--data-dir', path.join(REPO, 'data'), '--store', path.join(TMP, 'store_nolic.json')], { encoding: 'utf8' }); return r.status === 2 && (r.stdout + r.stderr).includes('면허'); })());
    // 확인서 동의 + 참고 자료 + 공개 동의
    await page.check('#rv-att'); await page.check('#rv-pub'); await page.check('#rv-ref-health\\.kr'); await page.check('#rv-ref-book'); await page.check('#rv-ref-other');
    await page.getByRole('button', { name: '파일로 저장(.json)' }).click();
    ck('"기타" 참고 자료를 고르고 이름을 비워 두면 내보내지 않고 알림', sq(await page.locator('[data-review-problems]').innerText()).includes('참고한 자료의 이름'));
    await page.fill('#rv-other', '대한약사회 복약지도 안내서');
    await page.getByRole('button', { name: '파일로 저장(.json)' }).click(); await page.waitForTimeout(150);
    const J2 = await exportJson(page);
    ck('확인서 동의(attested true) · 공개 동의(public true) · 참고 자료 종류(health.kr·book·other)와 기타 이름이 파일에 들어감', J2.attested === true && J2.reviewer.public === true && JSON.stringify(J2.refs) === '["health.kr","book","other"]' && J2.refs_other === '대한약사회 복약지도 안내서', J2);
    const m2 = mergeDry(JSON.stringify(J2), 'b.json');
    ck('병합 도구가 확인서(attested)도 받아들임: 확인서 동의 · 검수자 공개 동의 예', m2.code === 0 && m2.out.includes('확인서 동의') && m2.out.includes('공개 동의 예') && m2.out.includes('홍길동 / 새봄약국'), m2.out.slice(0, 300));
    // 연구 이용 동의(선택)와 필수 동의 해제
    await page.check('#rv-c2');
    await page.getByRole('button', { name: '파일로 저장(.json)' }).click(); await page.waitForTimeout(150);
    const J3 = await exportJson(page);
    ck('연구 이용 동의(선택)를 표시하면 consent.research 가 true 가 되고 필수 동의(collect)는 그대로 true', J3.consent.research === true && J3.consent.collect === true && J3.consent.version === VA, J3.consent);
    await page.uncheck('#rv-c1');
    await page.getByRole('button', { name: '파일로 저장(.json)' }).click();
    ck('필수 동의를 다시 해제하면(연구 이용 동의만 남아도) 확인서를 만들지 않음 · 이전 글 상자도 사라짐', sq(await page.locator('[data-review-problems]').innerText()).includes('개인정보 수집·이용 동의(필수)’에 동의해 주세요') && (await page.locator('[data-review-export]').count()) === 0);
    await page.check('#rv-c1');
    await page.getByRole('button', { name: '파일로 저장(.json)' }).click(); await page.waitForTimeout(150);
    ck('확인서 글 상자를 보이면서 상태 알림(role=status)이 같은 자리에 있음', (await page.locator('[data-review-msg]').getAttribute('role')) === 'status' && (await page.locator('#rv-export').getAttribute('readonly')) !== null);
    noErr('판정·내보내기', page); await ctx.close();
  }

  /* ───── 4. 약사법 범위 · 키보드 · 다음 항목 · 목록 보기 ───── */
  {
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review' });
    await page.waitForSelector('[data-review-work]');
    await page.fill('#rv-name', '김약사'); await page.check('#rv-lic'); await page.check('#rv-c1');
    await page.getByRole('button', { name: /^약사법 쉬운 풀이/ }).click(); await page.waitForTimeout(100);
    const [l1, l2] = LAW.slice(0, 2).map((i) => i.id);
    await page.check(`#rv-${l1}-ok`); await page.check(`#rv-${l2}-diff`); await page.fill(`#rv-${l2}-m`, '단서 빠짐');
    ck('약사법 범위의 진행은 53개 기준이고 범위마다 따로 셈(성분 범위는 0/60 그대로)', (await progress(page)).startsWith('판정 2/53') && sq(await page.locator('[role="group"][aria-label="검수 범위"]').innerText()).includes('0/60') && sq(await page.locator('[role="group"][aria-label="검수 범위"]').innerText()).includes('2/53'));
    await page.getByRole('button', { name: '파일로 저장(.json)' }).click(); await page.waitForTimeout(100);
    const J = await exportJson(page);
    ck('약사법 확인서: scope law · 해시 · 항목 id 가 L- 로 시작 · 메모는 다르다에만', J.scope === 'law' && J.scope_hash === BASE.scopes.law.hash && Object.keys(J.answers).every((k) => k.startsWith('L-')) && J.answers[l1].h === LAW[0].h && J.answers[l2].m === '단서 빠짐' && !('m' in J.answers[l1]), J);
    const m = mergeDry(JSON.stringify(J), 'law.json');
    ck('병합 도구가 약사법 확인서도 받아들임(범위 law · 판정 2개)', m.code === 0 && m.out.includes('범위 law') && m.out.includes('판정 2개'), m.out.slice(0, 200));
    await page.getByRole('button', { name: /^성분 한글명·국내 상품명/ }).click(); await page.waitForTimeout(100);
    ck('범위를 바꾸면 이전 범위에서 만든 확인서 글은 사라짐(범위가 섞이지 않게)', (await page.locator('[data-review-export]').count()) === 0 && (await progress(page)).startsWith('판정 0/60'));
    // 키보드: 라디오 묶음 안에서 화살표로 바꿈
    const [a, b] = NAMES.slice(0, 2).map((i) => i.id);
    await page.locator(`#rv-${a}-ok`).focus(); await page.keyboard.press('Space'); await page.keyboard.press('ArrowRight');
    ck('키보드: 판정 묶음에서 Space 로 선택하고 오른쪽 화살표로 다음 판정(다르다)으로 바뀜', (await page.locator(`[data-review-item="${a}"]`).getAttribute('data-verdict')) === 'diff' && (await page.evaluate(() => document.activeElement.id)) === `rv-${a}-diff`, await page.evaluate(() => document.activeElement.id));
    // 다음 안 한 항목
    await page.getByRole('button', { name: '다음 안 한 항목으로' }).click(); await page.waitForTimeout(250);
    ck('"다음 안 한 항목으로": 방금 판정한 항목 다음의 미판정 항목의 첫 판정 단추로 초점이 감', (await page.evaluate(() => document.activeElement.id)) === `rv-${b}-ok`, await page.evaluate(() => document.activeElement.id));
    // 목록 보기: 다르다·모르겠다만
    await page.getByRole('button', { name: /^다르다·모르겠다만/ }).click(); await page.waitForTimeout(100);
    ck('"다르다·모르겠다만" 보기: 다르다로 표시한 항목만 남음', (await page.locator('[data-review-item]').count()) === 1 && (await page.locator(`[data-review-item="${a}"]`).count()) === 1);
    await page.getByRole('button', { name: /^전체/ }).click(); await page.waitForTimeout(100);
    ck('"전체" 보기로 돌아오면 60개', (await page.locator('[data-review-item]').count()) === 60);
    // 글자 수 제한
    await page.fill('#rv-name', 'ㄱ'.repeat(60)); await page.fill(`#rv-${a}-m`, 'ㅏ'.repeat(260));
    ck('입력 한도: 이름 40자 · 메모 200자에서 더 들어가지 않음', (await page.locator('#rv-name').inputValue()).length === 40 && (await page.locator(`#rv-${a}-m`).inputValue()).length === 200);
    noErr('약사법·키보드', page); await ctx.close();
  }

  /* ───── 5. 복사하기 ───── */
  {
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review', perms: ['clipboard-read', 'clipboard-write'] });
    await page.waitForSelector('[data-review-work]');
    await page.fill('#rv-name', '복사약사'); await page.check('#rv-lic'); await page.check('#rv-c1'); await page.check(`#rv-${NAMES[0].id}-ok`);
    await page.getByRole('button', { name: '복사하기' }).click(); await page.waitForTimeout(400);
    const msg = sq(await page.locator('[data-review-msg]').innerText()); const box = await page.locator('#rv-export').inputValue();
    const clip = await page.evaluate(() => (navigator.clipboard && navigator.clipboard.readText ? navigator.clipboard.readText().catch(() => null) : null));
    ck('복사하기: 복사했다는 알림이 나오면 클립보드 내용이 확인서 글과 같고, 못 했다는 알림이면 글 상자가 선택되어 직접 복사할 수 있음', msg.startsWith('복사했습니다') ? clip === box : (msg.startsWith('복사하지 못했습니다') && await page.evaluate(() => { const b = document.getElementById('rv-export'); return document.activeElement === b && b.selectionStart === 0 && b.selectionEnd === b.value.length; })), { msg, same: clip === box });
    noErr('복사(권한 있음)', page); await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review', noClip: true });
    await page.waitForSelector('[data-review-work]');
    await page.fill('#rv-name', '복사약사'); await page.check('#rv-lic'); await page.check('#rv-c1'); await page.check(`#rv-${NAMES[0].id}-ok`);
    await page.getByRole('button', { name: '복사하기' }).click(); await page.waitForTimeout(400);
    const msg = sq(await page.locator('[data-review-msg]').innerText());
    ck('클립보드를 못 쓰는 환경(WebView 등): 오류 없이 글 상자를 선택해 복사를 시도하고, 안 되면 직접 복사하라고 알림', (msg.startsWith('복사했습니다') || msg.startsWith('복사하지 못했습니다')) && (await page.locator('#rv-export').count()) === 1, msg);
    noErr('복사(클립보드 없음)', page); await ctx.close();
  }

  /* ───── 6. 이 기기에 보관 · 지우기 · 저장소를 못 쓸 때 ───── */
  {
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review' });
    await page.waitForSelector('[data-review-work]');
    await page.fill('#rv-name', '보관약사'); await page.fill('#rv-org', '보관약국'); await page.check('#rv-lic'); await page.check('#rv-att'); await page.check('#rv-c1'); await page.check('#rv-c2');
    const [a, b] = NAMES.slice(0, 2).map((i) => i.id);
    await page.check(`#rv-${a}-ok`); await page.check(`#rv-${b}-diff`); await page.fill(`#rv-${b}-m`, '보관되는 메모');
    const raw = await page.evaluate((k) => localStorage.getItem(k), STORE_KEY);
    const S = JSON.parse(raw || '{}');
    ck('입력은 이 기기의 브라우저 보관(localStorage)에 저장되고, 확인서 동의(att)와 동의서 동의(c1·c2)는 저장하지 않음', S.v === 1 && S.rev.name === '보관약사' && S.rev.lic === true && S.att === false && S.c1 === false && S.c2 === false && S.ans.names[a].v === 'ok' && S.ans.names[b].m === '보관되는 메모', S);
    await page.evaluate(() => { history.replaceState(null, '', location.pathname); }); await page.reload(); await toAbout(page); await page.waitForTimeout(200);
    ck('다시 열면 "이어서 판정하기" 단추가 나오고, 누르면 이름·소속·면허 표시·판정·메모가 그대로이며 확인서 동의와 동의서 동의(필수·선택)는 다시 표시해야 함', await (async () => {
      const t = (await page.locator('[data-review-open]').innerText()); await page.locator('[data-review-open]').click(); await page.waitForSelector('[data-review-work]');
      return t.includes('이어서 판정하기') && (await page.inputValue('#rv-name')) === '보관약사' && (await page.inputValue('#rv-org')) === '보관약국' && (await page.isChecked('#rv-lic')) && !(await page.isChecked('#rv-att')) && !(await page.isChecked('#rv-c1')) && !(await page.isChecked('#rv-c2')) && (await progress(page)).startsWith('판정 2/60') && (await page.inputValue(`#rv-${b}-m`)) === '보관되는 메모';
    })());
    await page.getByRole('button', { name: '이 기기에서 모두 지우기' }).click();
    ck('지우기는 두 단계: 먼저 "지울까요?" 확인이 나오고 취소하면 그대로', (await page.getByText('이름·판정·메모가 모두 지워집니다. 지울까요?').count()) === 1 && await (async () => { await page.getByRole('button', { name: '취소' }).click(); return (await progress(page)).startsWith('판정 2/60'); })());
    await page.getByRole('button', { name: '이 기기에서 모두 지우기' }).click(); await page.getByRole('button', { name: '지우기', exact: true }).click(); await page.waitForTimeout(100);
    ck('"지우기"를 누르면 이름·판정·메모가 비워지고 보관 항목도 사라짐', (await page.inputValue('#rv-name')) === '' && !(await page.isChecked('#rv-lic')) && (await progress(page)).startsWith('판정 0/60') && (await page.evaluate((k) => localStorage.getItem(k), STORE_KEY)) === null);
    noErr('보관·지우기', page); await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review', storeFail: true });
    await page.waitForSelector('[data-review-work]');
    await page.fill('#rv-name', '무저장약사'); await page.check('#rv-lic'); await page.check('#rv-c1'); await page.check(`#rv-${NAMES[0].id}-ok`);
    const note = sq(await page.locator('[data-review-saved]').innerText());
    ck('저장소를 못 쓰는 환경: 오류 없이 계속 쓸 수 있고 "이 창을 닫으면 입력이 지워집니다 · 진행 상황 파일로 내보내 두세요" 안내가 나옴', note.includes('저장을 막고 있어 이 창을 닫으면 입력이 지워집니다') && note.includes('진행 상황 파일') && (await progress(page)).startsWith('판정 1/60'), note);
    await page.getByRole('button', { name: '파일로 저장(.json)' }).click();
    ck('저장소를 못 써도 확인서는 내보낼 수 있음', (await page.locator('#rv-export').count()) === 1);
    noErr('저장소 사용 불가', page); await ctx.close();
  }
  {
    // 보관된 값이 낡았거나 깨졌을 때: 내용 표시(h)가 다른 판정은 세지 않고 알림, 이상한 열쇠·값은 무시
    const seed = { v: 1, rev: { name: '낡은약사', org: '', pub: false, lic: true }, refs: ['health.kr', 'evil'], other: '', att: true, c1: true, c2: true, scope: 'names',
      ans: { names: { [NAMES[0].id]: { v: 'ok', h: 'ffffffffff' }, [NAMES[1].id]: { v: 'diff', h: NAMES[1].h, m: '살아 있는 메모' }, 'X-bogus': { v: 'ok', h: NAMES[2].h }, [NAMES[3].id]: { v: 'hack', h: NAMES[3].h } }, 'not a scope!': { 'N-1': { v: 'ok', h: 'x' } } } };
    const seedRaw = JSON.stringify(seed).replace('"ans":{"names":{', '"ans":{"names":{"__proto__":{"v":"ok","h":"aaaaaaaaaa"},');
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review', seedRaw });
    await page.waitForSelector('[data-review-work]');
    ck('낡은·깨진 보관 내용: 내용이 바뀐 항목 1개는 "다시 판정" 알림만 하고 세지 않으며, 맞는 판정 1개만 인정(진행 1/60), 이상한 열쇠·판정값은 무시', (await progress(page)).startsWith('판정 1/60') && sq(await page.locator('[data-review-stale]').innerText()).includes('내용이 바뀐 항목 1개') && (await page.locator(`[data-review-item="${NAMES[1].id}"]`).getAttribute('data-verdict')) === 'diff' && (await page.locator(`[data-review-item="${NAMES[0].id}"]`).getAttribute('data-verdict')) === '' && (await page.locator(`[data-review-item="${NAMES[3].id}"]`).getAttribute('data-verdict')) === '', await progress(page));
    ck('낡은 보관 내용의 확인서 동의(att true)와 동의서 동의(c1·c2 true)는 되살리지 않고, 알 수 없는 참고 자료 종류는 걸러냄', !(await page.isChecked('#rv-att')) && !(await page.isChecked('#rv-c1')) && !(await page.isChecked('#rv-c2')) && (await page.isChecked('#rv-ref-health\\.kr')) && (await page.locator('#rv-ref-evil').count()) === 0);
    await page.check('#rv-c1');
    await page.getByRole('button', { name: '파일로 저장(.json)' }).click(); await page.waitForTimeout(100);
    const J = await exportJson(page);
    ck('낡은 판정은 확인서에 들어가지 않음(현재 내용과 같은 판정만)', Object.keys(J.answers).length === 1 && J.answers[NAMES[1].id].h === NAMES[1].h, Object.keys(J.answers));
    noErr('낡은 보관 내용', page); await ctx.close();
  }

  /* ───── 7. 불러오기 ───── */
  {
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review' });
    await page.waitForSelector('[data-review-work]');
    await page.locator('[data-review-import] summary').click();
    const J = JSON.parse(EXPORTED); J.attested = true; J.reviewer.public = true;
    await page.fill('#rv-paste', JSON.stringify(J)); await page.getByRole('button', { name: '불러오기', exact: true }).click(); await page.waitForTimeout(150);
    const im = sq(await page.locator('[data-review-import-msg]').innerText());
    ck('내보낸 파일의 글을 붙여 넣어 불러오면 판정 4개가 들어오고 진행이 4/60 이 됨(이름·소속도 채워짐)', im.includes('판정 4개를 불러왔습니다') && (await progress(page)).startsWith('판정 4/60') && (await page.inputValue('#rv-name')) === '홍길동' && (await page.inputValue('#rv-org')) === '새봄약국', im);
    ck('불러와도 면허 표시와 확인서 동의·동의서 동의는 가져오지 않음(이 화면에서 직접 다시 표시) — 파일에 attested true · consent(collect true)가 있어도 해제 상태', !(await page.isChecked('#rv-lic')) && !(await page.isChecked('#rv-att')) && !(await page.isChecked('#rv-c1')) && !(await page.isChecked('#rv-c2')) && im.includes('직접 다시 표시') && 'consent' in J && J.consent.collect === true);
    const T = JSON.parse(EXPORTED); const first = Object.keys(T.answers)[0]; T.answers[first].h = '0000000000'; T.answers['N-999999'] = { v: 'ok', h: 'abc' }; T.answers['B-1-zzzzzz'] = { v: 'maybe', h: 'abc' };
    await page.getByRole('button', { name: '이 기기에서 모두 지우기' }).click(); await page.getByRole('button', { name: '지우기', exact: true }).click();
    await page.fill('#rv-paste', JSON.stringify(T)); await page.getByRole('button', { name: '불러오기', exact: true }).click(); await page.waitForTimeout(150);
    const im2 = sq(await page.locator('[data-review-import-msg]').innerText());
    ck('내용 표시(h)가 다른 판정은 반영하지 않고 · 알 수 없는 항목·판정값은 건너뛰며 그 수를 알림', im2.includes('판정 3개를 불러왔습니다') && im2.includes('반영하지 않은 1개') && im2.includes('알 수 없는 항목 2개는 건너뜀') && (await progress(page)).startsWith('판정 3/60'), im2);
    for (const [txt, want] of [['{"schema":"x"}', '이 앱에서 내보낸 확인서'], ['{ 깨진', '글을 읽지 못했습니다'], ['', '붙여 넣은 글이 없습니다'], [JSON.stringify({ ...JSON.parse(EXPORTED), scope: 'nothing' }), '이 화면에 없는 검수 범위']]) {
      await page.fill('#rv-paste', txt); await page.getByRole('button', { name: '불러오기', exact: true }).click(); await page.waitForTimeout(80);
      ck(`잘못된 입력 → 알림(${want}) 하고 판정은 그대로(3/60)`, sq(await page.locator('[data-review-import-msg]').innerText()).includes(want) && (await progress(page)).startsWith('판정 3/60'), sq(await page.locator('[data-review-import-msg]').innerText()));
    }
    const f = path.join(TMP, 'import.json'); fs.writeFileSync(f, EXPORTED, 'utf8');
    await page.setInputFiles('#rv-file', f); await page.waitForTimeout(300);
    ck('파일 고르기로도 불러옴(같은 항목은 불러온 파일이 우선 → 4/60)', sq(await page.locator('[data-review-import-msg]').innerText()).includes('판정 4개를 불러왔습니다') && (await progress(page)).startsWith('판정 4/60'), sq(await page.locator('[data-review-import-msg]').innerText()));
    noErr('불러오기', page); await ctx.close();
  }

  /* ───── 7-1. 동의서 화면 · 동의서가 없는 판 · 연구 이용 동의가 없는 판 ───── */
  const fillAll = async (page, o = {}) => {
    await page.fill('#rv-name', o.name || '시험약사'); await page.fill('#rv-org', o.org || '시험약국'); await page.check('#rv-lic');
    await page.check(`#rv-${NAMES[0].id}-ok`); await page.check(`#rv-${NAMES[1].id}-diff`); await page.fill(`#rv-${NAMES[1].id}-m`, o.memo || '시험 메모');
  };
  const sendBtn = (page) => page.locator('[data-review-send]');
  const sendMsg = async (page) => ({ text: sq(await page.locator('[data-review-send-msg]').innerText()), kind: await page.locator('[data-review-send-msg]').getAttribute('data-kind') });
  const problemsText = async (page) => ((await page.locator('[data-review-problems]').count()) ? sq(await page.locator('[data-review-problems]').innerText()) : '');
  {
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review' });
    await page.waitForSelector('[data-review-work]');
    const c1 = sq(await page.locator('[data-review-consent="c1"]').innerText()); const c2 = sq(await page.locator('[data-review-consent="c2"]').innerText());
    ck('동의서(필수): 수집 항목(면허번호·사본·연락처는 받지 않음) · 목적 · 보유 기간 · 받는 곳 · 국외 이전 · 거부권과 불이익 · 이름 공개 · 삭제 요청이 있고, 빌드에 넣은 값(보유 기간·국외 이전 안내)이 그대로 보임',
      ['개인정보 수집·이용 동의 (필수)', '수집하는 항목', '면허번호·면허 사본·연락처는 받지 않습니다', '수집·이용 목적', '보유·이용 기간', INTAKES.A.retention, '받는 곳과 보관 장소', '국외 이전 안내', INTAKES.A.overseas, '동의하지 않을 권리와 불이익', '확인서를 내보내거나 보낼 수 없어', '이름·소속 공개', '삭제 요청'].every((t) => c1.includes(t)), c1.slice(0, 160));
    ck('동의서(선택, 연구 이용): 연구 목적(I-CVI) · 이용 정보(판정·가명 번호, 이름·소속·메모는 제외) · 연구책임자 · 보유 기간 · IRB 승인 · 거부권(불이익 없음) · 철회가 있고 빌드에 넣은 연구 값이 그대로 보임',
      ['연구 이용 동의 (선택)', '연구 목적', 'I-CVI', '이름·소속·메모는 분석에 넣지 않습니다', INTAKES.A.research.responsible, INTAKES.A.research.retention, INTAKES.A.research.irb, '검수 참여에는 불이익이 없습니다', '철회'].every((t) => c2.includes(t)), c2.slice(0, 160));
    ck('동의 칸 두 개(필수 · 선택)는 처음에 모두 해제 상태이고 접근 가능한 이름이 있음', !(await page.isChecked('#rv-c1')) && !(await page.isChecked('#rv-c2')) && (await page.getByRole('checkbox', { name: /개인정보 수집·이용에 동의합니다/ }).count()) === 1 && (await page.getByRole('checkbox', { name: /연구 이용에 동의합니다/ }).count()) === 1);
    const ver = sq(await page.locator('[data-review-consent-version]').innerText());
    ck('동의서 판 번호가 화면에 보이고 빌드가 정한 판(시험용 값으로 따로 계산한 값)과 같음', ver.includes('동의서 판 ' + VA) && !ver.includes('묻지 않습니다'), { ver, VA });
    const hs = (await page.locator('[data-review-work] h4').allInnerTexts()).map(sq);
    ck('단계 제목: 동의서가 확인서 보내기·내보내기 앞에 있고 번호가 1~6으로 이어짐', JSON.stringify(hs) === JSON.stringify(['1. 검수자 정보', '2. 검수 범위와 참고한 자료', '3. 항목마다 판정', '4. 동의서 (읽고 동의)', '5. 확인서 보내기 · 내보내기', '6. 이어서 하기 · 불러오기 · 지우기']), hs);
    ck('‘MedIT로 보내기’ 단추가 있고 처음에는 눌러도 되는 상태', (await sendBtn(page).count()) === 1 && (await sendBtn(page).isEnabled()) && sq(await sendBtn(page).innerText()) === 'MedIT로 보내기');
    noErr('동의서 화면(A)', page); await ctx.close();
  }
  {
    // B판: 필수 값만(보내기 주소 없음 · 연구 이용 없음)
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review', build: 'B' });
    await page.waitForSelector('[data-review-work]');
    const sec = sq(await page.locator('#about-pharmacist').innerText()); const verB = sq(await page.locator('[data-review-consent-version]').innerText());
    ck('필수 값만 채운 판(B): 연구 이용 동의 칸이 없고 판 번호 옆에 연구 이용을 묻지 않는다는 안내 · 보내기 단추·보내기 결과 칸 없음 · 단계 제목 “확인서 내보내기”', (await page.locator('#rv-c2').count()) === 0 && (await page.locator('[data-review-consent="c2"]').count()) === 0 && verB.includes('연구 이용 동의를 묻지 않습니다') && (await sendBtn(page).count()) === 0 && (await page.locator('[data-review-send-msg]').count()) === 0 && (await page.getByRole('heading', { name: '5. 확인서 내보내기' }).count()) === 1, verB);
    ck('B판 카드 안내: “이 화면은 서버로 아무것도 보내지 않습니다” · ‘MedIT로 보내기’ 말 없음 · 동의서는 필수만 안내', sec.includes('이 화면은 서버로 아무것도 보내지 않습니다') && !sec.includes('MedIT로 보내기') && sec.includes('개인정보 수집·이용 동의는 필수') && !sec.includes('연구 이용 동의는 선택'), sec.slice(0, 200));
    ck('B판의 동의서 판은 시험용 값으로 따로 계산한 값(VB)이고 A판과 다름(값이 다르면 판이 달라짐)', verB.includes('동의서 판 ' + VB) && VA !== VB, { VA, VB });
    await fillAll(page); await page.check('#rv-c1');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '파일로 저장(.json)' }).click()]);
    const JB = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    ck('B판 확인서: consent = { version: VB, collect: true, research: false(묻지 않음) }', JB.consent && JB.consent.version === VB && JB.consent.collect === true && JB.consent.research === false, JB.consent);
    const mB = mergeDry(JSON.stringify(JB), 'consent_b.json');
    ck('운영자 병합 도구가 consent 칸이 든 확인서도 받아들임(알 수 없는 칸은 무시)', mB.code === 0 && mB.out.includes('시험약사'), mB.out.slice(0, 200));
    noErr('동의서 화면(B)', page); await ctx.close();
  }
  {
    // C판: 동의서 값이 비어 있음 → 확인서를 내보내지도 보내지도 못함
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review', build: 'C' });
    await page.waitForSelector('[data-review-work]');
    let seen = 0; page.on('download', () => { seen++; });
    await fillAll(page);
    ck('동의서가 준비되지 않은 판(C): 동의서 자리에 “준비되지 않았다”는 안내만 있고 동의 칸·보내기 단추는 없음', (await page.locator('[data-review-consent-pending]').count()) === 1 && (await page.locator('#rv-c1').count()) === 0 && (await page.locator('[data-review-consent]').count()) === 0 && (await sendBtn(page).count()) === 0 && (await page.getByRole('heading', { name: '5. 확인서 내보내기' }).count()) === 1);
    await page.getByRole('button', { name: '파일로 저장(.json)' }).click(); await page.waitForTimeout(500);
    const pf = await problemsText(page);
    ck('C판: 이름·면허·판정을 모두 채워도 파일로 저장하지 못함(“동의서가 아직 준비되지 않아…” 알림) · 내려받기도 글 상자도 없음', pf.includes('동의서가 아직 준비되지 않아') && seen === 0 && (await page.locator('[data-review-export]').count()) === 0, { pf, seen });
    await page.getByRole('button', { name: '복사하기' }).click(); await page.waitForTimeout(300);
    ck('C판: 복사하기도 막힘(복사했다는 알림도 글 상자도 없음)', (await problemsText(page)).includes('동의서가 아직 준비되지 않아') && (await page.locator('[data-review-export]').count()) === 0 && sq(await page.locator('[data-review-msg]').innerText()) === '');
    const secC = sq(await page.locator('#about-pharmacist').innerText());
    ck('C판: 입력한 판정은 그대로 남고(2/60) 카드 안내에도 동의서가 아직 준비되지 않았다고 나옴', (await progress(page)).startsWith('판정 2/60') && secC.includes('동의서가 아직 준비되지 않아') && secC.includes('이 화면은 서버로 아무것도 보내지 않습니다'), secC.slice(0, 160));
    noErr('동의서 없는 판(C)', page); await ctx.close();
  }
  {
    // 보내기 주소가 어느 파일에 들어가는지: 독립 실행·설치형 웹앱에만(안드로이드 앱은 인터넷 권한이 없고 공유 페이지는 바깥 연결이 막힘)
    const has = (f) => fs.readFileSync(path.join(DISTS.A, f), 'utf8').includes(FAKE_EP);
    ck('보내기 주소는 독립 실행(MedTerm-KR_react.html)·설치형 웹앱(pwa/index.html)에만 있고 앱(MedTerm-KR_app.html)·공유 페이지(artifact.html)·나란히 보기 두 파일에는 없음', has('MedTerm-KR_react.html') && has('pwa/index.html') && !has('MedTerm-KR_app.html') && !has('artifact.html') && !has('MedTerm-KR_showcase.html') && !has('showcase_artifact.html'));
    ck('주소가 비어 있는 시험용 빌드(B·C)에는 어느 파일에도 주소가 없음', ['MedTerm-KR_react.html', 'pwa/index.html', 'MedTerm-KR_app.html'].every((f) => !fs.readFileSync(path.join(DISTS.B, f), 'utf8').includes('AKfycb') && !fs.readFileSync(path.join(DISTS.C, f), 'utf8').includes('AKfycb')));
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review', file: 'MedTerm-KR_app.html' });
    await page.waitForSelector('[data-review-work]');
    const verApp = sq(await page.locator('[data-review-consent-version]').innerText()); const secApp = sq(await page.locator('#about-pharmacist').innerText());
    ck('설치형 앱(MedTerm-KR_app.html): 동의서는 같은 판(VA)으로 보이고 보내기 단추는 없음(파일 전달만) · “서버로 아무것도 보내지 않습니다” 문구', verApp.includes(VA) && (await sendBtn(page).count()) === 0 && secApp.includes('이 화면은 서버로 아무것도 보내지 않습니다') && (await page.locator('#rv-c1').count()) === 1 && (await page.locator('#rv-c2').count()) === 1, { verApp, send: await sendBtn(page).count() });
    await fillAll(page); await page.check('#rv-c1');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '파일로 저장(.json)' }).click()]);
    const JA = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    ck('설치형 앱에서 만든 확인서에도 동의 기록(판 VA · 필수 true · 연구 false)이 들어 있음', JA.consent && JA.consent.version === VA && JA.consent.collect === true && JA.consent.research === false, JA.consent);
    noErr('설치형 앱(보내기 없음)', page); await ctx.close();
  }

  /* ───── 7-2. ‘MedIT로 보내기’: 가짜 접수 주소를 가로채 답한다(기본 답은 진짜 앱 스크립트 코드) ───── */
  const hook = async (page, handler) => {
    const reqs = [];
    await page.route(FAKE_EP, async (route) => {
      const req = route.request();
      const r = { method: req.method(), ct: req.headers()['content-type'] || '', body: req.postData() || '', cookie: req.headers().cookie || '', referer: req.headers().referer || '' };
      reqs.push(r);
      await handler(route, r, reqs.length);
    });
    return reqs;
  };
  const CORS = { 'access-control-allow-origin': '*' };
  const reply = (route, obj, status = 200) => route.fulfill({ status, contentType: 'application/json; charset=utf-8', headers: CORS, body: JSON.stringify(obj) });
  // 누르고 → 요청이 실제로 나갈 때까지 기다리고 → 단추가 다시 열리면서 기대한 글이 나올 때까지 기다린다(이전 결과 글을 새 결과로 착각하지 않게).
  const sendWait = async (page, want, reqs) => {
    const n = reqs.length + 1;
    await sendBtn(page).click();
    const t0 = Date.now(); while (reqs.length < n && Date.now() - t0 < 8000) await page.waitForTimeout(20);
    await page.waitForFunction((w) => { const b = document.querySelector('[data-review-send]'); const e = document.querySelector('[data-review-send-msg]'); return !!b && !b.disabled && !!e && e.textContent.includes(w); }, want, { timeout: 8000 });
    return sendMsg(page);
  };
  // 일부러 연결을 끊거나 막은 시험에서는 브라우저가 콘솔에 네트워크 오류를 남긴다 — 그것만 허용하고 다른 오류·차단된 요청은 실패로 센다.
  const onlyNetErrs = (label, page) => ck(label + ': 콘솔의 오류는 일부러 만든 네트워크 오류(연결 실패·CORS·500)뿐이고 페이지 오류·가로채지 않은 외부 요청은 없음', page.errs.every((e) => /Failed to load resource|blocked by CORS|net::ERR_|Failed to fetch/.test(e)) && page.failedUrls.length === 0, { errs: page.errs.slice(0, 4), ext: page.failedUrls.slice(0, 3) });
  {
    let mode = { open: true, version: VA }; let last = null;
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review' });
    const reqs = await hook(page, (route, r) => { last = serverSays(r.body, mode.version, { open: mode.open }); return reply(route, last.parsed); });
    await page.waitForSelector('[data-review-work]');
    await fillAll(page, { name: '가짜약사S', org: '가짜약국S', memo: '서버로 간 메모' });
    await page.check('#rv-att'); await page.waitForTimeout(300);
    ck('보내기 단추를 누르기 전에는 접수 주소로 요청이 한 번도 나가지 않음(입력·판정·동의 표시만으로는 안 나감)', reqs.length === 0);
    await sendBtn(page).click(); await page.waitForTimeout(300);
    ck('동의하지 않고 보내려 하면 보내지 않고(요청 0건) 빠진 것(개인정보 수집·이용 동의)을 알림 · 보내기 결과 칸은 비어 있음', reqs.length === 0 && (await problemsText(page)).includes('개인정보 수집·이용 동의(필수)’에 동의해 주세요') && (await sendMsg(page)).text === '', await problemsText(page));
    await page.check('#rv-c1'); await page.check('#rv-c2');
    const m1 = await sendWait(page, '보냈습니다', reqs);
    const env = reqs.length ? JSON.parse(reqs[0].body) : {}; const sent = env.text ? JSON.parse(env.text) : {};
    ck('보내면 요청이 정확히 한 번, POST(사전 확인 요청 없음) · 본문은 text/plain · 쿠키·참조 주소 없음', reqs.length === 1 && reqs[0].method === 'POST' && reqs[0].ct.startsWith('text/plain') && reqs[0].cookie === '' && reqs[0].referer === '', reqs.map((r) => [r.method, r.ct, r.cookie, r.referer]));
    ck('본문 = { kind: medterm-kr-submit/1, text: 확인서 글 } 이고, 글 안에 동의 기록(판 VA · 필수 true · 연구 true · 오늘 날짜)과 입력한 이름·판정이 들어 있음', env.kind === 'medterm-kr-submit/1' && sent.schema === 'medterm-kr-review/1' && sent.consent && sent.consent.version === VA && sent.consent.collect === true && sent.consent.research === true && sent.consent.date === TODAY && sent.reviewer.name === '가짜약사S' && sent.attested === true, sent.consent);
    ck('진짜 앱 스크립트(가짜 구글 장치 위)가 이 글을 받아들임: 응답 ok · 시트 ‘응답’에 한 줄(확인서 글이 보낸 것과 같음 · 동의 · 동의 · 면허확인 칸 비어 있음 · 접수 경로 앱 · 동의서 판 VA · 앱 판)', !!last && last.parsed && last.parsed.ok === true && last.rows.length === 2 && JSON.stringify(JSON.parse(last.rows[1][1])) === JSON.stringify(sent) && last.rows[1][2] === '동의' && last.rows[1][3] === '동의' && last.rows[1][4] === '' && last.rows[1][5] === '앱' && last.rows[1][6] === VA && last.rows[1][7] === VERSION, last && { parsed: last.parsed, row: last.rows[1] && last.rows[1].slice(2) });
    ck('받았다는 답을 읽으면 “보냈습니다…(운영자가 면허를 확인한 뒤 합침)” 알림(kind=ok) · 단추는 다시 눌러도 되는 상태 · 서버가 돌려준 글은 화면에 옮기지 않음', m1.kind === 'ok' && m1.text.includes('운영자(MedIT)가 약사 면허를 확인한 뒤') && (await sendBtn(page).isEnabled()) && sq(await sendBtn(page).innerText()) === 'MedIT로 보내기', m1);
    ck('보내기 결과 칸은 알림 영역(role=status · aria-live=polite)', (await page.locator('[data-review-send-msg]').getAttribute('role')) === 'status' && (await page.locator('[data-review-send-msg]').getAttribute('aria-live')) === 'polite');
    // 서버가 받지 않는 경우(진짜 서버 코드): 접수가 닫혀 있음 · 동의서 판이 다름
    mode = { open: false, version: VA };
    const m2 = await sendWait(page, '지금은 앱으로 확인서를 받지 않는', reqs);
    ck('접수가 닫혀 있으면(서버 코드 closed) “지금은 앱으로 확인서를 받지 않는 중… 파일로 저장해 전달” 안내(kind=rejected)', m2.kind === 'rejected' && m2.text.includes('‘파일로 저장’') && last.parsed.code === 'closed' && last.rows.length === 0, m2);
    mode = { open: true, version: 'c-ffffffffff' };
    const m3 = await sendWait(page, '동의서가 운영자가 받는 동의서와 달라', reqs);
    ck('운영자가 연 동의서 판이 다르면(서버 코드 version) “앱을 새로 고쳐 최신 판으로 열고 동의서를 다시 읽고 동의” 안내 · 시트에 적히지 않음', m3.kind === 'rejected' && m3.text.includes('앱을 새로 고쳐') && last.parsed.code === 'version' && last.rows.length <= 1, { m3, parsed: last.parsed, rows: last.rows.length });
    ck('다른 단추(복사하기)를 누르면 보내기 결과 칸이 비워짐(오래된 결과가 남지 않게)', await (async () => { await page.getByRole('button', { name: '복사하기' }).click(); await page.waitForTimeout(200); return (await sendMsg(page)).text === ''; })());
    noErr('보내기(진짜 서버 코드)', page); await ctx.close();
  }
  {
    // 서버가 보낼 수 있는 모든 거부 코드 → 운영자가 정한 문구로만 알림(서버 글·HTML 은 화면에 옮기지 않음)
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review' });
    let nextBody = () => ({ ok: false, code: 'server', msg: 'x' });
    const reqs = await hook(page, (route) => reply(route, nextBody()));
    await page.waitForSelector('[data-review-work]');
    await fillAll(page); await page.check('#rv-c1');
    const REJ = [['closed', '지금은 앱으로 확인서를 받지 않는'], ['version', '동의서가 운영자가 받는 동의서와 달라'], ['no_consent', '동의 표시가 확인되지 않아'], ['draft', '동의서가 확정되기 전'], ['invalid', '형식 검사를 통과하지 못했습니다'], ['bad_request', '형식 검사를 통과하지 못했습니다'],
      ['too_large', '너무 커서 받지 못했습니다'], ['full', '접수 칸이 가득 차서'], ['busy', '다른 확인서를 처리하는 중'], ['server', '운영자 쪽 오류'], ['뭔지-모를-코드', '알 수 없는 응답']];
    const bad = [];
    for (const [code, want] of REJ) {
      nextBody = () => ({ ok: false, code, msg: '<b>SECRET-SERVER-TEXT</b>' });
      const m = await sendWait(page, want, reqs);
      if (m.kind !== 'rejected' || m.text.includes('SECRET-SERVER-TEXT') || (await page.locator('[data-review-send-msg] b').count()) !== 0) bad.push([code, m]);
    }
    ck(`서버 거부 코드 ${REJ.length}가지(closed · version · no_consent · draft · invalid · bad_request · too_large · full · busy · server · 모르는 코드)마다 정해진 안내(kind=rejected)가 나오고 서버가 보낸 글·HTML 은 화면에 없음`, bad.length === 0 && reqs.length === REJ.length, bad);
    const noWay = [];
    for (const [code, want] of REJ.filter(([c]) => ['closed', 'invalid', 'too_large', 'server', 'busy'].includes(c))) {
      nextBody = () => ({ ok: false, code });
      const m = await sendWait(page, want, reqs);
      if (!(m.text.includes('‘파일로 저장’') || m.text.includes('다시 눌러'))) noWay.push([code, m.text]);
    }
    ck('받지 못했다는 안내에는 항상 다음 길(‘파일로 저장’으로 전달하거나 다시 누르기)이 함께 나옴(막다른 길이 없음)', noWay.length === 0, noWay);
    noErr('보내기 거부 코드', page); await ctx.close();
  }
  {
    // 받았는지 확인하지 못하는 경우: 읽을 수 없는 답 · HTTP 오류 · 연결 실패 · 브라우저가 답을 막음(CORS) → 솔직하게 “확인하지 못했다”(보내졌을 수도 있음)
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review' });
    let how = null;
    const reqs = await hook(page, (route) => how(route));
    await page.waitForSelector('[data-review-work]');
    await fillAll(page); await page.check('#rv-c1');
    const CASES = [
      ['HTML 로그인 화면이 돌아옴(200)', (route) => route.fulfill({ status: 200, contentType: 'text/html', headers: CORS, body: '<html><body>Sign in</body></html>' })],
      ['서버 오류 페이지(500)', (route) => route.fulfill({ status: 500, contentType: 'text/html', headers: CORS, body: '<html>Error</html>' })],
      ['JSON 이지만 ok 가 true 가 아님({"ok":"yes"})', (route) => reply(route, { ok: 'yes' })],
      ['JSON 이 아닌 글', (route) => route.fulfill({ status: 200, contentType: 'text/plain', headers: CORS, body: 'ok' })],
      ['연결 실패(네트워크 오류)', (route) => route.abort('failed')],
    ];
    const bad = [];
    for (const [tag, fn] of CASES) {
      how = fn;
      const m = await sendWait(page, '받았다는 답을 확인하지 못했습니다', reqs);
      if (m.kind !== 'unknown' || !m.text.includes('받았을 수도, 못 받았을 수도') || !m.text.includes('다시 눌러 보내셔도 됩니다') || m.text.includes('보냈습니다.')) bad.push([tag, m]);
    }
    ck(`받았는지 확인하지 못하는 경우 ${CASES.length}가지(로그인 화면 · 500 · ok 아님 · JSON 아님 · 연결 실패)는 모두 “보냈다”고 하지 않고 “확인하지 못했습니다 · 운영자가 받았을 수도 못 받았을 수도 · 다시 눌러도 됨(가장 나중 것만 반영) · 파일로 저장” 안내(kind=unknown)`, bad.length === 0 && reqs.length === CASES.length, bad);
    onlyNetErrs('보내기 확인 불가', page); await ctx.close();
  }
  {
    // 브라우저가 답을 막는 경우(답에 CORS 허용 표시가 없음): 시험이 가로채 만든 답(route.fulfill)에는 플레이라이트가 허용 표시를 스스로 붙여 막히지 않는다.
    // 그래서 진짜 브라우저 검사를 받도록 요청을 내 컴퓨터의 임시 HTTPS 서버(허용 표시 없음 · 시험 때만 만든 인증서)로 돌린다 — 서버는 받았고 브라우저만 답을 못 읽는 상황.
    const key = path.join(TMP, 'cors_key.pem'); const crt = path.join(TMP, 'cors_crt.pem');
    const ossl = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
    if (ossl.status !== 0) { console.log('SKIP 브라우저 CORS 막힘 시험: openssl 로 시험용 인증서를 만들지 못해 건너뜀 → ' + String(ossl.stderr || ossl.error || '').slice(-120)); } else {
      const hits = [];
      const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(crt) }, (req, res) => {
        let n = 0; req.on('data', (d) => { n += d.length; });
        req.on('end', () => { hits.push({ method: req.method, origin: req.headers.origin || '', ct: req.headers['content-type'] || '', n }); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); });
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      try {
        const { ctx, page } = await open(browser, 1280, 900, { hash: 'review', ignoreHttps: true });
        await page.route(FAKE_EP, (route) => route.continue({ url: `https://127.0.0.1:${server.address().port}/exec` }));
        await page.waitForSelector('[data-review-work]');
        await fillAll(page); await page.check('#rv-c1');
        await sendBtn(page).click();
        const t0 = Date.now(); while (hits.length < 1 && Date.now() - t0 < 8000) await page.waitForTimeout(20);
        await page.waitForFunction(() => { const b = document.querySelector('[data-review-send]'); const e = document.querySelector('[data-review-send-msg]'); return !!b && !b.disabled && !!e && e.textContent.includes('받았다는 답을 확인하지 못했습니다'); }, null, { timeout: 8000 });
        const m = await sendMsg(page);
        ck('브라우저가 답을 막으면(CORS 허용 표시 없음 · 서버는 요청을 받음: POST 1건·사전 확인 요청 없음·text/plain) “보냈다”고 하지 않고 “확인하지 못했습니다 · 받았을 수도 못 받았을 수도 · 다시 눌러도 됨”(kind=unknown)', hits.length === 1 && hits[0].method === 'POST' && hits[0].ct.startsWith('text/plain') && hits[0].origin === 'null' && m.kind === 'unknown' && m.text.includes('받았을 수도, 못 받았을 수도') && m.text.includes('다시 눌러 보내셔도 됩니다') && !m.text.includes('보냈습니다.') && (await sendBtn(page).isEnabled()), { hits, m });
        onlyNetErrs('보내기 CORS 막힘', page); await ctx.close();
      } finally { server.close(); }
    }
  }
  {
    // 보내는 중에는 단추가 잠기고 두 번 눌러도 한 번만 나감 · 연결이 없으면 보내지 않음 · 시간이 오래 걸리면 중단
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review' });
    const reqs = await hook(page, async (route) => { await new Promise((r) => setTimeout(r, 900)); await reply(route, { ok: true, n: 1, at: '2026-11-07 12:00' }); });
    await page.waitForSelector('[data-review-work]');
    await fillAll(page); await page.check('#rv-c1');
    await sendBtn(page).click();
    await page.waitForFunction(() => { const b = document.querySelector('[data-review-send]'); return !!b && b.disabled && b.textContent.includes('보내는 중'); }, null, { timeout: 4000 });
    await sendBtn(page).click({ force: true, timeout: 800 }).catch(() => {});
    await page.waitForFunction(() => { const e = document.querySelector('[data-review-send-msg]'); return !!e && e.textContent.includes('보냈습니다'); }, null, { timeout: 8000 });
    ck('보내는 중에는 단추가 잠기고(“보내는 중…”) 그 사이 다시 눌러도 요청은 한 번만 나가며, 끝나면 다시 눌러도 되는 상태', reqs.length === 1 && (await sendBtn(page).isEnabled()) && sq(await sendBtn(page).innerText()) === 'MedIT로 보내기', reqs.length);
    await ctx.setOffline(true);
    await sendBtn(page).click(); await page.waitForTimeout(400);
    const mo = await sendMsg(page);
    ck('인터넷 연결이 없으면(오프라인) 요청을 보내지 않고 “연결한 뒤 다시 눌러 주세요 · 입력한 내용은 이 기기에 남아 있습니다” 안내(kind=offline)', reqs.length === 1 && mo.kind === 'offline' && mo.text.includes('연결한 뒤 다시 눌러 주세요') && mo.text.includes('이 기기에 남아 있습니다'), { mo, n: reqs.length });
    noErr('보내는 중·오프라인', page); await ctx.close();
  }
  {
    // 시간 초과: 가짜 시계로 25초를 건너뛴다(답이 영영 오지 않는 서버)
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review', clock: true });
    const reqs = await hook(page, () => new Promise(() => {}));
    await page.waitForSelector('[data-review-work]');
    await fillAll(page); await page.check('#rv-c1');
    await sendBtn(page).click(); await page.waitForTimeout(300);
    await page.clock.fastForward(26000);
    await page.waitForFunction(() => { const e = document.querySelector('[data-review-send-msg]'); return !!e && e.textContent.includes('시간이 오래 걸려 중단했습니다'); }, null, { timeout: 8000 });
    const mt = await sendMsg(page);
    ck('답이 영영 오지 않으면 25초 뒤 중단하고 “시간이 오래 걸려 중단 · 운영자가 받았을 수도 못 받았을 수도 · 다시 눌러도 됨” 안내(kind=unknown) · 단추는 다시 열림', reqs.length === 1 && mt.kind === 'unknown' && mt.text.includes('받았을 수도, 못 받았을 수도') && (await sendBtn(page).isEnabled()), { mt, n: reqs.length });
    noErr('보내기 시간 초과', page); await ctx.close();
  }

  /* ───── 8. 검수 상태(2·3단계) 표시: 빌드가 담은 현황을 그대로 보여 줌 ───── */
  const stat = (sid, o) => ({ n: BASE.scopes[sid].n, answered: 0, confirmed: 0, issue: 0, unsure: 0, need_recheck: 0, attested_confirmed: 0, stage2: false, stage3: false, reviewers: [], ...o });
  const inject = (status, asof) => { const r = JSON.parse(JSON.stringify(BASE)); r.status = status; r.asof = asof; return r; };
  {
    const { ctx, page } = await open(browser, 1280, 900);
    await toAbout(page);
    const stg = await stages(page); const rev = sq(await page.locator('#about-review').innerText());
    ck('아무도 참여하지 않은 현황: 1단계 했음 · 2단계 아직 · 3단계 아직(‘약사 검수 전 초안’), 진행 목록·확인한 약사 줄 없음, 제목은 2026-11-06 기준', stg.length === 3 && stg[0].includes('했음') && stg[1].startsWith('2단계') && stg[1].includes('아직') && stg[2].startsWith('3단계') && stg[2].includes('아직') && stg[2].includes('약사 검수 전 초안')
      && (await page.locator('#about-review [data-review-progress]').count()) === 0 && (await page.locator('#about-review [data-review-people]').count()) === 0 && rev.includes('검수 상태 (2026-11-06 기준)') && rev.includes('약사 자격자의 검수는 받지 않았습니다') && !rev.includes('일부만 이루어졌습니다'), stg);
    ck('2단계 설명: 앱의 ‘약사 검수 참여’ 화면도 안내하고, 면허를 확인한 표시만 세며 이름은 공개에 동의한 경우만 나온다고 알림', stg[1].includes('약사 검수 참여’ 화면') && stg[1].includes('운영자가 약사 면허를 확인한 표시만 셉니다') && stg[1].includes('공개에 동의한 경우에만'));
    await ctx.close();
  }
  {
    // 일부 참여: 성분 한글명·상품명 12/60 (맞다 10 · 다르다 1 · 모르겠다만 1), 공개 약사 1명 + 비공개 1명
    const st = { names: stat('names', { answered: 12, confirmed: 10, issue: 1, unsure: 1, need_recheck: 2, reviewers: [{ pid: 'P1', name: '홍길동', org: '새봄약국', date: '2026-11-20', n: 12, att: 0 }, { pid: 'P2', name: null, org: null, date: '2026-11-19', n: 5, att: 5 }] }), law: stat('law', {}) };
    const { ctx, page } = await open(browser, 1280, 900, { review: inject(st, '2026-11-21') });
    await toAbout(page);
    const stg = await stages(page); const rev = sq(await page.locator('#about-review').innerText());
    ck('일부 참여: 2단계 "진행 중" · 3단계 "아직", 2단계 아래에 범위별 진행(판정 12/60개 · 맞다 10 · 다르다 1 · 모르겠다만 1 · 다시 확인할 것 2)과 약사법 0/53', stg[1].includes('진행 중') && stg[2].includes('아직')
      && stg[1].includes('성분 한글명·국내 상품명: 판정 12/60개 · 맞다 10 · 다르다 1 · 모르겠다만 1 · 내용이 바뀌어 다시 확인할 것 2') && stg[1].includes('약사법 쉬운 풀이: 판정 0/53개') && !stg[1].includes('모두 판정됨'), stg[1]);
    ck('일부 참여: 확인한 약사 줄에 공개한 이름(소속)과 "비공개 약사 1명", 마지막 면허 확인일, 제목 기준일이 현황의 값(2026-11-21)', rev.includes('확인한 약사: 홍길동(새봄약국), 비공개 약사 1명') && rev.includes('마지막 면허 확인일 2026-11-21') && rev.includes('검수 상태 (2026-11-21 기준)') && !rev.includes('P1') && !rev.includes('P2'), rev.slice(0, 300));
    ck('일부 참여: "아직 하지 못한 것"이 "약사 검수는 일부만 이루어졌습니다"로 바뀌고 "받지 않았습니다" 문장은 없음', rev.includes('약사 검수는 일부만 이루어졌습니다') && !rev.includes('약사 자격자의 검수는 받지 않았습니다'));
    ck('현황이 있어도 1단계 줄(자료 대조)은 그대로이고 단계는 3개', stg.length === 3 && stg[0].startsWith('1단계') && stg[0].includes('약학정보원 대조는 아직입니다'));
    noErr('일부 참여 현황', page); await ctx.close();
  }
  {
    // 성분 범위만 3단계 완료, 약사법은 2단계까지
    const st = { names: stat('names', { answered: 60, confirmed: 60, attested_confirmed: 60, stage2: true, stage3: true, reviewers: [{ pid: 'P1', name: '홍길동', org: null, date: '2026-11-20', n: 60, att: 60 }] }), law: stat('law', { answered: 53, confirmed: 50, issue: 3, stage2: true, reviewers: [{ pid: 'P1', name: '홍길동', org: null, date: '2026-11-20', n: 53, att: 0 }] }) };
    const { ctx, page } = await open(browser, 1280, 900, { review: inject(st, '2026-11-20') });
    await toAbout(page);
    const stg = await stages(page); const rev = sq(await page.locator('#about-review').innerText());
    ck('모든 범위가 판정됨 → 2단계 "했음"(모두 판정됨 표시), 3단계는 성분 범위만 완료라 "진행 중"이고 범위별 확인서 수(60/60 → 완료 · 0/53)가 보임', stg[1].includes('했음') && stg[1].includes('모두 판정됨') && stg[2].includes('진행 중') && stg[2].includes('성분 한글명·국내 상품명: 확인서로 ‘맞다’ 60/60개 → 완료') && stg[2].includes('약사법 쉬운 풀이: 확인서로 ‘맞다’ 0/53개') && !stg[2].includes('모든 항목을 확인서로'), stg);
    ck('소속을 공개하지 않은 약사는 이름만 나옴(홍길동), 현황의 다르다 3개가 약사법 줄에 보임', rev.includes('확인한 약사: 홍길동 ·') && stg[1].includes('약사법 쉬운 풀이: 판정 53/53개 · 맞다 50 · 다르다 3'), rev.slice(0, 250));
    await ctx.close();
  }
  {
    // 모두 완료
    const st = { names: stat('names', { answered: 60, confirmed: 60, attested_confirmed: 60, stage2: true, stage3: true, reviewers: [{ pid: 'P1', name: '홍길동', org: '새봄약국', date: '2026-11-20', n: 60, att: 60 }] }), law: stat('law', { answered: 53, confirmed: 53, attested_confirmed: 53, stage2: true, stage3: true, reviewers: [{ pid: 'P2', name: null, org: null, date: '2026-11-22', n: 53, att: 53 }] }) };
    const { ctx, page } = await open(browser, 1280, 900, { review: inject(st, '2026-11-23') });
    await toAbout(page);
    const stg = await stages(page); const rev = sq(await page.locator('#about-review').innerText());
    ck('모두 완료: 2단계 "했음" · 3단계 "완료"와 "면허를 확인한 약사가 모든 항목을 확인서로 ‘맞다’고 확인했습니다", "받지 않았습니다"·"일부만" 문장 없음, 약사 줄에 홍길동(새봄약국)·비공개 약사 1명', stg[1].includes('했음') && stg[2].includes('완료') && stg[2].includes('모든 항목을 확인서로 ‘맞다’고 확인했습니다') && !rev.includes('약사 자격자의 검수는 받지 않았습니다') && !rev.includes('일부만 이루어졌습니다') && rev.includes('홍길동(새봄약국), 비공개 약사 1명') && rev.includes('검수 상태 (2026-11-23 기준)'), stg[2]);
    ck('모두 완료여도 다른 쪽(자료 대조 한계·약학정보원 미대조)은 그대로 남음', rev.includes('약학정보원(health.kr)·약학정보 책과의 대조는 하지 않았습니다') && rev.includes('식약처(MFDS) 허가 정보와의 대조는 하지 않았습니다'));
    noErr('모두 완료 현황', page); await ctx.close();
  }
  {
    // 이 화면에 있는 범위만: 약무·제도(약사법) 층이 없는 판에서는 성분 범위만 세고 약사법 줄·단추가 없음
    const st = { names: stat('names', { answered: 60, confirmed: 60, attested_confirmed: 60, stage2: true, stage3: true, reviewers: [{ pid: 'P1', name: '홍길동', org: null, date: '2026-11-20', n: 60, att: 60 }] }), law: stat('law', {}) };
    const { ctx, page } = await open(browser, 1280, 900, { noExt: true, review: inject(st, '2026-11-20') });
    await toAbout(page);
    const stg = await stages(page); const sec = sq(await page.locator('#about-pharmacist').innerText()); const all = await page.locator('#panel-about').innerText();
    ck('추가 자료(약사법 층)가 없는 판: 검수 범위는 성분 한글명·상품명뿐(약사법 줄·범위 단추 없음) → 이 범위만 보고 2단계 "했음" · 3단계 "완료"', !stg.join(' ').includes('약사법 쉬운 풀이') && !sec.includes('약사법 쉬운 풀이') && sec.includes('성분 한글명·국내 상품명 60개를') && stg[1].includes('했음') && stg[2].includes('완료'), { stg, sec: sec.slice(0, 160) });
    await page.locator('[data-review-cta]').click(); await page.waitForSelector('[data-review-work]');
    ck('추가 자료가 없는 판: 범위 단추는 하나(성분 한글명·국내 상품명)', (await page.locator('[role="group"][aria-label="검수 범위"] button').count()) === 1 && !(await page.locator('#panel-about').innerText()).includes('약사법 쉬운 풀이 ·'));
    ck('핵심만 있는 판의 데이터·한계 탭에는 "확장"이라는 말이 없음(약사 검수 참여 문구 포함)', !all.includes('확장') && !all.includes('P1'), all.includes('확장'));
    noErr('추가 자료 없는 판', page); await ctx.close();
  }
  for (const [label, rv] of [['검수 자료가 없는 판(window.MEDTERM_REVIEW 없음)', 'none'], ['형식이 다른 검수 자료(schema 99)', { schema: 99, scopes: {}, items: {}, status: {} }], ['망가진 검수 자료(항목 없음)', { schema: 1, scopes: { names: { label: 'x', n: 0, hash: 'a' } }, items: {}, status: {} }]]) {
    const { ctx, page } = await open(browser, 1280, 900, { review: rv, hash: 'review' });
    await page.waitForTimeout(200);
    const stg = await stages(page).catch(() => []);
    ck(`${label}: 참여 카드를 그리지 않고 검수 상태는 예전 모양(3단계 · 2·3단계 아직)이며 오류 없음`, (await page.locator('#about-pharmacist').count()) === 0 && (await page.locator('[data-review-cta]').count()) === 0 && stg.length === 3 && stg[1].includes('아직') && stg[2].includes('아직') && page.errs.length === 0, { stg: stg.length, errs: page.errs.slice(0, 2) });
    await ctx.close();
  }

  /* ───── 9. 화면 폭 · 누르는 면 · 접근성(axe) ───── */
  const VIEWS = [
    { name: '휴대폰 320', w: 320, h: 640, mobile: true, touch: true },
    { name: '휴대폰 390', w: 390, h: 844, mobile: true, touch: true },
    { name: '태블릿 768', w: 768, h: 1024, touch: true },
    { name: '데스크톱 1280', w: 1280, h: 800 },
  ];
  for (const v of VIEWS) {
    for (const scheme of ['light', 'dark']) {
      const { ctx, page } = await open(browser, v.w, v.h, { hash: 'review', scheme, mobile: v.mobile, touch: v.touch });
      await page.waitForSelector('[data-review-work]');
      await page.fill('#rv-name', '접근성약사'); await page.fill('#rv-org', '가나다약국'); await page.check('#rv-lic'); await page.check('#rv-att'); await page.check('#rv-c1'); await page.check('#rv-c2'); await page.check('#rv-ref-other'); await page.fill('#rv-other', '기타 자료');
      const [a, b, c] = NAMES.slice(0, 3).map((i) => i.id);
      await page.check(`#rv-${a}-ok`); await page.check(`#rv-${b}-diff`); await page.fill(`#rv-${b}-m`, '메모'); await page.check(`#rv-${c}-unsure`);
      await page.getByRole('button', { name: '복사하기' }).click(); await page.waitForTimeout(300);
      await page.locator('[data-review-import] summary').click();
      await page.addScriptTag({ content: AXE });
      const tag = `${v.name} · ${scheme === 'light' ? '밝게' : '어둡게'}`;
      const ov = await overflow(page);
      ck(`레이아웃(${tag}): 펼친 참여 화면(판정·확인서·불러오기)에 가로 넘침 없음`, ov.doc === 0 && ov.center === 0, ov);
      if (scheme === 'light') {
        const small = await page.evaluate(() => [...document.querySelectorAll('[data-review-work] button, [data-review-work] summary, [data-review-work] label:has(input[type=radio]), [data-review-work] label:has(input[type=checkbox]), [data-review-work] input:not([type=radio]):not([type=checkbox]), [data-review-work] textarea, #about-pharmacist [data-review-open]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43.5; }).map((e) => `${e.tagName}:${(e.textContent || '').trim().slice(0, 14)}:${Math.round(e.getBoundingClientRect().height)}`));
        ck(`누르는 면(${tag}): 참여 화면의 단추·판정·체크 줄·접기 줄·입력 칸·파일 고르기가 모두 높이 44px 이상`, small.length === 0, small.slice(0, 5));
      }
      const viol = await page.evaluate(axeFn);
      ck(`접근성(${tag}): 펼친 참여 화면(판정·메모·확인서·불러오기) axe 위반 없음`, viol.length === 0, viol.length ? viol : undefined);
      // 약사법 범위 + 처음 닫힌 카드
      await page.getByRole('button', { name: /^약사법 쉬운 풀이/ }).click(); await page.waitForTimeout(100);
      await page.locator('[data-review-item] summary').first().click();
      const viol2 = await page.evaluate(axeFn);
      ck(`접근성(${tag}): 약사법 범위(원문 발췌 펼침) axe 위반 없음`, viol2.length === 0, viol2.length ? viol2 : undefined);
      const ov2 = await overflow(page);
      ck(`레이아웃(${tag}): 약사법 범위에도 가로 넘침 없음`, ov2.doc === 0 && ov2.center === 0, ov2);
      noErr(`화면 폭(${tag})`, page); await ctx.close();
    }
  }
  {
    // 검수 상태 줄(진행 목록·약사 줄)도 접근성 점검
    const st = { names: stat('names', { answered: 12, confirmed: 10, issue: 1, unsure: 1, reviewers: [{ pid: 'P1', name: '홍길동', org: '새봄약국', date: '2026-11-20', n: 12, att: 0 }] }), law: stat('law', {}) };
    for (const scheme of ['light', 'dark']) {
      const { ctx, page } = await open(browser, 390, 844, { scheme, mobile: true, touch: true, review: inject(st, '2026-11-21') });
      await toAbout(page); await page.addScriptTag({ content: AXE });
      const viol = await page.evaluate(axeFn);
      ck(`접근성(휴대폰 390 · ${scheme === 'light' ? '밝게' : '어둡게'}): 현황이 있는 ‘검수 상태’ + 닫힌 참여 카드 axe 위반 없음`, viol.length === 0, viol.length ? viol : undefined);
      await ctx.close();
    }
  }

  await browser.close();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* 임시 폴더 정리 실패는 무시 */ }
  console.log(`\n${total}개 중 ${total - bad}개 통과` + (bad ? `, ${bad}개 실패` : ' — 모두 통과'));
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
