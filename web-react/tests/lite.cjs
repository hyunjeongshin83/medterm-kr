// MedTerm-KR 공개판(lite) 점검(실제 크롬). 외부 주소에 올리는 화면이므로 "뺀다고 한 자료가 정말 없는지"와 "빠진 자리가 깨지지 않는지"를 본다.
// 사용: MEDTERM_DIST=<공개판 dist 폴더> node tests/lite.cjs        (공개판은 build/make_lite.py → MEDTERM_EDITION=lite node build.mjs 로 만든다)
//  1) 파일 점검: 화면 파일 어디에도 SNOMED CT ID(원본 핵심 사전의 66개)와 여러 낱말 ATC 영문 분류명이 없고, noindex 가 있고, 전체판 문구가 없고 공개판 문구가 있다.
//  2) 자료 점검: 핵심 atc·확장 atc_names 비어 있음, snomed_ct 비어 있음, atc_class 없음, 출처 A 없음, edition=lite.
//  3) 화면 점검(오프라인): 탭 8개가 모두 열리고 "undefined·null·[object·NaN" 같은 깨진 글이 없고, 검색·상세·검증·약무·제도가 동작하고, 콘솔 오류·외부 요청이 없다.
//  4) 나란히 보기 페이지: 두 칸(웹앱·휴대폰 틀)이 같은 공개판 화면이고 휴대폰 폭에서는 앱 화면이 바로 열린다.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DIST = process.env.MEDTERM_DIST;
if (!DIST) { console.error('MEDTERM_DIST (공개판 dist 폴더)를 정해 주세요.'); process.exit(2); }
const DATA = path.resolve(ROOT, '..', 'data');
let bad = 0, total = 0;
const ck = (name, ok, extra) => { total++; if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 400) : '')); };

/* ───── 1) 파일 점검 ───── */
const FILES = ['MedTerm-KR_react.html', 'MedTerm-KR_app.html', 'MedTerm-KR_showcase.html', 'pwa/index.html', 'artifact.html', 'showcase_artifact.html'];
const core = JSON.parse(fs.readFileSync(path.join(DATA, 'medterm.json'), 'utf8'));
const ext = JSON.parse(fs.readFileSync(path.join(DATA, 'medterm_ext.json'), 'utf8'));
const snomed = [...new Set(core.concepts.flatMap((c) => (c.snomed_ct || []).map(String)))];
const names = [...new Set([...Object.values(core.atc || {}), ...Object.values((ext.meta || {}).atc_names || {})])];
// 여러 낱말 이름 중 임상시험 제목·제품 성분명 같은 다른 자료에도 평범하게 나오는 것(예: Vitamin K)은 글자 찾기로 구분할 수 없으므로 목록에서 뺀다. 나머지는 어디에도 없어야 한다.
const untouched = ['medterm_new.json', 'medterm_kr_products.json', 'medterm_law.json', 'class_lexicon.json', 'product_lexicon.json'].map((f) => fs.readFileSync(path.join(DATA, f), 'utf8')).join('\n');
const multiAll = names.filter((n) => n.includes(' '));
const multi = multiAll.filter((n) => !untouched.includes(n));
ck('원본에서 뺄 목록을 읽음(SNOMED CT ID 60개 이상, 글자 찾기로 구분되는 여러 낱말 ATC 이름 300개 이상)', snomed.length >= 60 && multi.length >= 300, { snomed: snomed.length, multiAll: multiAll.length, multi: multi.length, excludedOrdinary: multiAll.length - multi.length });
// esbuild 는 한글 같은 비 ASCII 글자를 \uXXXX 로 적어 내보내므로, 한글 문구는 두 가지 모양으로 찾는다.
const uesc = (x) => Array.from(x).map((c) => (c.charCodeAt(0) > 127 ? '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0') : c)).join('').toLowerCase();
const has = (t, x) => t.includes(x) || t.toLowerCase().includes(uesc(x));
for (const f of FILES) {
  const t = fs.readFileSync(path.join(DIST, f), 'utf8');
  const s = snomed.filter((id) => new RegExp('(?<![0-9A-Za-z])' + id + '(?![0-9A-Za-z])').test(t));
  ck(`${f}: SNOMED CT ID 없음`, s.length === 0, s);
  const n = multi.filter((x) => t.includes(x));
  ck(`${f}: 여러 낱말 ATC 영문 분류명 없음`, n.length === 0, n.slice(0, 5));
  ck(`${f}: 전체판 문구('SNOMED CT의 재배포 조건은 확인 전입니다')가 없음`, !has(t, 'SNOMED CT의 재배포 조건은 확인 전입니다'));
  ck(`${f}: 공개판 문구('이 공개판에서 뺀 자료')가 있음`, has(t, '이 공개판에서 뺀 자료'));
  if (!/artifact|showcase_artifact/.test(f)) ck(`${f}: 검색 로봇 색인 금지(noindex) 표시`, /<meta name="robots" content="noindex, nofollow">/.test(t));
}

