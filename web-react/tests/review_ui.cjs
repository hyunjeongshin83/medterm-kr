// MedTerm-KR 약사 검수 참여 화면 점검(실제 크롬): 데이터·한계 탭의 ‘약사 검수 참여’(판정 → 확인서 내보내기 → 불러오기·지우기)와 ‘검수 상태’(2·3단계) 표시.
// 사용: node tests/review_ui.cjs [dist 파일명]. 외부 요청은 모두 막고(오프라인) 콘솔 오류·페이지 오류·차단된 요청이 있으면 실패로 센다.
// 기대값은 화면과 따로 얻는다: 항목·내용 표시(h)는 페이지의 window.MEDTERM_REVIEW(빌드가 담은 자료)에서, 내보낸 파일의 규칙 적합성은 운영자 병합 도구(tools/merge_pharmacist_reviews.py --dry-run)로 확인한다.
// 현황 표시(2·3단계)는 빌드가 계산해 담은 값을 보여 줄 뿐이라, 여기서는 그 값을 바꿔 주입(addInitScript)해 화면이 그대로 보여 주는지 본다(계산 자체는 tests/test_review_merge.py 가 본다).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..');
const FILE = process.argv[2] || 'MedTerm-KR_react.html';
const URL = 'file://' + path.join(process.env.MEDTERM_DIST || path.join(ROOT, 'dist'), FILE);
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'medterm-review-ui-'));
const STORE_KEY = 'medterm-kr-review-v1';

let bad = 0, total = 0;
const ck = (name, ok, extra) => { total++; if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); };
const nf = (n) => Number(n).toLocaleString('ko-KR');
const sq = (s) => String(s).replace(/\s+/g, ' ').trim();

