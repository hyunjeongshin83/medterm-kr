// 약사 확인서 동의서 — 문구 · 준비 여부 · 버전의 바탕. 화면(ReviewMode.jsx)과 빌드(build.mjs)가 같은 글을 쓴다.
// 순수 함수만 둔다(브라우저·노드 어디서나 돈다). 동의서에 들어가는 값(보관 기간·국외 이전 안내·연구 정보)과 ‘보내기’ 주소는 web-react/review_intake.json 에 운영자가 적고,
// 빌드가 이 파일로 검사·정리해 화면에 담는다. 값이 비어 있으면 동의서는 ‘준비 안 됨’이고, 앱은 확인서 내보내기·보내기를 막는다(동의 없이 개인정보를 받지 않는다).
// 동의서 버전 = 화면에 보이는 글 전체(문구 + 값)의 해시(빌드가 계산). 글이나 값이 한 글자라도 바뀌면 버전이 바뀌고, 시트 쪽은 다른 버전의 확인서를 받지 않는다.
// 이 글은 초안이다 — 법률 자문이 아니며, 운영자와 IRB(기관생명윤리위원회)가 검토해 확정해야 한다(docs/약사검수_참여_안내.md).

export const CONSENT_SCHEMA = 1;
/** 구글 앱스 스크립트 웹 앱 주소 모양(보내기 주소는 이 모양만 받는다) */
export const EP_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;
const VER_RE = /^c-[0-9a-f]{10}$/;
export const isVersion = (v) => typeof v === 'string' && VER_RE.test(v);

export const LIMIT = { retention: 200, overseas: 800, responsible: 80, researchRetention: 200, irb: 80 };
const KEYS = ['endpoint', 'retention', 'overseas', 'research'];
const RKEYS = ['responsible', 'retention', 'irb'];

// 보이지 않는 글자·제어 문자는 공백으로(화면·확인서와 같은 규칙), 줄바꿈은 공백 하나로
const BAD = new RegExp('[' + [[0, 31], [127, 127], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2069], [0xfeff, 0xfeff]].map(([a, b]) => String.fromCharCode(a) + (b > a ? '-' + String.fromCharCode(b) : '')).join('') + ']', 'g');
const tidy = (s) => String(s == null ? '' : s).normalize('NFC').replace(BAD, ' ').replace(/\s+/g, ' ').trim();
const len = (s) => Array.from(s).length;

/**
 * review_intake.json 의 값을 검사·정리한다. 돌려주는 값: { cfg: { retention, overseas, research: { responsible, retention, irb } }, endpoint }
 * strict(빌드): 모르는 칸 이름·글자 수 초과·잘못된 주소는 오류로 멈춘다(법적 문구를 조용히 자르지 않는다). strict 가 아니면(화면): 넘치는 글은 자르고 잘못된 주소는 비운다.
 */
export function normalizeIntake(raw, { strict = false } = {}) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  if (strict) {
    const bad = Object.keys(o).filter((k) => !KEYS.includes(k) && !k.startsWith('_'));
    if (bad.length) throw new Error(`review_intake.json 에 모르는 칸이 있습니다: ${bad.join(', ')} (쓸 수 있는 칸: ${KEYS.join(', ')})`);
  }
  const text = (v, max, name) => {
    if (v != null && typeof v !== 'string') { if (strict) throw new Error(`review_intake.json 의 ${name} 는 글자여야 합니다`); return ''; }
    const t = tidy(v);
    if (len(t) > max) { if (strict) throw new Error(`review_intake.json 의 ${name} 가 ${max}자를 넘습니다(${len(t)}자)`); return Array.from(t).slice(0, max).join(''); }
    return t;
  };
  const r = o.research && typeof o.research === 'object' && !Array.isArray(o.research) ? o.research : {};
  if (strict && o.research != null && r !== o.research) throw new Error('review_intake.json 의 research 는 { responsible, retention, irb } 모양이어야 합니다');
  if (strict) {
    const bad = Object.keys(r).filter((k) => !RKEYS.includes(k) && !k.startsWith('_'));
    if (bad.length) throw new Error(`review_intake.json 의 research 에 모르는 칸이 있습니다: ${bad.join(', ')} (쓸 수 있는 칸: ${RKEYS.join(', ')})`);
  }
  const cfg = {
    retention: text(o.retention, LIMIT.retention, 'retention'),
    overseas: text(o.overseas, LIMIT.overseas, 'overseas'),
    research: { responsible: text(r.responsible, LIMIT.responsible, 'research.responsible'), retention: text(r.retention, LIMIT.researchRetention, 'research.retention'), irb: text(r.irb, LIMIT.irb, 'research.irb') },
  };
  let endpoint = '';
  if (o.endpoint != null && typeof o.endpoint !== 'string') { if (strict) throw new Error('review_intake.json 의 endpoint 는 글자여야 합니다'); } else {
    const e = String(o.endpoint == null ? '' : o.endpoint).trim();
    if (e) {
      if (EP_RE.test(e)) endpoint = e;
      else if (strict) throw new Error('review_intake.json 의 endpoint 가 구글 앱스 스크립트 웹 앱 주소(https://script.google.com/macros/s/…/exec)가 아닙니다');
    }
  }
  return { cfg, endpoint };
}

