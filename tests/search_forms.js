// 검색 상자 입력 형식 점검(사전 검색이 막히던 곳 5가지) — node tests/search_forms.js
//  ① 분류 별칭(PPI·진통제·항응고제…)  ② ID 형식(MT:VTM:n · [MT:VTM:n] · RxCUI n)  ③ 전각 글자·조합형 한글(NFKC)
//  ④ 사전에 성분이 없는 분류(ACE 억제제·베타차단제)는 "분류는 알지만 성분이 없음"으로 구별  ⑤ 기존 검색 결과는 그대로
const fs = require('fs'); const path = require('path');
const { MedTerm } = require('../web/js/core.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/medterm.json'), 'utf8'));
const cls = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/class_lexicon.json'), 'utf8'));
const mt = new MedTerm(data, cls);

let total = 0, bad = 0;
const ck = (name, ok, extra) => { total++; if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok && extra === undefined ? '' : (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''))); };
const ids = (hits) => hits.map((h) => h.vtm.id);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const OME = 'MT:VTM:7646', ESO = 'MT:VTM:283742', PAN = 'MT:VTM:40790', APAP = 'MT:VTM:161';
const vmpOfApap = data.concepts.find((c) => c.type === 'VMP' && c.ingredient === APAP);
const ampOfApap = data.concepts.find((c) => c.type === 'AMP' && c.ingredient === APAP);

// ── ① 분류 별칭 ──
{
  const h = mt.search('PPI');
  ck('"PPI" → 양성자펌프억제제 성분 3개(오메프라졸·에스오메프라졸·판토프라졸)', same(ids(h).sort(), [OME, ESO, PAN].sort()), ids(h));
  ck('"PPI" 결과의 일치 이유는 "분류: 양성자펌프억제제"', h.every((x) => x.via === '분류: 양성자펌프억제제'), h.map((x) => x.via));
  ck('"PPI" 결과 점수는 95 미만(자동 선택으로 첫 성분이 열리지 않게)', h.every((x) => x.score < 95), h.map((x) => x.score));
  ck('"ppi"(소문자)·"PPI 계열"·"ppi계열" 도 같은 결과', [mt.search('ppi'), mt.search('PPI 계열'), mt.search('ppi계열')].every((r) => same(ids(r).sort(), [OME, ESO, PAN].sort())));
  ck('"양성자 펌프 억제제"(띄어쓰기 다름) 도 같은 결과', same(ids(mt.search('양성자 펌프 억제제')).sort(), [OME, ESO, PAN].sort()));
  ck('"진통제" → 진통제 분류 성분 6개 이상', ids(mt.search('진통제')).length >= 6 && ids(mt.search('진통제')).includes(APAP), ids(mt.search('진통제')));
  ck('"항응고제" → 와파린', ids(mt.search('항응고제')).includes('MT:VTM:11289'), ids(mt.search('항응고제')));
  ck('"스타틴" → 스타틴 3개가 분류로 나옴(이름 포함 일치보다 우선)', (() => { const r = mt.search('스타틴'); return r.length === 3 && r.every((x) => x.via.startsWith('분류')); })(), mt.search('스타틴').map((x) => x.via));
  const sc = mt.searchClass('PPI');
  ck('searchClass("PPI") → 분류 1개, 별칭 "PPI", 성분 3개, ATC A02BC', sc.length === 1 && sc[0].cl.label === '양성자펌프억제제' && sc[0].alias === 'PPI' && sc[0].members.length === 3 && sc[0].cl.atc.includes('A02BC'), sc.map((x) => [x.cl.label, x.alias, x.members.length]));
  ck('searchClass("") · 일반 이름("오메프라졸") 은 분류 없음', mt.searchClass('').length === 0 && mt.searchClass('오메프라졸').length === 0);
  ck('한 글자·두 글자 일반 검색어("정","타","억제")가 분류를 끌어오지 않음', ['정', '타', '억제'].every((q) => mt.searchClass(q).length === 0), ['정', '타', '억제'].map((q) => mt.searchClass(q).length));
  ck('"억제제"(세 글자)는 이름에 억제제가 들어간 분류 여러 개를 점수 순으로 돌려줌', (() => { const r = mt.searchClass('억제제'); return r.length >= 3 && r.every((x, i) => i === 0 || r[i - 1].score >= x.score); })(), mt.searchClass('억제제').map((x) => [x.cl.label, x.score]));
  ck('분류 이름 자체("스타틴(HMG-CoA 환원효소 억제제)")로 찾아도 같은 분류', mt.searchClass('스타틴(HMG-CoA 환원효소 억제제)').some((x) => x.cl.label === '스타틴(HMG-CoA 환원효소 억제제)' && x.members.length === 3));
}

// ── ④ 사전에 성분이 없는 분류 ──
{
  for (const [q, label] of [['ACE 억제제', 'ACE 억제제'], ['ace억제제', 'ACE 억제제'], ['안지오텐신 전환효소 억제제', 'ACE 억제제'], ['베타차단제', '베타차단제']]) {
    const sc = mt.searchClass(q), h = mt.search(q);
    ck(`"${q}" → 분류 "${label}"는 알지만 사전에 성분 0개(성분 목록은 비어 있음)`, sc.length >= 1 && sc[0].cl.label === label && sc[0].members.length === 0 && h.length === 0, { cls: sc.map((x) => [x.cl.label, x.members.length]), hits: h.length });
  }
}

