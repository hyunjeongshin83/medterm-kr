// "근거 기반 질의" 탭이 만드는 LLM 질의문(리서치용 형식).
//
// - 사전 검색·근거 항목(mt.retrieve · mt.contextFor)과 답변 검증(mt.verify)은 core.js 그대로 쓴다. 여기서는 LLM 에게 보낼 글만 쓴다.
// - 이전 형식(core.js 의 buildGroundedPrompt)은 CLI(bin/medterm.mjs prompt)와 실험 기록(experiments/)이 쓰므로 그대로 둔다.
// - 용도: 약학 용어·분류·식별자·단위용량 규격의 자료 조사. 진단·처방·개인별 복용량·복약 안내 같은 임상 판단은 범위 밖이다.
// - 확장 수록(tier "ext") 항목이 사전근거에 들어간 질의에만 규칙 6)과 확장 안내 줄이 더해진다. 핵심 성분만 쓰는 질의문은 R1 그대로다.
import { META, mt } from './mt.js';

/** 질의문 형식 이름. 형식을 고치면 판(R1→R2)을 올린다. 질의문 첫머리에 같이 적혀, 나중에 어느 형식으로 물었는지 알 수 있다. */
export const RESEARCH_FORMAT = 'MedTerm-KR 리서치 질의 R1';

export const RESEARCH_SYSTEM = [
  '당신은 약무용어 리서치 보조자입니다. 약학 용어·분류(ATC)·식별자(RxCUI, SNOMED CT)·단위용량 규격을 조사하는 일을 돕습니다.',
  '이 질의는 리서치용입니다. 진단·처방·개인별 복용량·복약 지도 같은 임상 판단에는 쓰이지 않으며, 그런 용도로 읽히게 답하지 마세요.',
  '',
  '[근거 규칙]',
  '1) <사전근거>에 적힌 항목(이름, RxCUI, SNOMED CT ID, ATC 코드와 분류명, 단위용량)만 "사전 근거"입니다. 사전 근거를 쓴 문장 끝에는 항목 ID를 [MT:VTM:7646]처럼 붙이세요.',
  '2) <사전근거>에 없는 내용을 쓰려면 먼저 "사전 밖"이라고 밝히고 출처(기관·문서명·연도)를 함께 적으세요. 출처를 댈 수 없으면 쓰지 말고 "확인 필요"로 남기세요. 직접 읽지 않은 문서를 읽은 것처럼 인용하지 마세요.',
  '3) 모르거나 불확실한 것은 추측하지 말고 "확인 필요"라고 쓰세요. "사전에 없음"은 그 약이 존재하지 않는다는 뜻이 아니라 확인이 필요하다는 뜻입니다.',
  '4) 단위용량·제형은 미국 RxNorm 기준이며 국내 허가 규격(식약처)과 다를 수 있다고 반드시 밝히세요. 한글 성분명·상품명은 약사 검수 전 초안이라고 밝히세요.',
  '5) 진단·처방·개인별 복용량·상호작용·금기·병용 판단과 복약 안내는 이 조사의 범위 밖입니다. 질문에 그런 요청이 섞여 있으면 그 부분은 "임상 판단 범위 — 이 조사에서 다루지 않음"으로 표시하고 의사·약사 상담을 안내하세요.',
  '',
  '[답변 형식] 아래 번호와 제목을 그대로 쓰세요.',
  '1. 요약 — 2~3문장.',
  '2. 사전 근거로 확인된 사실 — 항목마다 "내용 [근거 ID]". 사전 근거가 없으면 "없음".',
  '3. 사전 밖 일반 지식 — 출처와 함께. 없으면 "없음".',
  '4. 확인 필요·한계 — 불확실한 점, 사전에 없는 약물·코드, 미국 기준과 국내 기준의 차이.',
  '5. 추가로 확인할 자료 — 어떤 공식 자료(예: 식약처 허가정보·DUR, 약학정보원)를 보면 되는지만 적고, 그 내용은 지어내지 마세요.',
].join('\n');