/** 1단계(필수) 동의서를 보여 줄 수 있는가: 보관 기간과 국외 이전 안내가 채워져 있어야 한다. */
export const consentReady = (cfg) => !!(cfg && cfg.retention && cfg.overseas);
/** 2단계(선택, 연구 이용) 동의서를 보여 줄 수 있는가: 연구책임자 · 연구 보유·이용 기간 · IRB 승인 정보가 모두 있어야 한다(없으면 연구 이용은 묻지 않고 ‘동의 안 함’으로 기록한다). */
export const researchOn = (cfg) => !!(cfg && cfg.research && cfg.research.responsible && cfg.research.retention && cfg.research.irb);

/** 화면에 보이는 동의서(글 전체). 이 값 전체가 동의서 버전의 바탕이다. cfg 는 normalizeIntake 가 돌려준 모양. */
export function consentBlocks(cfg) {
  const blocks = [{
    id: 'c1', required: true, title: '개인정보 수집·이용 동의 (필수)',
    intro: '확인서를 내보내거나 보내려면 아래 내용을 읽고 동의해 주세요.',
    items: [
      ['수집하는 항목', '이름, 소속(적은 경우), 약사 면허를 가지고 있다는 표시, 항목별 판정(맞다·다르다·모르겠다)과 메모, 참고한 자료의 종류, 작성일, 앱 판 번호. 면허번호·면허 사본·연락처는 받지 않습니다.'],
      ['수집·이용 목적', 'MedTerm-KR 사전의 성분 한글명·국내 상품명·약사법 쉬운 풀이를 약사가 확인했다는 기록(검수 2·3단계)을 만들고, 운영자(MedIT)가 약사 면허를 따로 확인하는 데 씁니다.'],
      ['보유·이용 기간', cfg.retention],
      ['받는 곳과 보관 장소', '운영자(MedIT)가 받아 운영자의 구글 드라이브에 보관합니다. 약사님이 확인서를 전달할 때(파일을 직접 전달하거나, 이 앱에 보내기 단추가 있으면 그 단추를 누를 때)에만 운영자에게 전달되며, 그 전에는 입력한 내용이 이 기기의 브라우저에만 남습니다.'],
      ['국외 이전 안내', cfg.overseas],
      ['동의하지 않을 권리와 불이익', '동의하지 않으셔도 됩니다. 동의하지 않으면 확인서를 내보내거나 보낼 수 없어 검수에 참여하지 못하며, 사전을 쓰는 데에는 영향이 없습니다.'],
      ['이름·소속 공개', '이름·소속은 위 ‘공개해도 좋습니다’에 표시하신 경우에만 ‘검수 상태’에 나옵니다.'],
      ['삭제 요청', '이 앱을 알려 드린 MedIT 담당자에게 요청하시면 보관된 이름·소속·메모를 지웁니다.'],
    ],
    check: '위 내용을 읽었고, 개인정보 수집·이용에 동의합니다. (필수)',
  }];
  if (researchOn(cfg)) {
    blocks.push({
      id: 'c2', required: false, title: '연구 이용 동의 (선택)',
      intro: '이 항목은 선택입니다. 동의하지 않으셔도 확인서를 보내실 수 있습니다.',
      items: [
        ['연구 목적', 'MedTerm-KR 검수 항목이 얼마나 타당한지 분석하는 연구(항목별 내용타당도 지수(I-CVI), 약사 사이의 일치도 등)에 판정 결과를 이용합니다.'],
        ['이용하는 정보', '판정 결과(맞다·다르다·모르겠다)와 가명 번호. 이름·소속·메모는 분석에 넣지 않습니다.'],
        ['연구책임자', cfg.research.responsible],
        ['연구 자료 보유·이용 기간', cfg.research.retention],
        ['기관생명윤리위원회(IRB) 승인', cfg.research.irb],
        ['동의하지 않을 권리', '연구 이용에 동의하지 않으셔도 검수 참여에는 불이익이 없습니다. 이 경우 판정은 사전 검수에만 쓰이고 연구 분석에서는 빠집니다.'],
        ['철회', '동의한 뒤에도 이 앱을 알려 드린 MedIT 담당자에게 요청하시면 이후 분석에서 뺍니다(이미 발표된 결과는 되돌릴 수 없습니다).'],
      ],
      check: '위 내용을 읽었고, 연구 이용에 동의합니다. (선택)',
    });
  }
  return blocks;
}

/** 동의서 버전을 만들 때 해시할 글(빌드가 sha256 앞 10자리를 ‘c-’ 뒤에 붙인다). 문구·값·검사 방식 번호가 모두 들어 있다. */
export const versionBasis = (cfg) => JSON.stringify({ s: CONSENT_SCHEMA, b: consentBlocks(cfg) });
