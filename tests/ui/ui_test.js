
const { JSDOM, VirtualConsole } = require('jsdom'); const path = require('path');
const file = process.env.WEB_INDEX || path.resolve(__dirname, '../../web/index.html');
const all = [];
async function run(mode) {   // wide(≥1100) · tablet(700–1099) · phone(<700): matchMedia를 흉내 낸다(jsdom은 레이아웃을 계산하지 않음)
  const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.message || e).slice(0, 200))); vc.on('error', e => errors.push(String(e).slice(0, 200)));
  const dom = await JSDOM.fromFile(file, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) {
    w.alert = m => errors.push('alert:' + m);
    w.matchMedia = q => ({ matches: (q.includes('1099') && mode !== 'wide') || (q.includes('699') && mode === 'phone'), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  } });
  await new Promise(r => setTimeout(r, 800));
  const w = dom.window, d = w.document; const $ = s => d.querySelector(s), $$ = s => [...d.querySelectorAll(s)];
  const ok = (name, cond, extra) => all.push([cond ? 'PASS' : 'FAIL', `[${mode}] ${name}`, extra || '']);
  const type = (sel, v) => { const e = $(sel); e.value = v; e.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const click = el => (typeof el === 'string' ? $(el) : el).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const vis = el => { for (let n = el; n && n !== d.body; n = n.parentElement) if (n.hidden) return false; return true; };
  const leafOf = id => $$('#tree .leaf').find(b => b.dataset.id === id);
  const body = d.body;
  ok('core loaded', !!w.MedTermCore && !!w.MEDTERM_DATA);
  ok('graph tab exists and shows empty-state before any selection', !!$('[data-tab=graph]') && !!$('#graph-wrap .empty') && !$('#graph-wrap svg'));
  // --- 트리 ---
  ok('ATC tree built (>=20 groups, >=32 leaves)', $$('#tree details').length >= 20 && $$('#tree .leaf').length >= 32, `${$$('#tree details').length} groups, ${$$('#tree .leaf').length} leaves`);
  ok('inspector starts with placeholder', $('#detail').textContent.includes('선택하면'));
  click(leafOf('MT:VTM:7646'));
  ok('tree leaf click fills inspector', $('#detail').textContent.includes('A02BC01') && $('#insp-title').textContent.includes('오메프라졸'));
  ok('leaf marked aria-current', leafOf('MT:VTM:7646').getAttribute('aria-current') === 'true' && $$('[aria-current=true]').length >= 1);
  ok('hash updated', w.location.hash.includes('7646'), w.location.hash);
  type('#tree-filter', 'A02BC'); const shown = $$('#tree .leaf').filter(vis); ok('tree filter A02BC shows 3 ingredients', shown.length === 3, shown.map(b => b.dataset.id).join(','));
  type('#tree-filter', ''); ok('clearing filter restores all leaves', $$('#tree .leaf').filter(vis).length >= 32);
  click('[data-seg=az]'); ok('가나다순 tab swaps lists', $('#tree').hidden && !$('#az').hidden && $$('#az .leaf').length === 32 && $('#az').textContent.includes('와파린'));
  type('#tree-filter', '타이레놀'); ok('az filter by brand finds 아세트아미노펜', $$('#az li').filter(li => !li.hidden).length === 1 && $$('#az li').filter(li => !li.hidden)[0].textContent.includes('아세트아미노펜'));
  type('#tree-filter', ''); click('[data-seg=atc]'); ok('back to ATC tree', !$('#tree').hidden && $('#az').hidden);
  // --- 서랍 동작 ---
  if (mode === 'wide') ok('wide: selecting does not open a drawer', !body.classList.contains('insp-open') && $('#backdrop').hidden);
  else {
    ok('narrow: leaf click opens inspector drawer + backdrop', body.classList.contains('insp-open') && !$('#backdrop').hidden);
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); ok('narrow: Esc closes drawer', !body.classList.contains('insp-open') && $('#backdrop').hidden);
    click(leafOf('MT:VTM:6809')); ok('narrow: reopen', body.classList.contains('insp-open')); click('#insp-close'); ok('narrow: close button closes', !body.classList.contains('insp-open'));
    click(leafOf('MT:VTM:6809')); click('#backdrop'); ok('narrow: backdrop click closes', !body.classList.contains('insp-open') && $('#backdrop').hidden);
    type('#q', '와파린'); ok('narrow: typing an exact search fills inspector without opening drawer', $('#detail').textContent.includes('B01AA03') && !body.classList.contains('insp-open'));
  }
  if (mode === 'phone') {
    click('#nav-toggle'); ok('phone: nav toggle opens tree drawer', body.classList.contains('nav-open') && $('#nav-toggle').getAttribute('aria-expanded') === 'true' && !$('#backdrop').hidden);
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); ok('phone: Esc closes tree drawer', !body.classList.contains('nav-open') && $('#nav-toggle').getAttribute('aria-expanded') === 'false');
    click('#nav-toggle'); click(leafOf('MT:VTM:4278')); ok('phone: picking a leaf closes tree drawer and opens inspector', !body.classList.contains('nav-open') && body.classList.contains('insp-open') && $('#detail').textContent.includes('A02BA03'));
    click('#backdrop'); ok('phone: backdrop closes everything', !body.classList.contains('insp-open') && !body.classList.contains('nav-open') && $('#backdrop').hidden);
  }
  if (mode === 'wide') {   // --- 기존 기능 회귀(검색·검증·질의·정보) ---
    type('#q', '오메프라졸'); ok('search hits for 오메프라졸', $$('#hits .hit').length >= 1);
    ok('exact name hit shows detail', $('#detail').textContent.includes('A02BC01') && $('#detail').textContent.includes('MT:VTM:7646'));
    ok('ATC path chips rendered', $$('#detail .chip').length >= 5, String($$('#detail .chip').length));
    ok('VMP/AMP tree rendered', $$('#detail details').length >= 1 && $('#detail').textContent.includes('Prilosec'));
    type('#q', '6809'); ok('RxCUI search -> metformin', $('#hits').textContent.includes('메트포르민'));
    type('#q', '타이레놀'); ok('Korean brand -> acetaminophen', $('#hits').textContent.includes('아세트아미노펜'));
    type('#q', 'A10BA'); ok('ATC prefix search', $('#hits').textContent.includes('메트포르민'));
    type('#q', '없는약물이름'); ok('no-hit message mentions coverage', $('#hits').textContent.includes('수록'));
    $('#sample').value = '1'; $('#sample').dispatchEvent(new w.Event('change')); click('#run-verify');
    ok('sample 2 -> inconsistent verdict', !!$('#vresult .verdict.inconsistent'));
    ok('error + warn spans highlighted', $$('#vresult .ann .s-error').length >= 2 && $$('#vresult .ann .s-warn').length >= 2);
    $('#sample').value = '0'; $('#sample').dispatchEvent(new w.Event('change')); click('#run-verify');
    ok('sample 1 -> no_conflict verdict with caveat', !!$('#vresult .verdict.no_conflict_found') && $('#vresult .verdict').textContent.includes('보증'));
    $('#vtext').value = '<img src=x onerror="window.__xss=1"><script>window.__xss=2<\/script> 오메프라졸 20mg'; click('#run-verify');
    ok('no HTML injection from input', $$('#vresult img, #vresult script').length === 0 && !w.__xss);
    type('#rq', '오메프라졸과 에스오메프라졸의 ATC 코드는?'); click('#rag-go');
    ok('rag retrieves 2 entries', $$('#rag-out .hit').length >= 2);
    ok('prompt contains dictionary block and rules', $('#rag-out pre').textContent.includes('<사전>') && $('#rag-out pre').textContent.includes('사전에 없어 확인할 수 없음'));
    ok('LLM panel revealed', !$('#rag-llm').hidden);
    click($$('#rag-out .hit')[1]); ok('rag hit click selects entry in inspector', $('#detail').textContent.includes('A02BC05'));
    click('#llm-mock'); click('#rag-verify'); ok('mock answer verified -> inconsistent (ATC mismatch)', !!$('#rag-verify-out .verdict.inconsistent'));
    ok('about tab shows counts and benchmark', $('#about').textContent.includes('516') && $('#about').textContent.includes('11/34'));
    $('[data-tab=verify]').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); ok('tab switch hides search', $('#tab-search').hidden && !$('#tab-verify').hidden);
    ok('landmarks present (header, left aside, main, inspector aside)', !!$('header.topbar') && !!$('aside#left') && !!$('main#center') && !!$('aside#inspector'));
  }

  // --- 관계 그래프 ---
  {
    const sib = name => $$('#graph-wrap .gn-sibling').find(g => g.textContent.includes(name));
    const key = (el, k) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    click('[data-seg=atc]'); type('#tree-filter', ''); click(leafOf('MT:VTM:7646')); if (body.classList.contains('insp-open')) d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    click('[data-tab=graph]'); ok('graph tab opens and hides other tabs', !$('#tab-graph').hidden && $('#tab-search').hidden && $('[data-tab=graph]').getAttribute('aria-selected') === 'true');
    ok('graph rendered for omeprazole (svg, center node, group A02BC)', !!$('#graph-wrap svg.graph') && $('#graph-wrap .gn-vtm').textContent.includes('오메프라졸') && $('#graph-wrap .gn-group').textContent.includes('A02BC'));
    ok('graph: 2 siblings (에스오메프라졸, 판토프라졸)', $$('#graph-wrap .gn-sibling').length === 2 && !!sib('에스오메프라졸') && !!sib('판토프라졸'));
    ok('graph: VMP capped at 10 with "외 3개" overflow node, 10 hasVMP edges', $$('#graph-wrap .gn-vmp').length === 10 && $$('#graph-wrap .ge-hasVMP').length === 10 && $$('#graph-wrap .gn-more').some(g => g.textContent.includes('외 3개')), `${$$('#graph-wrap .gn-vmp').length} VMP`);
    ok('graph note shows shown/total counts', $('#graph-note').textContent.includes('같은 세부군 성분 2/2') && $('#graph-note').textContent.includes('제형·용량(VMP) 10/13'), $('#graph-note').textContent);
    ok('graph paths/rects have no NaN', $$('#graph-wrap path').every(p => /^M[\d.]+,[\d.]+ C/.test(p.getAttribute('d')) && !p.getAttribute('d').includes('NaN')) && $$('#graph-wrap rect').every(r => +r.getAttribute('width') > 0 && +r.getAttribute('height') > 0));
    ok('graph has tooltips and accessible names on nodes', $$('#graph-wrap .gn').every(g => g.querySelector('title') && g.getAttribute('aria-label')) && $$('#graph-wrap .clickable').every(g => g.getAttribute('role') === 'button' && g.getAttribute('tabindex') === '0'));
    click(sib('에스오메프라졸')); ok('graph: clicking a sibling re-centers graph and updates inspector', $('#graph-wrap .gn-vtm').textContent.includes('에스오메프라졸') && $('#detail').textContent.includes('A02BC05') && $('#graph-title').textContent.includes('에스오메프라졸'));
    ok('graph: navigating from the graph does not open the drawer on narrow screens', !body.classList.contains('insp-open'));
    const target = sib('오메프라졸'); ok('graph: sibling 오메프라졸 found after navigating to 에스오메프라졸', !!target && !target.textContent.includes('에스오'), target ? target.textContent : 'missing'); key(target, 'Enter'); ok('graph: Enter on a sibling navigates (keyboard)', $('#graph-wrap .gn-vtm').textContent.includes('오메프라졸') && !$('#graph-wrap .gn-vtm').textContent.includes('에스오'));
    ok('graph: center node receives focus after navigation', d.activeElement === $('#graph-wrap .gn-vtm'));
    click('#graph-zoom-in'); const W = () => $('#graph-wrap svg.graph').style.width; ok('zoom in: fit → 100%', $('#graph-zoom-label').textContent === '100%' && /px$/.test(W()), W());
    click('#graph-zoom-in'); ok('zoom in: 125%', $('#graph-zoom-label').textContent === '125%');
    click('#graph-zoom-fit'); ok('zoom fit restores width 100%', $('#graph-zoom-label').textContent === '맞춤' && W() === '100%');
    click('#graph-zoom-out'); ok('zoom out from fit → 75%', $('#graph-zoom-label').textContent === '75%'); click('#graph-zoom-fit');
    click($$('#graph-wrap .gn-group')[0]); ok('graph: clicking ATC group filters the left tree to 3 ingredients', $('#tree-filter').value === 'A02BC' && !$('#tree').hidden && $$('#tree .leaf').filter(vis).length === 3, `filter=${$('#tree-filter').value}`);
    if (mode === 'phone') ok('graph (phone): group click opens the tree drawer so the result is visible', body.classList.contains('nav-open'));
    if (mode === 'phone') click('#backdrop'); type('#tree-filter', '');
    if (mode === 'wide') { // 32개 성분 전부 그려지는지(오류·NaN 없이)
      click('[data-seg=az]'); const bads = []; $$('#az .leaf').forEach(b => { click(b); const gv = $('#graph-wrap .gn-vtm'); const s = $('#graph-wrap svg.graph'); if (!gv || !s || !gv.textContent.includes(b.querySelector('b') ? b.querySelector('b').textContent.trim() : '') || /NaN/.test(s.innerHTML)) bads.push(b.dataset.id); });
      ok('graph renders for all 32 ingredients without NaN and with matching center', !bads.length && $$('#az .leaf').length === 32, bads.join(',')); click('[data-seg=atc]');
    }
  }

  ok('no runtime errors', errors.length === 0, errors.join(' || '));
}

async function deepLink() {   // #MT:VTM:… 주소로 열면 해당 성분이 미리 선택되는지
  const { pathToFileURL } = require('url'); const fs = require('fs');
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), { url: pathToFileURL(file).href + '#MT%3AVTM%3A6809', runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true });
  await new Promise(r => setTimeout(r, 900)); const d = dom.window.document;
  all.push([d.querySelector('#detail').textContent.includes('A10BA02') && !!d.querySelector('.leaf[aria-current=true][data-id="MT:VTM:6809"]') ? 'PASS' : 'FAIL', '[wide] deep link #MT:VTM:6809 preselects metformin', '']);
}
(async () => { for (const m of ['wide', 'tablet', 'phone']) await run(m); await deepLink();
  all.forEach(c => console.log(c.join(' | '))); const f = all.filter(c => c[0] === 'FAIL').length; console.log(`\n${all.length - f}/${all.length} checks passed`); process.exit(f ? 1 : 0); })();
