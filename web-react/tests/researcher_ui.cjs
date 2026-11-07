// MedTerm-KR 연구자 페이지 화면 점검(실제 크롬): 구글 시트 스크립트(tools/google_apps_script/review_inbox.gs)의 ?page=researcher 화면.
// 사용: node tests/researcher_ui.cjs
// 화면과 서버 코드를 모두 진짜로 돌린다: 진짜 앱 스크립트를 가짜 구글 장치(tests/js/review_inbox_harness.js --serve)에 올려 127.0.0.1 의 임시 서버로 열고,
//   화면의 google.script.run 호출만 그 서버의 /__rpc 로 이어 주는 얇은 대역을 끼운다(구글이 하는 일 — 이 대역은 researcherApi 한 가지 이름만 받는다).
// 외부 요청은 모두 막고(오프라인) 콘솔 오류·페이지 오류·차단된 요청·대화상자(alert 등)가 있으면 실패로 센다. 메일 주소는 모두 example.org 가짜 주소다 — 아무것도 실제로 보내지 않는다.
// 인증 번호는 화면에서 알 수 없으므로(메일로만 간다) 시험이 가짜 메일함(/__step dump)에서 읽어 입력한다.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const GS = path.join(REPO, 'tools', 'google_apps_script', 'review_inbox.gs');
const HARNESS = path.join(REPO, 'tests', 'js', 'review_inbox_harness.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'medterm-researcher-ui-'));
const pad2 = (n) => String(n).padStart(2, '0');
const TODAY = (() => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; })();
const PROF = 'prof@example.org', PROF2 = 'prof2@example.org', LAB = 'lab@example.org', OPER = 'report@example.org';
const LONG = 'a-very-long-address-for-overflow-testing-0123456789-abcdef@subdomain.example.org';

let bad = 0, total = 0;
const ck = (name, ok, extra) => { total++; if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); };
const sq = (s) => String(s).replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const axeFn = () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] })
  .then((r) => r.violations.map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length, target: x.nodes[0] ? x.nodes[0].target.join(' ') : '', html: x.nodes[0] ? x.nodes[0].html.replace(/\s+/g, ' ').slice(0, 110) : '' })));

