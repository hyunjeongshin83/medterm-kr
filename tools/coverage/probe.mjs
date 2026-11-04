// MedTerm-KR 수록 범위 표본 점검 — 공개 API(RxNav, PubChem)에 성분 이름을 소량 조회해 "잡히는지"만 확인한다.
// 대량 수집이 아니다(약 50개 이름, 초당 4회 안팎). 결과는 results.json 에 저장한다.
import { writeFileSync } from 'node:fs';

const UA = 'medterm-kr-coverage-check/1.0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    let body = null;
    try { body = await r.json(); } catch { /* 본문이 JSON이 아님 */ }
    return { status: r.status, body };
  } catch (e) {
    return { status: 0, body: null, error: String(e && e.message || e) };
  }
}

// 세트 1: 벤치마크 보류2(사전 밖 실존 약물 34개)의 한글 이름과 영문 성분명(영문은 이 점검에서 사람이 붙인 것)
const HELD2 = [
  ['세레콕시브', 'celecoxib'], ['에토리콕시브', 'etoricoxib'], ['메로페넴', 'meropenem'], ['세파졸린', 'cefazolin'],
  ['반코마이신', 'vancomycin'], ['스트렙토마이신', 'streptomycin'], ['클린다마이신', 'clindamycin'], ['리네졸리드', 'linezolid'],
  ['메트로니다졸', 'metronidazole'], ['오셀타미비르', 'oseltamivir'], ['아시클로비르', 'acyclovir'], ['발라시클로비르', 'valacyclovir'],
  ['테노포비르', 'tenofovir'], ['라미부딘', 'lamivudine'], ['지도부딘', 'zidovudine'], ['리툭시맙', 'rituximab'],
  ['트라스투주맙', 'trastuzumab'], ['베바시주맙', 'bevacizumab'], ['이마티닙', 'imatinib'], ['게피티닙', 'gefitinib'],
  ['에를로티닙', 'erlotinib'], ['소라페닙', 'sorafenib'], ['수니티닙', 'sunitinib'], ['인플릭시맙', 'infliximab'],
  ['아달리무맙', 'adalimumab'], ['덱사메타손', 'dexamethasone'], ['베타메타손', 'betamethasone'], ['트리암시놀론', 'triamcinolone'],
  ['하이드로코르티손', 'hydrocortisone'], ['부데소니드', 'budesonide'], ['플루티카손', 'fluticasone'], ['네비볼롤', 'nebivolol'],
  ['톨터로딘', 'tolterodine'], ['미라베그론', 'mirabegron'],
].map(([ko, en]) => ({ set: 'heldout2', ko, en }));

// 세트 2: 한국 처방·판매 이름이 널리 알려진 성분 중 미국 허가 약이 아닌 것으로 알려진 예시(대표성 없음) + 대조군 3개
const KR = [
  ['레바미피드', 'rebamipide'], ['에페리손', 'eperisone'], ['이토프리드', 'itopride'], ['모사프리드', 'mosapride'],
  ['트리메부틴', 'trimebutine'], ['티아넵틴', 'tianeptine'], ['사르포그렐레이트', 'sarpogrelate'], ['디오스민', 'diosmin'],
  ['콜린알포세레이트', 'choline alfoscerate'], ['티옥트산', 'thioctic acid'], ['레보설피리드', 'levosulpiride'],
  ['아세클로페낙', 'aceclofenac'], ['록소프로펜', 'loxoprofen'], ['잘토프로펜', 'zaltoprofen'], ['펠루비프로펜', 'pelubiprofen'],
  ['오틸로늄브롬화물', 'otilonium bromide'], ['티로프라미드', 'tiropramide'],
].map(([ko, en]) => ({ set: 'kr_sample', ko, en }));
const CONTROL = [['실로스타졸', 'cilostazol'], ['펙소페나딘', 'fexofenadine'], ['오메프라졸', 'omeprazole']]
  .map(([ko, en]) => ({ set: 'control', ko, en }));

const ITEMS = [...HELD2, ...KR, ...CONTROL];
const ING_TTY = new Set(['IN', 'PIN', 'MIN']);

const out = [];
for (const it of ITEMS) {
  const rec = { ...it, rxnorm: { found: false }, pubchem: { found: false } };
  const q = encodeURIComponent(it.en);

  // RxNorm: 이름으로 RxCUI를 찾고, 성분 계열(IN/PIN/MIN)인지 확인한 뒤 ATC 분류를 조회
  const a = await getJson(`https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${q}&search=2`); await sleep(220);
  const ids = a.body && a.body.idGroup && a.body.idGroup.rxnormId;
  rec.rxnorm.status = a.status;
  if (ids && ids.length) {
    const id = ids[0];
    const p = await getJson(`https://rxnav.nlm.nih.gov/REST/rxcui/${id}/properties.json`); await sleep(220);
    const props = p.body && p.body.properties;
    rec.rxnorm = { status: a.status, rxcui: id, tty: props ? props.tty : null, name: props ? props.name : null, found: !!(props && ING_TTY.has(props.tty)) };
    if (rec.rxnorm.found) {
      const c = await getJson(`https://rxnav.nlm.nih.gov/REST/rxclass/class/byRxcui.json?rxcui=${id}&relaSource=ATC`); await sleep(220);
      const list = c.body && c.body.rxclassDrugInfoList && c.body.rxclassDrugInfoList.rxclassDrugInfo;
      rec.rxnorm.atc = list ? [...new Set(list.map((x) => x.rxclassMinConceptItem.classId))] : [];
    }
  }

  // PubChem: 이름으로 화합물 CID 조회(소분자 화합물 DB — 항체의약품은 없을 수 있음)
  const b = await getJson(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${q}/cids/JSON`); await sleep(260);
  const cids = b.body && b.body.IdentifierList && b.body.IdentifierList.CID;
  rec.pubchem = { status: b.status, found: !!(cids && cids.length && cids[0] !== 0), cid: cids && cids[0] };
  out.push(rec);
  process.stdout.write(`${it.set.padEnd(9)} ${it.en.padEnd(20)} RxNorm:${rec.rxnorm.found ? 'Y(' + rec.rxnorm.tty + ',ATC ' + (rec.rxnorm.atc ? rec.rxnorm.atc.length : 0) + ')' : 'N' + (rec.rxnorm.tty ? '[' + rec.rxnorm.tty + ']' : '')}  PubChem:${rec.pubchem.found ? 'Y' : 'N(' + rec.pubchem.status + ')'}\n`);
}

const sum = (set, key, f) => { const xs = out.filter((r) => r.set === set); return `${xs.filter(f).length}/${xs.length}`; };
const summary = {};
for (const s of ['heldout2', 'kr_sample', 'control']) {
  summary[s] = {
    rxnorm_ingredient: sum(s, 'rxnorm', (r) => r.rxnorm.found),
    rxnorm_with_ATC: sum(s, 'rxnorm', (r) => r.rxnorm.found && r.rxnorm.atc && r.rxnorm.atc.length > 0),
    pubchem_compound: sum(s, 'pubchem', (r) => r.pubchem.found),
  };
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify({ checkedAt: new Date().toISOString(), summary, rows: out }, null, 1));
console.log('\nSUMMARY ' + JSON.stringify(summary));
