
const { JSDOM, VirtualConsole } = require('jsdom'); const path = require('path'); const fs = require('fs');
const file = process.env.WEB_INDEX || path.resolve(__dirname, '../../web/index.html'); const errors = [];
const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.message || e).slice(0, 200))); vc.on('error', e => errors.push(String(e).slice(0, 200)));
JSDOM.fromFile(file, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w){ w.HTMLElement.prototype.scrollIntoView = function(){}; w.alert = m => errors.push('alert:' + m); } }).then(dom => {
  const w = dom.window, d = w.document; const checks = [];
  const ok = (name, cond, extra) => checks.push([cond ? 'PASS' : 'FAIL', name, extra || '']);
  setTimeout(() => {
    const $ = s => d.querySelector(s), $$ = s => [...d.querySelectorAll(s)];
    const type = (sel, v) => { const e = $(sel); e.value = v; e.dispatchEvent(new w.Event('input', { bubbles: true })); };
    const click = sel => $(sel).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('core loaded', !!w.MedTermCore && !!w.MEDTERM_DATA);
    // 1) 검색
    type('#q', '오메프라졸'); const hits = $$('#hits .hit'); ok('search hits for 오메프라졸', hits.length >= 1, hits.map(h => h.textContent.slice(0, 40)).join(' | '));
    ok('exact name hit shows detail', $('#detail').textContent.includes('A02BC01') && $('#detail').textContent.includes('MT:VTM:7646'));
    ok('ATC path chips rendered', $$('#detail .chip').length >= 5, String($$('#detail .chip').length));
    ok('VMP/AMP tree rendered', $$('#detail details').length >= 1 && $('#detail').textContent.includes('Prilosec'));
    type('#q', '6809'); ok('RxCUI search -> metformin', $('#hits').textContent.includes('메트포르민'));
    type('#q', '타이레놀'); ok('Korean brand -> acetaminophen', $('#hits').textContent.includes('아세트아미노펜'));
    type('#q', 'A10BA'); ok('ATC prefix search', $('#hits').textContent.includes('메트포르민'));
    type('#q', '없는약물이름'); ok('no-hit message mentions coverage', $('#hits').textContent.includes('수록'));
    // 2) 답변 검증
    $('#sample').value = '1'; $('#sample').dispatchEvent(new w.Event('change')); click('#run-verify');
    ok('sample 2 -> inconsistent verdict', !!$('#vresult .verdict.inconsistent'));
    ok('error + warn spans highlighted', $$('#vresult .ann .s-error').length >= 2 && $$('#vresult .ann .s-warn').length >= 2, `err=${$$('#vresult .ann .s-error').length} warn=${$$('#vresult .ann .s-warn').length}`);
    $('#sample').value = '0'; $('#sample').dispatchEvent(new w.Event('change')); click('#run-verify');
    ok('sample 1 -> no_conflict verdict with caveat', !!$('#vresult .verdict.no_conflict_found') && $('#vresult .verdict').textContent.includes('보증'));
    // XSS: 입력 HTML이 DOM 요소로 해석되면 안 된다
    $('#vtext').value = '<img src=x onerror="window.__xss=1"><script>window.__xss=2<\/script> 오메프라졸 20mg'; click('#run-verify');
    ok('no HTML injection from input', $$('#vresult img, #vresult script').length === 0 && !w.__xss);
    // 3) 근거 기반 질의
    type('#rq', '오메프라졸과 에스오메프라졸의 ATC 코드는?'); click('#rag-go');
    ok('rag retrieves 2 entries', $$('#rag-out .hit').length >= 2, String($$('#rag-out .hit').length));
    ok('prompt contains dictionary block and rules', $('#rag-out pre').textContent.includes('<사전>') && $('#rag-out pre').textContent.includes('사전에 없어 확인할 수 없음'));
    ok('LLM panel revealed', !$('#rag-llm').hidden);
    click('#llm-mock'); click('#rag-verify'); ok('mock answer verified -> inconsistent (ATC mismatch)', !!$('#rag-verify-out .verdict.inconsistent'));
    // 4) 정보 탭
    ok('about tab shows counts and benchmark', $('#about').textContent.includes('516') && $('#about').textContent.includes('11/34'), '');
    // 5) 탭 전환
    $$('nav button')[1].dispatchEvent(new w.MouseEvent('click', { bubbles: true })); ok('tab switch hides search', $('#tab-search').hidden && !$('#tab-verify').hidden);
    ok('no runtime errors', errors.length === 0, errors.join(' || '));
    checks.forEach(c => console.log(c.join(' | '))); const f = checks.filter(c => c[0] === 'FAIL').length; console.log(`\n${checks.length - f}/${checks.length} checks passed`); process.exit(f ? 1 : 0);
  }, 800);
});