/* 가짜 구글 장치 서버 */
const servers = [];
process.on('exit', () => { for (const s of servers) { try { s.child.kill(); } catch (e) { /* 이미 끝남 */ } } });
function startServer(extraProps = {}) {
  return new Promise((resolve, reject) => {
    const f = path.join(TMP, `scn${servers.length}.json`);
    fs.writeFileSync(f, JSON.stringify({ gs: GS, today: TODAY, props: { SUMMARY_TO: OPER, RESEARCHERS: JSON.stringify([PROF, PROF2]), ...extraProps }, steps: [] }), 'utf8');
    const child = spawn(process.execPath, [HARNESS, '--serve', f, '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '', err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', (d) => { buf += d; const m = buf.match(/"listening":(\d+)/); if (m && !child.__up) { child.__up = true; const srv = { child, port: +m[1], base: `http://127.0.0.1:${m[1]}` }; servers.push(srv); resolve(srv); } });
    child.on('exit', () => { if (!child.__up) reject(new Error('가짜 구글 장치 서버가 시작되지 않았습니다: ' + err.slice(-300))); });
  });
}
const post = async (srv, p, body) => (await fetch(srv.base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
const step = async (srv, body) => (await post(srv, '/__step', body)).r;
const dump = (srv) => step(srv, { do: 'dump' });
const rpc = async (srv, req) => { const o = await post(srv, '/__rpc', { fn: 'researcherApi', args: [JSON.stringify(req)] }); return o.ok ? JSON.parse(o.r) : { error: o.error }; };
async function lastCode(srv, to) {
  const d = await dump(srv); const ms = d.mails.filter((m) => m.to === to);
  if (!ms.length) return '';
  const m = ms[ms.length - 1].body.match(/(?<!\d)(\d{6})(?!\d)/); return m ? m[1] : '';
}
const mailCount = async (srv) => (await dump(srv)).mails.length;

/* google.script.run 대역: researcherApi 만 있다(다른 이름을 부르면 TypeError → 화면 오류로 잡힘) */
const SHIM = `(function () {
  function mk(ok, fail) {
    return {
      withSuccessHandler: function (f) { return mk(f, fail); },
      withFailureHandler: function (f) { return mk(ok, f); },
      researcherApi: function (txt) {
        fetch('/__rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fn: 'researcherApi', args: [txt] }) })
          .then(function (r) { return r.json(); })
          .then(function (j) { if (j.ok) { if (ok) ok(j.r); } else if (fail) fail(new Error(j.error)); })
          .catch(function (e) { if (fail) fail(e); });
      }
    };
  }
  window.google = { script: { run: mk(null, null) } };
})();`;

async function openPage(browser, srv, { w = 390, h = 844, scheme = 'light', mobile = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, isMobile: mobile, hasTouch: mobile, locale: 'ko-KR' });
  const o = { errs: [], blocked: [], dialogs: [], reqs: [], token: '' };
  await ctx.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith(srv.base + '/')) return route.continue(); o.blocked.push(u); return route.abort(); });
  await ctx.addInitScript(SHIM);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') o.errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => o.errs.push('pageerror: ' + e.message));
  page.on('dialog', (d) => { o.dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  page.on('request', (r) => { if (r.url().endsWith('/__rpc')) o.reqs.push(r.postData() || ''); });
  page.on('response', async (r) => { if (r.url().endsWith('/__rpc')) { try { const j = await r.json(); const x = JSON.parse(j.r); if (x && x.token) o.token = x.token; } catch (e) { /* 응답이 아닌 것은 무시 */ } } });
  await page.goto(srv.base + '/?page=researcher', { waitUntil: 'load' });
  await settle(page);
  return Object.assign(o, { ctx, page });
}
const settle = (page) => page.waitForFunction(() => document.body.getAttribute('aria-busy') === 'false', null, { timeout: 8000 });
const live = async (page) => sq(await page.locator('#live').innerText());
const liveCls = (page) => page.locator('#live').getAttribute('class');
const visible = (page, sel) => page.locator(sel).isVisible();
const active = (page) => page.evaluate(() => (document.activeElement && (document.activeElement.id || document.activeElement.tagName)) || '');
const listItems = async (page) => (await page.locator('#list > li').allInnerTexts()).map(sq);
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
async function requestCode(page, email) {
  await page.fill('#email', email); await page.click('#b-code'); await settle(page);
  await page.waitForFunction(() => document.querySelector('#live').textContent.length > 0, null, { timeout: 8000 });
}
async function loginAs(srv, page, email) {
  await requestCode(page, email);
  const code = await lastCode(srv, email);
  await page.fill('#code', code); await page.click('#b-login'); await page.waitForSelector('#s-main:not([hidden])', { timeout: 8000 }); await settle(page);
}
async function axeCheck(page, label) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: AXE });
  const v = await page.evaluate(axeFn);
  ck(`접근성(${label}): axe 위반 없음`, v.length === 0, v.length ? v : undefined);
}
const clean = (name, o) => ck(`${name}: 콘솔 오류·페이지 오류·차단된 외부 요청·대화상자 없음`, !o.errs.length && !o.blocked.length && !o.dialogs.length, { errs: o.errs.slice(0, 3), blocked: o.blocked.slice(0, 3), dialogs: o.dialogs.slice(0, 2) });