/* ───── 2~3) 자료·화면 점검 ───── */
const BROKEN = /undefined|\[object|NaN|\bnull\b/;
async function open(browser, file, w, h, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: !!o.mobile, isMobile: !!o.mobile });
  const failed = [];
  await ctx.route(/^(?!file:)/, (r) => { failed.push(r.request().url()); return r.abort(); });
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  page.errs = []; page.failedUrls = failed;
  page.on('pageerror', (e) => page.errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) page.errs.push(m.type() + ': ' + m.text()); });
  await page.goto('file://' + path.join(DIST, file)); await page.waitForSelector(o.wait || '#root > *', { timeout: 20000 }); await page.waitForTimeout(300);
  return { ctx, page };
}
const tabTo = async (page, name) => { await page.getByRole('tab', { name, exact: true }).click(); await page.waitForTimeout(250); };
const bodyText = (page) => page.evaluate(() => document.body.innerText);

(async () => {
  const browser = await chromium.launch();
  {
    const { ctx, page } = await open(browser, 'MedTerm-KR_react.html', 1440, 1000);
    const d = await page.evaluate(() => ({
      coreAtc: Object.keys(MEDTERM_DATA.atc || {}).length,
      snomed: MEDTERM_DATA.concepts.filter((c) => (c.snomed_ct || []).length).length,
      coreCodes: MEDTERM_DATA.concepts.reduce((n, c) => n + (c.atc_codes || []).length, 0),
      extNames: Object.keys((MEDTERM_EXT.meta || {}).atc_names || {}).length,
      atcClass: MEDTERM_EXT.entities.filter((y) => 'atc_class' in y).length,
      extCodes: MEDTERM_EXT.entities.reduce((n, y) => n + (y.atc || []).length, 0),
      srcIds: (MEDTERM_EXT.meta.sources || []).map((s) => s.id).join(''),
      edition: [MEDTERM_DATA.meta.edition, MEDTERM_EXT.meta.edition],
      label: new MedTermCore.MedTerm(MEDTERM_DATA, MEDTERM_CLASSES, MEDTERM_EXT).atcLabel('N02BE'),
    }));
    ck('자료: 핵심 ATC 이름 0 · SNOMED CT 0 · 확장 ATC 이름 0 · atc_class 0 · 출처 A 없음 · edition=lite', d.coreAtc === 0 && d.snomed === 0 && d.extNames === 0 && d.atcClass === 0 && !d.srcIds.includes('A') && d.edition.join() === 'lite,lite' && d.label === null, d);
    ck('자료: ATC 코드 값은 남아 있음(핵심 54개 · 확장 수천 개)', d.coreCodes === 54 && d.extCodes > 3000, { core: d.coreCodes, ext: d.extCodes });

    const title = await page.locator('h1').first().innerText();
    ck('상단에 「공개 미리보기(초안)」 표시', title.includes('공개 미리보기'), title);
    const tabs = await page.getByRole('tab').allInnerTexts();
    ck('탭 8개(앞 두 줄은 분류 트리 보기 전환 탭이 아니면 8개)', tabs.filter((t) => /사전 검색|국내 제품|최신·임상|약무·제도|관계 그래프|답변 검증|근거 기반 질의|데이터·한계/.test(t)).length === 8, tabs);
    for (const name of ['사전 검색', '국내 제품', '최신·임상', '약무·제도', '관계 그래프', '답변 검증', '근거 기반 질의', '데이터·한계']) {
      await tabTo(page, name);
      const t = await bodyText(page);
      ck(`탭 「${name}」: 열림 · 깨진 글(undefined·[object·NaN·null) 없음`, t.length > 300 && !BROKEN.test(t), (t.match(BROKEN) || [''])[0]);
    }
    // 검색 → 상세
    await tabTo(page, '사전 검색');
    const q = page.locator('input[type="search"], input[role="combobox"], #q').first();
    await q.fill('오메프라졸'); await page.waitForTimeout(500);
    const hit = page.getByRole('button', { name: /오메프라졸/ }).first();
    ck('검색 「오메프라졸」 결과가 보임', (await hit.count()) > 0);
    if (await hit.count()) {
      await hit.click(); await page.waitForTimeout(400);
      const t = await bodyText(page);
      ck('상세: 식별자 줄에 SNOMED CT 없음 · ATC 코드가 보임 · 깨진 글 없음', !/SNOMED CT \d/.test(t) && /A02BC0[1-5]/.test(t) && !BROKEN.test(t), (t.match(BROKEN) || [''])[0]);
    }
    // 소개 탭 문구
    await tabTo(page, '데이터·한계');
    const about = await bodyText(page);
    ck('데이터·한계 탭: 「이 공개판에서 뺀 자료」 절이 있고 전체판의 「재배포 조건이 정해지지 않은 자료」 절은 없음', about.includes('이 공개판에서 뺀 자료') && !about.includes('재배포 조건이 정해지지 않은 자료'));
    ck('데이터·한계 탭: 「ATC 코드·분류 이름을 가진 항목 (재배포 조건 미결정)」 줄 없음', !about.includes('재배포 조건 미결정'));
    // 근거 기반 질의 → 사전 근거(프롬프트)에 SNOMED CT ID 값이 없고 ATC 코드가 있음 → 예시 답변(오류 포함) 검증이 공개판 자료로 동작
    await tabTo(page, '근거 기반 질의');
    await page.getByRole('button', { name: '오메프라졸과 에스오메프라졸의 ATC 코드와 단위용량을 알려줘' }).click();
    await page.getByRole('button', { name: '사전에서 근거 찾기' }).click(); await page.waitForTimeout(250);
    const pre = await page.locator('#panel-rag pre').innerText();
    ck('근거 기반 질의: 사전 근거에 ATC 코드는 있고 SNOMED CT ID 값은 없음', /A02BC01/.test(pre) && !/snomed_ct["']?\s*[:：]\s*\[\s*["']?\d/.test(pre) && !/SNOMED CT ID\s*[:：]?\s*\d{6}/.test(pre), pre.slice(0, 120));
    await page.getByRole('button', { name: '예시 답변 넣기(오류 포함)' }).click();
    await page.getByRole('button', { name: '이 답변 검증' }).click(); await page.waitForTimeout(300);
    const vt = await page.locator('#rag-verify-out [role="status"]').innerText().catch(() => '');
    ck('답변 검증: 예시 답변(오류 포함)에서 불일치를 찾음', vt.includes('불일치가 발견되었습니다'), vt.slice(0, 80));
    // 약무·제도
    await tabTo(page, '약무·제도');
    const lt = await bodyText(page);
    ck('약무·제도: 항목이 보임(조제 · 협의회)', /조제/.test(lt) && /협의회/.test(lt));
    ck('화면 전체: 콘솔·페이지 오류 없음, 외부 요청 시도 없음', page.errs.length === 0 && page.failedUrls.length === 0, { errs: page.errs, ext: page.failedUrls });
    await ctx.close();
  }

  /* ───── 4) 나란히 보기 ───── */
  for (const [label, w, h, mobile] of [['컴퓨터 폭(1440)', 1440, 900, false], ['휴대폰 폭(390)', 390, 800, true]]) {
    const { ctx, page } = await open(browser, 'MedTerm-KR_showcase.html', w, h, { mobile, wait: '#sc' });
    await page.waitForTimeout(2500);
    const frames = page.frames().filter((f) => f !== page.mainFrame());
    const texts = [];
    for (const f of frames) { try { texts.push(await f.evaluate(() => document.body ? document.body.innerText.slice(0, 4000) : '')); } catch (e) { texts.push(''); } }
    const lite = texts.filter((t) => t.includes('공개 미리보기')).length;
    ck(`나란히 보기(${label}): 화면 칸이 공개판 화면으로 열림`, lite >= (mobile ? 1 : 2), { frames: frames.length, lite });
    ck(`나란히 보기(${label}): 콘솔·페이지 오류 없음, 외부 요청 시도 없음`, page.errs.length === 0 && page.failedUrls.length === 0, { errs: page.errs.slice(0, 3), ext: page.failedUrls.slice(0, 3) });
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${total - bad}/${total} 통과` + (bad ? ` — ${bad}개 실패` : ''));
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