/** 확장 수록 항목이 사전근거에 들어간 질의에만 붙는 규칙(규칙 5) 다음, 답변 형식 앞). */
const EXT_RULE = '6) tier가 "ext"인 항목은 공개 자료(RxNorm·심평원 약가마스터·Wikidata)로 자동 수집한 확장 수록(약사 검수 전)입니다. 한글 이름과 상품명은 후보이고, kr_listed는 국내 등재 제품 규격일 뿐 용법·용량·허가를 뜻하지 않습니다. 이 항목에서 나온 사실에는 "확장 수록 자료 기준"이라고 밝히세요.';
const withExtRule = (system) => system.replace('\n\n[답변 형식]', `\n${EXT_RULE}\n\n[답변 형식]`);

/**
 * 질문 속에 질의문의 구조 태그(<조사정보>·<사전근거>·<조사질문>, 열고 닫는 것 모두, 공백이 섞인 것 포함)가 있으면
 * 전각 꺾쇠(＜…＞)로 바꾼다. LLM 이 질문 내용을 질의문의 구조(근거 영역·조사 정보)로 읽지 못하게 하려는 것이다.
 * 그 밖의 꺾쇠(예: "혈압 < 90")는 그대로 둔다.
 */
export const neutralizeTags = (s) => String(s).replace(/<\s*(\/?)\s*(조사정보|사전근거|조사질문)\s*>/g, '＜$1$2＞');

/**
 * 리서치용 질의문을 만든다.
 * @param {string} question  사용자가 쓴 질문(구조 태그는 neutralizeTags 로 무력화해 넣는다)
 * @param {string[]} ids     mt.retrieve 가 찾은 성분(VTM) id 목록(비어 있어도 된다)
 * @returns {{system: string, user: string, context: object[]}}
 */
export function buildResearchPrompt(question, ids) {
  const q = neutralizeTags(String(question || '').trim());
  const ctx = mt.contextFor(ids);
  const n = META.counts.VTM;
  const nx = mt.extList.length; // 확장 수록 성분 수(확장 자료가 없으면 0)
  const extUsed = ctx.some((c) => c.tier === 'ext');
  const info = [
    `형식: ${RESEARCH_FORMAT}`,
    `용도: 용어·분류·규격 리서치(임상 판단 아님)`,
    `사전: ${META.name} · 자료 기준 ${META.built_at} · RxNav ${META.rxnav_version || '-'} · 수록 성분 ${n}개`,
    ...(extUsed ? [`확장 수록: 성분 ${nx}개(공개 자료 자동 수집·약사 검수 전) — 이 질의의 사전근거에 포함됨`] : []),
    `출처: ${META.sources.join(' / ')}`,
    '필드: name_ko=한글명 · review_status=draft는 약사 검수 전 · atc=ATC 코드와 4단계 분류명(class4) · unit_strengths_mg_rxnorm_us=미국 RxNorm 단위용량(mg)',
    ...(extUsed ? ['확장 필드: tier=ext는 확장 수록 항목 · kr_listed=심평원 약가마스터 등재 제품 규격(용법·용량·허가가 아님) · brands_ko=품목명에서 자동 추출한 상품명(미검증)'] : []),
  ].join('\n');
  const body = ctx.length
    ? JSON.stringify(ctx, null, 1)
    : `(이 질문과 일치하는 사전 항목이 없습니다. 사전에는 ${n}개 성분${nx ? `(핵심)과 확장 수록 ${nx}개 성분` : ''}만 수록되어 있고 이 질문의 약물은 포함되어 있지 않습니다. 답변 형식 2번은 "없음"으로 쓰고, 사전 밖 내용은 출처를 밝히거나 "확인 필요"로 남기세요.)`;
  const user = `<조사정보>\n${info}\n</조사정보>\n\n<사전근거>\n${body}\n</사전근거>\n\n<조사질문>\n${q}\n</조사질문>`;
  return { system: extUsed ? withExtRule(RESEARCH_SYSTEM) : RESEARCH_SYSTEM, user, context: ctx };
}
