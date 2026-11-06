import { layers, mt, HAS_MPLUS } from '../lib/mt.js';
import { LITE } from '../lib/edition.js';

/*
 * 화면 맨 아래 출처 표기(모든 탭의 끝). 문구는 core.js 의 attribution() 이 만든다:
 *  - NLM 이 요청한 영문 문구는 번역하거나 줄이지 않고 그대로 싣는다(NLM 이름·로고는 쓰지 않는다).
 *  - 출처 이름 목록은 실제로 읽은 자료만 적는다(확장 수록이 없으면 RxNorm 만).
 * role="note" 는 맨 위 면책 안내(Disclaimer)만 쓴다. (<footer> 안에 aria-label 을 달 수 없어 이름 붙은 <section>(region)으로 둔다)
 */
const ATT = mt.attribution();

export function SourceFooter({ onMore }) {
  return (
    <section aria-label="자료 출처 표기" data-source-footer="" className="mt-8 border-t border-line pt-3 text-caption text-mut">
      <p>
        <b className="text-ink">자료 출처</b> — {ATT.sources.join(' · ')}의 공개 자료를 가공했습니다. 원 기관이 보증하지 않으며 최신이 아닐 수 있고, 한글명·상품명은 약사 검수 전 초안입니다.{LITE ? ' 이 공개판에는 SNOMED CT ID와 ATC 영문 분류명을 넣지 않았습니다.' : ' ATC·SNOMED CT의 재배포 조건은 확인 전입니다.'}
        {layers && (layers.hasNew || layers.hasProducts || layers.hasLaw) ? ` 추가 자료: ${[layers.hasNew && `미국 FDA 신약 승인표 · ClinicalTrials.gov(NLM) · PubChem(NCBI/NLM)${HAS_MPLUS ? ' · MedlinePlus(NLM, 링크만)' : ''}`, layers.hasProducts && '건강보험심사평가원 의약품표준코드(제품)', layers.hasLaw && '약사법(국가법령정보센터, 법제처)'].filter(Boolean).join(' · ')}.` : ''}
      </p>
      {/* 손가락으로 누르는 버튼이라 높이 44px 이상(글 속 링크처럼 한 줄 높이로 두지 않는다) */}
      <button type="button" onClick={onMore} className="-ml-1 inline-flex min-h-11 items-center px-1 text-pri underline">출처·이용 조건 자세히</button>
      <p lang="en">{ATT.nlm_en}</p>
    </section>
  );
}