// ── ② ID 형식 ──
{
  const want = (q, id, via) => { const h = mt.search(q); ck(`"${q}" → ${id}만${via ? ` (${via})` : ''}`, h.length === 1 && h[0].vtm.id === id && (!via || h[0].via === via) && h[0].score >= 90, h.map((x) => [x.vtm.id, x.score, x.via])); };
  want('MT:VTM:161', APAP, 'ID 일치');
  want('[MT:VTM:161]', APAP, 'ID 일치');
  want('mt:vtm:161', APAP, 'ID 일치');
  want('  [ MT : VTM : 161 ]  ', APAP, 'ID 일치');
  want('RxCUI 161', APAP);
  want('rxcui:161', APAP);
  want('RxCUI=161', APAP);
  want('161', APAP);
  want('ＭＴ：ＶＴＭ：１６１', APAP, 'ID 일치');       // 전각
  want('［ＭＴ：ＶＴＭ：７６４６］', OME, 'ID 일치');
  want('#v-161', APAP);
  want(`MT:VMP:${vmpOfApap.rxcui}`, APAP, 'VMP ID');
  want(`MT:AMP:${ampOfApap.rxcui}`, APAP, 'AMP ID');
  want(`RxCUI ${ampOfApap.rxcui}`, APAP);               // 제품(AMP) RxCUI 도 소속 성분으로
  ck('여러 ID를 붙여 넣으면 모두 찾음("[MT:VTM:7646], [MT:VTM:283742]")', same(ids(mt.search('[MT:VTM:7646], [MT:VTM:283742]')).sort(), [OME, ESO].sort()), ids(mt.search('[MT:VTM:7646], [MT:VTM:283742]')));
  ck('사전에 없는 ID("MT:VTM:999999")는 결과 없음(= 확인 필요)', mt.search('MT:VTM:999999').length === 0);
  ck('"MT:VTM:abc" · "RxCUI" 같은 불완전한 입력은 오류 없이 결과 없음', mt.search('MT:VTM:abc').length === 0 && mt.search('RxCUI').length === 0);
}

// ── ③ 전각 · 조합형 한글 ──
{
  ck('"ＰＰＩ"(전각) = "PPI"', same(ids(mt.search('ＰＰＩ')).sort(), ids(mt.search('PPI')).sort()) && mt.search('ＰＰＩ').length === 3);
  ck('"ａｓｐｉｒｉｎ"(전각) → 아스피린', ids(mt.search('ａｓｐｉｒｉｎ'))[0] === 'MT:VTM:1191' && mt.search('ａｓｐｉｒｉｎ')[0].score === 100, mt.search('ａｓｐｉｒｉｎ').map((x) => [x.vtm.id, x.score]));
  ck('"A０２ＢＣ"(전각 ATC) → ATC 코드로 찾음', mt.search('Ａ０２ＢＣ').length >= 3 && mt.search('Ａ０２ＢＣ').every((x) => x.via === 'ATC 코드'), mt.search('Ａ０２ＢＣ').map((x) => x.via));
  const nfd = '오메프라졸'.normalize('NFD');
  ck('조합형(NFD) 한글 "오메프라졸" 도 일치 100점', nfd !== '오메프라졸' && mt.search(nfd).length >= 1 && mt.search(nfd)[0].vtm.id === OME && mt.search(nfd)[0].score === 100, mt.search(nfd).map((x) => [x.vtm.id, x.score]));
  ck('이름 가운데 공백이 둘이어도 찾음("바이엘  아스피린")', mt.search('바이엘  아스피린').some((x) => x.vtm.id === 'MT:VTM:1191'), mt.search('바이엘  아스피린').map((x) => x.vtm.id));
  ck('앞뒤 공백·줄바꿈·탭은 무시', same(ids(mt.search(' \t오메프라졸\n')), ids(mt.search('오메프라졸'))));
  ck('null·undefined·숫자 입력도 오류 없이 처리', (() => { try { return mt.search(null).length === 0 && mt.search(undefined).length === 0 && Array.isArray(mt.search(161)); } catch (e) { return String(e); } })());
}

// ── ⑤ 기존 동작 그대로 ──
{
  ck('"오메프라졸" 첫 결과 100점 · "이름 일치"', mt.search('오메프라졸')[0].vtm.id === OME && mt.search('오메프라졸')[0].score === 100 && mt.search('오메프라졸')[0].via === '이름 일치');
  ck('"omeprazole" · "OMEPRAZOLE" 첫 결과 오메프라졸', mt.search('omeprazole')[0].vtm.id === OME && mt.search('OMEPRAZOLE')[0].vtm.id === OME);
  ck('"A02BC01" → 오메프라졸(ATC 코드, 70)', mt.search('A02BC01').some((x) => x.vtm.id === OME && x.score === 70 && x.via === 'ATC 코드'));
  ck('"타이레놀" → 아세트아미노펜(상품명)', mt.search('타이레놀')[0].vtm.id === APAP);
  ck('"없는약이름xyz" → 결과 없음, 분류도 없음', mt.search('없는약이름xyz').length === 0 && mt.searchClass('없는약이름xyz').length === 0);
  ck('retrieve 는 분류 별칭을 끌어오지 않음("PPI 계열 약물을 알려줘" → 근거 항목 없음)', mt.retrieve('PPI 계열 약물을 알려줘').length === 0, mt.retrieve('PPI 계열 약물을 알려줘'));
  ck('retrieve 는 질문 속 [MT:VTM:n] 표기를 알아봄', same(mt.retrieve('[MT:VTM:7646] 의 ATC는?'), [OME]), mt.retrieve('[MT:VTM:7646] 의 ATC는?'));
  ck('옵션 {classes:false} 이면 분류를 보지 않음', mt.search('PPI', { classes: false }).length === 0);
}

console.log(`\n${total}개 중 ${total - bad}개 통과` + (bad ? `, ${bad}개 실패` : ' — 모두 통과'));
process.exit(bad ? 1 : 0);