/** o: hash · scheme · touch/mobile · noExt(확장·추가 자료 없는 판) · review(주입할 MEDTERM_REVIEW; 'none' 이면 없음) · parseLog · storeFail · noClip · seed(미리 넣을 보관 내용) · perms */
async function open(browser, w, h, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: o.scheme || 'light', hasTouch: !!o.touch, isMobile: !!o.mobile, acceptDownloads: true, permissions: o.perms || [] });
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
  await page.goto(URL + (o.hash ? '#' + o.hash : '')); await page.waitForSelector('#root > *'); await page.waitForTimeout(250);
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
    ck('아무것도 안 채우고 내보내려 하면 빠진 것(이름·면허 표시·판정)을 알리고 확인서를 만들지 않음', ['이름을 적어 주세요', '약사 면허를 가지고 있습니다’에 표시해 주세요', '판정한 항목이 아직 없습니다'].every((t) => p0.includes(t)) && (await page.locator('[data-review-export]').count()) === 0, p0);
    await page.fill('#rv-name', '  홍길동 '); await page.fill('#rv-org', '새봄약국');
    const [a, b, c, d] = NAMES.slice(0, 4).map((i) => i.id);
    await page.check(`#rv-${a}-ok`); await page.check(`#rv-${b}-diff`); await page.fill(`#rv-${b}-m`, '브랜드 철자\n확인 필요'); await page.check(`#rv-${c}-unsure`); await page.fill(`#rv-${c}-m`, '약학정보원에서 못 찾음');
    await page.check(`#rv-${d}-diff`); await page.fill(`#rv-${d}-m`, '지울 메모'); await page.check(`#rv-${d}-ok`);
    ck('판정 표시: 맞다 → 다르다(+메모) → 모르겠다(+메모), 다르다였다가 맞다로 바꾸면 메모 칸이 사라짐 · 진행 "판정 4/60 · 맞다 2 · 다르다 1 · 모르겠다 1"', (await progress(page)) === '판정 4/60 · 맞다 2 · 다르다 1 · 모르겠다 1' && (await page.locator(`#rv-${d}-m`).count()) === 0 && (await page.locator(`[data-review-item="${b}"]`).getAttribute('data-verdict')) === 'diff', await progress(page));
    await page.getByRole('button', { name: '파일로 저장(.json)' }).click();
    ck('이름만 있고 면허 표시가 없으면 아직 내보내지 않음(면허 표시를 요구)', sq(await page.locator('[data-review-problems]').innerText()).includes('약사 면허를 가지고 있습니다’에 표시해 주세요') && !sq(await page.locator('[data-review-problems]').innerText()).includes('이름을 적어'));
    await page.check('#rv-lic');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '파일로 저장(.json)' }).click()]);
    const saved = fs.readFileSync(await dl.path(), 'utf8');
    ck('파일로 저장: 내려받기가 시작되고 파일 이름이 medterm-kr-review-names-날짜.json', /^medterm-kr-review-names-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    const box = await page.locator('#rv-export').inputValue();
    ck('저장한 파일과 화면의 글 상자 내용이 같고(복사가 안 될 때 쓰는 글), 안내 문구(MedIT 담당자에게 보내기 · 면허번호·연락처는 없음)가 있음', saved === box && sq(await page.locator('[data-review-export]').innerText()).includes('이 앱을 알려 드린 MedIT 담당자에게 보내 주세요') && sq(await page.locator('[data-review-export]').innerText()).includes('면허번호·연락처는 들어 있지 않습니다'));
    const J = JSON.parse(saved); EXPORTED = saved;
    const keys = (o) => Object.keys(o).sort().join(',');
    ck('확인서 내용: 형식·범위·범위 해시·앱 판·작성일, 검수자(이름은 앞뒤 공백 정리 · 소속 · 공개 아님 · 면허 표시), 진행 상황 파일(attested false)', J.schema === 'medterm-kr-review/1' && J.scope === 'names' && J.scope_hash === BASE.scopes.names.hash && J.app === VERSION && /^\d{4}-\d{2}-\d{2}$/.test(J.created)
      && keys(J.reviewer) === 'affiliation,license_claimed,name,public' && J.reviewer.name === '홍길동' && J.reviewer.affiliation === '새봄약국' && J.reviewer.public === false && J.reviewer.license_claimed === true && J.attested === false && J.refs.length === 0 && J.refs_other === '', J);
    ck('확인서 내용: 담긴 칸이 정해진 것뿐이고(면허번호·연락처 칸 없음), 판정 3개(4번째는 맞다로 바뀌어 메모 없음)가 항목 id·내용 표시(h)와 함께 들어 있음', keys(J) === 'answers,app,attested,created,refs,refs_other,reviewer,schema,scope,scope_hash'
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
    ck('확인서 글 상자를 보이면서 상태 알림(role=status)이 같은 자리에 있음', (await page.locator('[data-review-msg]').getAttribute('role')) === 'status' && (await page.locator('#rv-export').getAttribute('readonly')) !== null);
    noErr('판정·내보내기', page); await ctx.close();
  }

  /* ───── 4. 약사법 범위 · 키보드 · 다음 항목 · 목록 보기 ───── */
  {
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review' });
    await page.waitForSelector('[data-review-work]');
    await page.fill('#rv-name', '김약사'); await page.check('#rv-lic');
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
    await page.fill('#rv-name', '복사약사'); await page.check('#rv-lic'); await page.check(`#rv-${NAMES[0].id}-ok`);
    await page.getByRole('button', { name: '복사하기' }).click(); await page.waitForTimeout(400);
    const msg = sq(await page.locator('[data-review-msg]').innerText()); const box = await page.locator('#rv-export').inputValue();
    const clip = await page.evaluate(() => (navigator.clipboard && navigator.clipboard.readText ? navigator.clipboard.readText().catch(() => null) : null));
    ck('복사하기: 복사했다는 알림이 나오면 클립보드 내용이 확인서 글과 같고, 못 했다는 알림이면 글 상자가 선택되어 직접 복사할 수 있음', msg.startsWith('복사했습니다') ? clip === box : (msg.startsWith('복사하지 못했습니다') && await page.evaluate(() => { const b = document.getElementById('rv-export'); return document.activeElement === b && b.selectionStart === 0 && b.selectionEnd === b.value.length; })), { msg, same: clip === box });
    noErr('복사(권한 있음)', page); await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review', noClip: true });
    await page.waitForSelector('[data-review-work]');
    await page.fill('#rv-name', '복사약사'); await page.check('#rv-lic'); await page.check(`#rv-${NAMES[0].id}-ok`);
    await page.getByRole('button', { name: '복사하기' }).click(); await page.waitForTimeout(400);
    const msg = sq(await page.locator('[data-review-msg]').innerText());
    ck('클립보드를 못 쓰는 환경(WebView 등): 오류 없이 글 상자를 선택해 복사를 시도하고, 안 되면 직접 복사하라고 알림', (msg.startsWith('복사했습니다') || msg.startsWith('복사하지 못했습니다')) && (await page.locator('#rv-export').count()) === 1, msg);
    noErr('복사(클립보드 없음)', page); await ctx.close();
  }

  /* ───── 6. 이 기기에 보관 · 지우기 · 저장소를 못 쓸 때 ───── */
  {
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review' });
    await page.waitForSelector('[data-review-work]');
    await page.fill('#rv-name', '보관약사'); await page.fill('#rv-org', '보관약국'); await page.check('#rv-lic'); await page.check('#rv-att');
    const [a, b] = NAMES.slice(0, 2).map((i) => i.id);
    await page.check(`#rv-${a}-ok`); await page.check(`#rv-${b}-diff`); await page.fill(`#rv-${b}-m`, '보관되는 메모');
    const raw = await page.evaluate((k) => localStorage.getItem(k), STORE_KEY);
    const S = JSON.parse(raw || '{}');
    ck('입력은 이 기기의 브라우저 보관(localStorage)에 저장되고, 확인서 동의(att)는 저장하지 않음', S.v === 1 && S.rev.name === '보관약사' && S.rev.lic === true && S.att === false && S.ans.names[a].v === 'ok' && S.ans.names[b].m === '보관되는 메모', S);
    await page.evaluate(() => { history.replaceState(null, '', location.pathname); }); await page.reload(); await toAbout(page); await page.waitForTimeout(200);
    ck('다시 열면 "이어서 판정하기" 단추가 나오고, 누르면 이름·소속·면허 표시·판정·메모가 그대로이며 확인서 동의는 다시 표시해야 함', await (async () => {
      const t = (await page.locator('[data-review-open]').innerText()); await page.locator('[data-review-open]').click(); await page.waitForSelector('[data-review-work]');
      return t.includes('이어서 판정하기') && (await page.inputValue('#rv-name')) === '보관약사' && (await page.inputValue('#rv-org')) === '보관약국' && (await page.isChecked('#rv-lic')) && !(await page.isChecked('#rv-att')) && (await progress(page)).startsWith('판정 2/60') && (await page.inputValue(`#rv-${b}-m`)) === '보관되는 메모';
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
    await page.fill('#rv-name', '무저장약사'); await page.check('#rv-lic'); await page.check(`#rv-${NAMES[0].id}-ok`);
    const note = sq(await page.locator('[data-review-saved]').innerText());
    ck('저장소를 못 쓰는 환경: 오류 없이 계속 쓸 수 있고 "이 창을 닫으면 입력이 지워집니다 · 진행 상황 파일로 내보내 두세요" 안내가 나옴', note.includes('저장을 막고 있어 이 창을 닫으면 입력이 지워집니다') && note.includes('진행 상황 파일') && (await progress(page)).startsWith('판정 1/60'), note);
    await page.getByRole('button', { name: '파일로 저장(.json)' }).click();
    ck('저장소를 못 써도 확인서는 내보낼 수 있음', (await page.locator('#rv-export').count()) === 1);
    noErr('저장소 사용 불가', page); await ctx.close();
  }
  {
    // 보관된 값이 낡았거나 깨졌을 때: 내용 표시(h)가 다른 판정은 세지 않고 알림, 이상한 열쇠·값은 무시
    const seed = { v: 1, rev: { name: '낡은약사', org: '', pub: false, lic: true }, refs: ['health.kr', 'evil'], other: '', att: true, scope: 'names',
      ans: { names: { [NAMES[0].id]: { v: 'ok', h: 'ffffffffff' }, [NAMES[1].id]: { v: 'diff', h: NAMES[1].h, m: '살아 있는 메모' }, 'X-bogus': { v: 'ok', h: NAMES[2].h }, [NAMES[3].id]: { v: 'hack', h: NAMES[3].h } }, 'not a scope!': { 'N-1': { v: 'ok', h: 'x' } } } };
    const seedRaw = JSON.stringify(seed).replace('"ans":{"names":{', '"ans":{"names":{"__proto__":{"v":"ok","h":"aaaaaaaaaa"},');
    const { ctx, page } = await open(browser, 1280, 900, { hash: 'review', seedRaw });
    await page.waitForSelector('[data-review-work]');
    ck('낡은·깨진 보관 내용: 내용이 바뀐 항목 1개는 "다시 판정" 알림만 하고 세지 않으며, 맞는 판정 1개만 인정(진행 1/60), 이상한 열쇠·판정값은 무시', (await progress(page)).startsWith('판정 1/60') && sq(await page.locator('[data-review-stale]').innerText()).includes('내용이 바뀐 항목 1개') && (await page.locator(`[data-review-item="${NAMES[1].id}"]`).getAttribute('data-verdict')) === 'diff' && (await page.locator(`[data-review-item="${NAMES[0].id}"]`).getAttribute('data-verdict')) === '' && (await page.locator(`[data-review-item="${NAMES[3].id}"]`).getAttribute('data-verdict')) === '', await progress(page));
    ck('낡은 보관 내용의 확인서 동의(att true)는 되살리지 않고, 알 수 없는 참고 자료 종류는 걸러냄', !(await page.isChecked('#rv-att')) && (await page.isChecked('#rv-ref-health\\.kr')) && (await page.locator('#rv-ref-evil').count()) === 0);
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
    ck('불러와도 면허 표시와 확인서 동의는 가져오지 않음(이 화면에서 직접 다시 표시) — 파일에 attested true 가 있어도 해제 상태', !(await page.isChecked('#rv-lic')) && !(await page.isChecked('#rv-att')) && im.includes('직접 다시 표시'));
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
      await page.fill('#rv-name', '접근성약사'); await page.fill('#rv-org', '가나다약국'); await page.check('#rv-lic'); await page.check('#rv-att'); await page.check('#rv-ref-other'); await page.fill('#rv-other', '기타 자료');
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