(async () => {
  const browser = await chromium.launch();
  const S1 = await startServer();

  /* ── ① 첫 화면 ── */
  {
    const o = await openPage(browser, S1); const { page } = o;
    ck('첫 화면: 제목 · 문서 언어 ko · 휴대폰 화면 설정', (await page.title()) === 'MedTerm-KR 연구자 페이지' && (await page.evaluate(() => document.documentElement.lang)) === 'ko' && (await page.locator('meta[name=viewport]').getAttribute('content')).includes('width=device-width'));
    ck('첫 화면: 본인 확인 칸만 보이고(메일 주소 + 인증 번호 받기) 번호 입력칸·주소 목록은 숨김', (await visible(page, '#s-login')) && (await visible(page, '#f-code')) && !(await visible(page, '#f-login')) && !(await visible(page, '#s-main')));
    ck('첫 화면: 지정된 연구자가 있으면 안내(오류) 글이 없음', (await live(page)) === '', await live(page));
    ck('첫 화면: 안내 글(받게 되는 메일)에 약사 이름·소속·메모가 들어 있지 않다고 밝힘 · 확인서 내용을 보여 주지 않는다고 밝힘', /이름·소속·메모·원본 글은 들어 있지 않습니다/.test(await page.locator('main').innerText()) && /확인서나 분석 내용을 보여 주지 않습니다/.test(await page.locator('main').innerText()));
    ck('첫 화면: 화면 어디에도 운영자 주소 원문(report@…)·연구자 주소가 미리 적혀 있지 않음', !(await page.content()).includes(OPER) && !(await page.content()).includes(PROF) && (await page.inputValue('#email')) === '');
    const sizes = await page.evaluate(() => [...document.querySelectorAll('button, input')].filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return [e.id, Math.round(r.width), Math.round(r.height)]; }));
    ck('첫 화면: 누르는 곳(버튼·입력칸) 높이가 모두 44px 이상', sizes.length >= 2 && sizes.every((s) => s[2] >= 44), sizes);
    for (const w of [320, 360, 390, 768, 1280]) { await page.setViewportSize({ width: w, height: 800 }); ck(`레이아웃(${w}): 가로 넘침 없음`, (await overflow(page)) === 0, await overflow(page)); }
    await page.setViewportSize({ width: 390, height: 844 });
    await axeCheck(page, '휴대폰 390 · 밝게 · 첫 화면');
    clean('첫 화면', o); await o.ctx.close();
  }
  {
    const o = await openPage(browser, S1, { scheme: 'dark' });
    await axeCheck(o.page, '휴대폰 390 · 어둡게 · 첫 화면');
    const bg = await o.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ck('어두운 화면: 바탕이 어두움(prefers-color-scheme: dark 를 따름)', (() => { const m = bg.match(/\d+/g).map(Number); return (m[0] + m[1] + m[2]) / 3 < 80; })(), bg);
    await o.ctx.close();
  }
  {
    const S3 = await startServer({ RESEARCHERS: '' });
    const o = await openPage(browser, S3);
    const t = await live(o.page);
    ck('지정된 연구자가 없으면 첫 화면에 “아직 지정된 연구자가 없습니다” 안내(오류 색)', /아직 지정된 연구자가 없습니다/.test(t) && (await liveCls(o.page)) === 'err', t);
    await axeCheck(o.page, '휴대폰 · 지정된 연구자 없음 안내');
    await o.ctx.close();
  }

  /* ── ② 본인 확인 흐름 ── */
  {
    const o = await openPage(browser, S1); const { page } = o;
    const m0 = await mailCount(S1);
    await requestCode(page, 'stranger@example.org');
    const t1 = await live(page);
    ck('모르는 주소: 번호 입력칸이 열리고 안내 글이 나오지만 메일은 가지 않음', (await visible(page, '#f-login')) && /인증 번호를 보냈습니다/.test(t1) && (await mailCount(S1)) === m0, t1);
    await requestCode(page, PROF);
    const t2 = await live(page);
    ck('지정된 주소: 화면에 나오는 안내 글이 모르는 주소일 때와 글자 하나까지 같음(지정 여부를 화면으로 알 수 없음) · 메일은 1통 감', t1 === t2 && (await mailCount(S1)) === m0 + 1, [t1, t2]);
    ck('번호를 받으면 번호 입력칸으로 초점이 옮겨감', (await active(page)) === 'code', await active(page));
    await axeCheck(page, '휴대폰 · 번호 입력칸 열림');
    await page.fill('#code', '000000'); await page.click('#b-login'); await settle(page);
    const te = await live(page);
    ck('틀린 번호: 오류 안내(“번호가 맞지 않거나”) · 오류 색 · 주소 목록은 안 열림', /번호가 맞지 않거나/.test(te) && (await liveCls(page)) === 'err' && !(await visible(page, '#s-main')), te);
    await axeCheck(page, '휴대폰 · 오류 안내 표시');
    const code = await lastCode(S1, PROF);
    await page.fill('#code', code); await page.keyboard.press('Enter'); await page.waitForSelector('#s-main:not([hidden])', { timeout: 8000 }); await settle(page);
    ck('맞는 번호(Enter 키로 제출): 로그인 화면은 닫히고 주소 화면이 열림 · 제목으로 초점 이동', !(await visible(page, '#s-login')) && (await visible(page, '#s-main')) && (await active(page)) === 'h-main', await active(page));
    ck('로그인 뒤: 접속한 연구자 표시 · 안내 글(“30분이 지나면 닫힙니다”)', (await page.locator('#me').innerText()) === `접속한 연구자: ${PROF}` && /30분이 지나면 닫힙니다/.test(await live(page)), await live(page));
    const items = await listItems(page);
    ck('주소 목록 처음: 운영자 주소는 가려서(re***@example.org) · “운영자 · 지울 수 없음” 표시 · 지우기 버튼 없음 · 원문 주소는 화면에 없음', items.length === 1 && items[0].startsWith('re***@example.org') && /운영자 · 지울 수 없음/.test(items[0]) && (await page.locator('#list button').count()) === 0 && !(await page.content()).includes(OPER), items);
    ck('주소 목록: “연구자가 등록한 주소 0 / 5개”', (await page.locator('#count').innerText()) === '연구자가 등록한 주소 0 / 5개', await page.locator('#count').innerText());
    const ls = await page.evaluate(() => ({ l: localStorage.length, s: sessionStorage.length, c: document.cookie }));
    ck('로그인 표(토큰)를 브라우저 저장소·쿠키에 남기지 않음', ls.l === 0 && ls.s === 0 && ls.c === '', ls);
    await axeCheck(page, '휴대폰 390 · 밝게 · 주소 화면(비어 있음)');

    /* 본인 주소 추가 */
    await page.fill('#new', PROF); await page.click('#b-add'); await settle(page);
    const it2 = await listItems(page);
    ck('본인 주소 추가: 번호 없이 바로 목록에 들어감 · 등록 시각 표시 · 안내 · 입력칸 비움', it2.length === 2 && it2[1].startsWith(PROF) && /등록/.test(it2[1]) && /받는 주소에 추가했습니다/.test(await live(page)) && (await page.inputValue('#new')) === '' && (await liveCls(page)) === 'ok', it2);
    ck('주소 목록: 개수 표시가 1 / 5 로 바뀜 · 지우기 버튼의 이름에 주소가 들어 있음(소리 읽기용)', (await page.locator('#count').innerText()) === '연구자가 등록한 주소 1 / 5개' && (await page.locator('#list button').first().getAttribute('aria-label')) === `${PROF} 지우기`);

    /* 다른 주소 추가(그 주소로 간 번호 필요) */
    const m1 = await mailCount(S1);
    await page.fill('#new', LAB); await page.click('#b-add'); await settle(page);
    ck('다른 주소 추가: 그 주소로 번호가 가고(메일 1통) 번호 입력 양식이 열림 · 추가 양식은 숨김 · 번호칸으로 초점', (await mailCount(S1)) === m1 + 1 && (await visible(page, '#f-verify')) && !(await visible(page, '#f-add')) && (await active(page)) === 'vcode', [await mailCount(S1), await active(page)]);
    ck('그 번호는 그 주소(lab@…)로만 감 · 연구자 주소로는 가지 않음', (await lastCode(S1, LAB)).length === 6 && (await dump(S1)).mails[(await dump(S1)).mails.length - 1].to === LAB);
    await axeCheck(page, '휴대폰 · 다른 주소 번호 입력 양식');
    await page.fill('#vcode', '111111'); await page.click('#b-verify'); await settle(page);
    ck('다른 주소 인증: 틀린 번호는 오류 안내만(목록 그대로)', /번호가 맞지 않거나/.test(await live(page)) && (await listItems(page)).length === 2 && (await visible(page, '#f-verify')), await live(page));
    await page.click('#b-vcancel');
    ck('취소: 추가 양식으로 돌아오고 번호 양식은 숨김 · 입력칸으로 초점', (await visible(page, '#f-add')) && !(await visible(page, '#f-verify')) && (await active(page)) === 'new');
    await page.fill('#new', LAB); await page.click('#b-add'); await settle(page);
    const vc = await lastCode(S1, LAB);
    await page.fill('#vcode', vc); await page.click('#b-verify'); await settle(page);
    const it3 = await listItems(page);
    ck('다른 주소 인증: 맞는 번호를 넣으면 목록에 추가됨 · 추가 양식으로 돌아옴', it3.length === 3 && it3[2].startsWith(LAB) && (await visible(page, '#f-add')) && !(await visible(page, '#f-verify')) && (await page.locator('#count').innerText()) === '연구자가 등록한 주소 2 / 5개', it3);
    ck('서버에 저장된 목록이 화면과 같음(두 주소 · 등록한 연구자 기록)', JSON.stringify((JSON.parse((await dump(S1)).props.RECIPIENTS)).map((r) => [r.a, r.by])) === JSON.stringify([[PROF, PROF], [LAB, PROF]]));
    await axeCheck(page, '휴대폰 390 · 밝게 · 주소 화면(주소 2개)');
    const reqsBefore = o.reqs.length;
    await page.fill('#new', 'not an address'); await page.click('#b-add'); await settle(page);
    ck('이상한 주소: 서버가 “메일 주소 모양이 아닙니다” 로 거절 · 오류 색 · 목록 그대로', /메일 주소 모양이 아닙니다/.test(await live(page)) && (await liveCls(page)) === 'err' && (await listItems(page)).length === 3 && o.reqs.length === reqsBefore + 1, await live(page));
    await page.fill('#new', PROF); await page.click('#b-add'); await settle(page);
    ck('이미 받는 주소: “이미 요약 메일을 받는 주소입니다” 안내', /이미 요약 메일을 받는 주소입니다/.test(await live(page)), await live(page));

    /* 지우기 */
    await page.locator(`button[aria-label="${LAB} 지우기"]`).click(); await settle(page);
    const it4 = await listItems(page);
    ck('지우기: 목록에서 빠짐 · “지웠습니다” 안내 · 입력칸으로 초점이 옮겨감 · 서버 목록도 줄어듦', it4.length === 2 && !it4.some((x) => x.startsWith(LAB)) && /지웠습니다/.test(await live(page)) && (await active(page)) === 'new' && JSON.parse((await dump(S1)).props.RECIPIENTS).length === 1, it4);

    /* 나가기 */
    const tok = o.token;
    await page.click('#b-out'); await page.waitForSelector('#s-login:not([hidden])'); await settle(page);
    ck('나가기: 로그인 화면으로 돌아오고 주소 화면은 숨김 · “나갔습니다.” · 번호칸/입력칸이 비어 있음', !(await visible(page, '#s-main')) && (await visible(page, '#s-login')) && (await live(page)) === '나갔습니다.' && (await page.inputValue('#code')) === '', await live(page));
    const after = await rpc(S1, { op: 'state', token: tok });
    ck('나간 뒤에는 서버에서도 그 토큰이 바로 무효(옛 토큰으로 상태를 물으면 “인증이 끝났습니다”)', tok.length === 48 && after.code === 'auth', after);
    clean('본인 확인 흐름', o); await o.ctx.close();
  }

  /* ── ③ 로그인 표가 끝나는 경우 ── */
  {
    const S = await startServer();
    const o = await openPage(browser, S); const { page } = o;
    await loginAs(S, page, PROF);
    await step(S, { do: 'tick', minutes: 31 });
    await page.fill('#new', LAB); await page.click('#b-add'); await settle(page);
    ck('30분 넘게 안 쓰고 누르면: 로그인 화면으로 돌아오고 “인증이 끝났습니다” 안내 · 주소 화면은 숨김 · 메일 주소 칸으로 초점', !(await visible(page, '#s-main')) && (await visible(page, '#s-login')) && /인증이 끝났습니다/.test(await live(page)) && (await liveCls(page)) === 'err' && (await active(page)) === 'email', await live(page));
    ck('그때 다른 주소로 인증 메일이 새어 나가지 않음(로그인 번호 메일 1통뿐)', (await dump(S)).mails.filter((m) => m.to === LAB).length === 0);
    await loginAs(S, page, PROF);
    await step(S, { do: 'menu', fn: 'removeResearcher', text: PROF });
    await page.fill('#new', LAB); await page.click('#b-add'); await settle(page);
    ck('운영자가 연구자 지정을 취소하면 열려 있던 화면도 다음 누름에서 로그인 화면으로 돌아감', !(await visible(page, '#s-main')) && /인증이 끝났습니다/.test(await live(page)), await live(page));
    await requestCode(page, PROF);
    ck('지정이 취소된 주소는 번호를 요청해도 안내는 같지만 메일이 가지 않음', /인증 번호를 보냈습니다/.test(await live(page)) && (await dump(S)).mails.filter((m) => m.subject.includes('인증 번호')).length === 2, (await dump(S)).mails.length);
    clean('로그인 표 종료', o); await o.ctx.close();
  }

  /* ── ④ 서버 응답이 늦거나 끊길 때 ── */
  {
    const S = await startServer();
    const o = await openPage(browser, S); const { page } = o;
    await loginAs(S, page, PROF);
    await page.route('**/__rpc', async (route) => { await sleep(500); await route.continue(); });
    const n0 = o.reqs.length;
    await page.fill('#new', PROF);
    await page.click('#b-add', { noWaitAfter: true });
    await page.waitForTimeout(80);
    const busy = await page.evaluate(() => ({ b: document.body.getAttribute('aria-busy'), dis: [...document.querySelectorAll('button')].every((x) => x.disabled) }));
    ck('요청이 오가는 동안: 화면이 바쁨 표시(aria-busy) · 모든 버튼이 눌리지 않음(중복 전송 방지)', busy.b === 'true' && busy.dis, busy);
    await page.locator('#b-add').dblclick({ force: true, noWaitAfter: true }).catch(() => {});
    await settle(page);
    ck('버튼을 연달아 눌러도 요청은 한 번만 감 · 끝나면 다시 눌림', o.reqs.length === n0 + 1 && (await page.evaluate(() => [...document.querySelectorAll('button')].every((x) => !x.disabled))) && (await page.evaluate(() => document.body.getAttribute('aria-busy'))) === 'false', [o.reqs.length - n0]);
    await page.unroute('**/__rpc');
    await page.route('**/__rpc', (route) => route.abort());
    await page.fill('#new', LAB); await page.click('#b-add'); await settle(page);
    ck('서버에 연결하지 못하면: “서버에 연결하지 못했습니다” 오류 안내 · 버튼은 다시 눌림(멈추지 않음)', /서버에 연결하지 못했습니다/.test(await live(page)) && (await liveCls(page)) === 'err' && (await page.evaluate(() => [...document.querySelectorAll('button')].every((x) => !x.disabled))), await live(page));
    await page.unroute('**/__rpc');
    await page.route('**/__rpc', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, r: 'not json at all' }) }));
    await page.fill('#new', LAB); await page.click('#b-add'); await settle(page);
    ck('서버가 JSON 이 아닌 글을 돌려주면: “응답을 읽지 못했습니다” 안내 · 화면이 깨지지 않음', /응답을 읽지 못했습니다/.test(await live(page)) && (await visible(page, '#s-main')), await live(page));
    await page.unroute('**/__rpc');
    clean('끊김·늦음', { errs: o.errs.filter((e) => !/Failed to load resource|net::ERR_FAILED/.test(e)), blocked: o.blocked, dialogs: o.dialogs });
    await o.ctx.close();
  }

  /* ── ⑤ 허용 도메인 · 손으로 고친 저장값(주입 시도) · 긴 주소 ── */
  {
    const S = await startServer({ RECIPIENT_DOMAINS: 'example.org' });
    const o = await openPage(browser, S); const { page } = o;
    await loginAs(S, page, PROF);
    ck('운영자가 허용 도메인을 정해 두었으면 주소 화면에 안내(“허용한 도메인의 주소만”)', /운영자가 허용한 도메인의 주소만 추가할 수 있습니다: example\.org/.test(await page.locator('#dom').innerText()) && (await visible(page, '#dom')));
    await page.fill('#new', 'someone@other.net'); await page.click('#b-add'); await settle(page);
    ck('허용되지 않은 도메인의 주소는 거절(“허용한 도메인”) · 메일은 가지 않음', /허용한 도메인/.test(await live(page)) && (await dump(S)).mails.filter((m) => m.to === 'someone@other.net').length === 0, await live(page));
    await o.ctx.close();
  }
  {
    const evil = [
      { a: LONG, by: PROF, at: '2026-11-01 10:00' },
      { a: LAB, by: PROF, at: '<img src=x onerror=window.__x=1>' },
      { a: '<img src=x onerror=window.__x=2>@example.org', by: PROF, at: '' },
      { a: 'ok@example.org', by: '<script>window.__x=3</script>', at: '2026-11-02 09:30' },
      'text', null, { a: 5 },
    ];
    const S = await startServer({ RECIPIENTS: JSON.stringify(evil) });
    const o = await openPage(browser, S, { w: 360, h: 780 }); const { page } = o;
    await loginAs(S, page, PROF);
    const items = await listItems(page);
    ck('손으로 고친(깨진·악의적인) 저장값: 모양이 맞는 주소 3개만 보이고 나머지는 걸러짐', items.length === 4 && items[1].startsWith(LONG) && items[2].startsWith(LAB) && items[3].startsWith('ok@example.org'), items);
    ck('저장된 시각이 날짜 모양이 아니면 표시하지 않음(“등록” 표시는 올바른 두 곳만)', items.filter((x) => /등록/.test(x)).length === 2 && !(await page.content()).includes('<img src=x'), items);
    ck('주입 시도(<img onerror>, <script>)가 실행되지 않음 · 화면 글에도 나타나지 않음', (await page.evaluate(() => typeof window.__x)) === 'undefined' && !/onerror|<script/.test(await page.locator('main').innerText()));
    ck('긴 주소가 있어도 360px 에서 가로 넘침 없음(주소가 줄바꿈됨)', (await overflow(page)) === 0, await overflow(page));
    await axeCheck(page, '휴대폰 360 · 밝게 · 긴 주소·깨진 저장값');
    clean('저장값 방어', o); await o.ctx.close();
  }
  {
    const S = await startServer({ RECIPIENTS: JSON.stringify([{ a: LONG, by: PROF, at: '2026-11-01 10:00' }, { a: LAB, by: PROF, at: '2026-11-03 08:15' }]) });
    for (const [w, h, scheme, mobile] of [[1280, 800, 'light', false], [1280, 800, 'dark', false], [390, 844, 'dark', true]]) {
      const o = await openPage(browser, S, { w, h, scheme, mobile }); const { page } = o;
      await loginAs(S, page, PROF);
      ck(`레이아웃(${w} · ${scheme}): 주소 화면 가로 넘침 없음`, (await overflow(page)) === 0);
      await axeCheck(page, `${w < 600 ? '휴대폰' : 'PC'} ${w} · ${scheme === 'light' ? '밝게' : '어둡게'} · 주소 화면`);
      if (w === 1280 && scheme === 'light') {
        const wide = await page.evaluate(() => document.querySelector('.wrap').getBoundingClientRect().width);
        ck('PC 폭에서는 본문이 640px 안으로 모임(읽기 좋은 줄 길이)', wide <= 640, wide);
        await page.keyboard.press('Tab');
        const outline = await page.evaluate(() => { const e = document.activeElement; const c = getComputedStyle(e); return { id: e.id || e.tagName, w: c.outlineWidth, s: c.outlineStyle }; });
        ck('키보드로 이동하면 초점 표시(두께 3px 윤곽선)가 보임', outline.s !== 'none' && parseFloat(outline.w) >= 3, outline);
      }
      clean(`화면(${w} · ${scheme})`, o); await o.ctx.close();
    }
  }

  await browser.close();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* 임시 폴더 정리 실패는 무시 */ }
  console.log(`\n${total}개 중 ${total - bad}개 통과` + (bad ? `, ${bad}개 실패` : ' — 모두 통과'));
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
